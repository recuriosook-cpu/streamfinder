-- ── Índice de búsqueda de títulos ──────────────────────────────────────────
--
-- El buscador de la web y de la app (`/api/search`, ver `lib/search.ts`) busca
-- en dos lados a la vez: en TMDB, como siempre, y acá. Esto existe porque TMDB
-- no tolera errores de tipeo ("Inseption" da cero) y ordena mal: "Forgotten"
-- no trae a "Olvidado" (2017) ni entre los primeros 200, aunque ése es su
-- título en inglés.
--
-- Guarda los títulos que la gente busca de verdad: películas con 20 votos o
-- más y series con 10 o más en TMDB (unos 86.000, medido el 2026-09-24). La
-- cola larga no está y se sigue encontrando por TMDB, sin tolerancia a errores.
--
-- Cada título se guarda con todos sus nombres —el que muestra Glynbox (es-AR),
-- el mexicano, el inglés y el original— normalizados (minúsculas, sin tildes)
-- en `search_title_names`, con un índice de trigramas para la búsqueda
-- aproximada.
--
-- Lo llenan `scripts/sync-search-index.mjs` (la carga completa) y el cron
-- semanal `/api/cron/search-index` (una parte por semana). Los dos escriben con
-- `upsert_search_titles`, con la service role.
--
-- Lectura pública (anon), escritura sólo con la service role key.
--
-- Se puede volver a correr entero: todo es IF NOT EXISTS / OR REPLACE.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Un título: lo que hace falta para mostrarlo en los resultados sin pedirle
-- nada más a TMDB.
CREATE TABLE IF NOT EXISTS search_titles (
  media_type     TEXT        NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id        INTEGER     NOT NULL,
  title          TEXT        NOT NULL,   -- es-AR, el que muestra Glynbox
  original_title TEXT,
  poster_path    TEXT,
  release_date   DATE,                   -- estreno (película) o primera emisión (serie)
  vote_count     INTEGER     NOT NULL DEFAULT 0,
  vote_average   REAL,
  popularity     REAL,
  overview       TEXT,                   -- recortado a 200 caracteres
  -- Los nombres normalizados, para que el ranking sepa si hubo coincidencia
  -- exacta sin otra consulta. Los mismos que `search_title_names`.
  names          TEXT[]      NOT NULL,
  synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (media_type, tmdb_id)
);

-- Un nombre por fila: el índice de trigramas tiene que ver cada título por
-- separado. Con todos pegados en un texto, "word_similarity" encontraría
-- coincidencias que cruzan de un título al otro.
CREATE TABLE IF NOT EXISTS search_title_names (
  media_type TEXT    NOT NULL,
  tmdb_id    INTEGER NOT NULL,
  name       TEXT    NOT NULL,
  PRIMARY KEY (media_type, tmdb_id, name),
  FOREIGN KEY (media_type, tmdb_id) REFERENCES search_titles ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS search_title_names_trgm_idx
  ON search_title_names USING gin (name extensions.gin_trgm_ops);

-- Para el borrado por rango de fechas del cron (`prune_search_titles`).
CREATE INDEX IF NOT EXISTS search_titles_release_idx
  ON search_titles (media_type, release_date);

ALTER TABLE search_titles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_title_names ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Títulos de búsqueda visibles para todos" ON search_titles;
CREATE POLICY "Títulos de búsqueda visibles para todos"
  ON search_titles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Nombres de búsqueda visibles para todos" ON search_title_names;
CREATE POLICY "Nombres de búsqueda visibles para todos"
  ON search_title_names FOR SELECT USING (true);

-- ── Búsqueda ──────────────────────────────────────────────────────────────
--
-- Los candidatos para una búsqueda ya normalizada (la normaliza
-- `lib/search-ranking.ts`, igual que se normalizaron los nombres). Devuelve
-- los que se parecen, ordenados por parecido y, a igual parecido, por votos;
-- el orden final lo decide `lib/search.ts`, mezclando con lo que trae TMDB.
--
-- Dos criterios, los dos resueltos por el índice:
--   name % q    el nombre entero se parece a la búsqueda ("titanc" ~ "titanic")
--   q <% name   la búsqueda aparece, parecida, dentro del nombre
--               ("padrno" ~ "el padrino parte ii")
--
-- Los umbrales salen de probar con las búsquedas fallidas reales: con 0,3 y
-- 0,5 entran todos los errores de tipeo medidos; más bajo empieza a entrar
-- ruido.
--
-- El orden suma el parecido con el nombre entero al parecido con una parte:
-- con una parte sola, "movius" empata con cientos de títulos que dicen
-- "movie", el desempate por votos llena el tope con ésos y "Moebius" queda
-- afuera. Mismo criterio que `puntajeTexto` en `lib/search-ranking.ts`.
CREATE OR REPLACE FUNCTION search_titles_fuzzy(q TEXT, max_results INTEGER DEFAULT 40)
RETURNS TABLE (
  media_type     TEXT,
  tmdb_id        INTEGER,
  title          TEXT,
  original_title TEXT,
  poster_path    TEXT,
  release_date   DATE,
  vote_count     INTEGER,
  vote_average   REAL,
  popularity     REAL,
  overview       TEXT,
  names          TEXT[],
  score          REAL
)
LANGUAGE sql STABLE
SET search_path = public, extensions
SET pg_trgm.similarity_threshold = 0.3
SET pg_trgm.word_similarity_threshold = 0.5
AS $$
  WITH candidatos AS (
    SELECT n.media_type, n.tmdb_id,
           max(greatest(similarity(n.name, q), word_similarity(q, n.name))
               + similarity(n.name, q)) / 2 AS score
    FROM search_title_names n
    WHERE n.name % q OR q <% n.name
    GROUP BY n.media_type, n.tmdb_id
  )
  SELECT t.media_type, t.tmdb_id, t.title, t.original_title, t.poster_path,
         t.release_date, t.vote_count, t.vote_average, t.popularity, t.overview,
         t.names, c.score::REAL
  FROM candidatos c
  JOIN search_titles t USING (media_type, tmdb_id)
  ORDER BY round(c.score::NUMERIC, 2) DESC, t.vote_count DESC
  LIMIT least(max_results, 100);
$$;

GRANT EXECUTE ON FUNCTION search_titles_fuzzy(TEXT, INTEGER) TO anon, authenticated;

-- ── Escritura (sólo service role) ─────────────────────────────────────────
--
-- Guarda un lote de títulos con sus nombres, en una transacción: los nombres
-- viejos de cada título se reemplazan por los nuevos, así un título que cambió
-- de nombre en TMDB no queda encontrable por el anterior.
--
-- `filas` es un array JSON de objetos con las columnas de `search_titles`.
CREATE OR REPLACE FUNCTION upsert_search_titles(filas JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  INSERT INTO search_titles AS t (
    media_type, tmdb_id, title, original_title, poster_path, release_date,
    vote_count, vote_average, popularity, overview, names, synced_at
  )
  SELECT f.media_type, f.tmdb_id, f.title, f.original_title, f.poster_path,
         f.release_date, coalesce(f.vote_count, 0), f.vote_average, f.popularity,
         f.overview, f.names, now()
  FROM jsonb_to_recordset(filas) AS f(
    media_type TEXT, tmdb_id INTEGER, title TEXT, original_title TEXT,
    poster_path TEXT, release_date DATE, vote_count INTEGER, vote_average REAL,
    popularity REAL, overview TEXT, names TEXT[]
  )
  ON CONFLICT (media_type, tmdb_id) DO UPDATE SET
    title          = excluded.title,
    original_title = excluded.original_title,
    poster_path    = excluded.poster_path,
    release_date   = excluded.release_date,
    vote_count     = excluded.vote_count,
    vote_average   = excluded.vote_average,
    popularity     = excluded.popularity,
    overview       = excluded.overview,
    names          = excluded.names,
    synced_at      = now();
  GET DIAGNOSTICS n = ROW_COUNT;

  DELETE FROM search_title_names s
  USING jsonb_to_recordset(filas) AS f(media_type TEXT, tmdb_id INTEGER)
  WHERE s.media_type = f.media_type AND s.tmdb_id = f.tmdb_id;

  INSERT INTO search_title_names (media_type, tmdb_id, name)
  SELECT DISTINCT f.media_type, f.tmdb_id, nombre
  FROM jsonb_to_recordset(filas) AS f(media_type TEXT, tmdb_id INTEGER, names TEXT[]),
       unnest(f.names) AS nombre
  WHERE nombre <> '';

  RETURN n;
END;
$$;

-- Borra los títulos de un tramo de fechas que no aparecieron en la última
-- pasada por ese tramo: los que bajaron del umbral de votos o TMDB borró. Se
-- llama sólo después de recorrer el tramo entero sin errores.
CREATE OR REPLACE FUNCTION prune_search_titles(
  p_media_type TEXT,
  p_desde      DATE,
  p_hasta      DATE,
  p_antes      TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  DELETE FROM search_titles
  WHERE media_type = p_media_type
    AND release_date BETWEEN p_desde AND p_hasta
    AND synced_at < p_antes;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION upsert_search_titles(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION prune_search_titles(TEXT, DATE, DATE, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
