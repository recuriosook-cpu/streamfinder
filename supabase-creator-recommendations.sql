-- ── Recomendaciones de creadores ─────────────────────────────────────────
--
-- El bloque "Recomendado por …" de las fichas. Un creador (hoy Fer Lage, más
-- adelante otros) recomienda un título en un video de Instagram; la ficha
-- muestra la portada del video y, al tocarla, el video.
--
-- La portada NO se lee de Instagram en cada visita: las direcciones de imagen
-- de Instagram vencen a los ~4 días y las fichas se cachean una hora en el CDN.
-- Se baja una sola vez con `scripts/import-recommendations.mjs` y queda en el
-- bucket `recommendations` de Storage. Acá se guarda la ruta dentro del bucket,
-- no la URL, así un cambio de dominio de Supabase no obliga a reescribir filas.
--
-- Lectura pública (anon), escritura sólo con la service role key: el script de
-- carga la usa y la service role saltea RLS, así que no hay políticas de
-- escritura.

CREATE TABLE IF NOT EXISTS creators (
  id                 BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name               TEXT        NOT NULL,
  -- Sin @ y en minúsculas. Es la identidad del creador: el script lo usa para
  -- no duplicarlo y la medición lo manda como `creador`.
  instagram_username TEXT        NOT NULL UNIQUE
                                 CHECK (instagram_username = lower(instagram_username)),
  -- Ruta dentro del bucket `recommendations`. NULL = sin avatar (se muestra la inicial).
  avatar_path        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS creator_recommendations (
  id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  creator_id     BIGINT      NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  tmdb_id        INTEGER     NOT NULL,
  media_type     TEXT        NOT NULL CHECK (media_type IN ('movie', 'tv')),
  -- El código del post: lo que va en instagram.com/p/<código>/.
  instagram_code TEXT        NOT NULL UNIQUE,
  -- Ruta dentro del bucket `recommendations`, ej. 'covers/DdkY09zx8Km.jpg'.
  cover_path     TEXT        NOT NULL,
  -- ¿Instagram deja mostrar el post en un iframe? Si no, la web va directo a
  -- Instagram en vez de abrir un modal con el cartel de error. Lo decide el
  -- script: los posts sin portada limpia son los que tienen la inserción
  -- deshabilitada (probado: coinciden los 3 de 162, probablemente por la música).
  embeddable     BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una recomendación por creador y título. Es la clave del upsert del script:
  -- volver a correrlo actualiza la fila en vez de sumar otra.
  UNIQUE (creator_id, media_type, tmdb_id)
);

-- La consulta de la ficha: todas las recomendaciones de un título.
CREATE INDEX IF NOT EXISTS creator_recommendations_media_idx
  ON creator_recommendations (media_type, tmdb_id);

ALTER TABLE creators                ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creadores visibles para todos"
  ON creators FOR SELECT
  USING (true);

CREATE POLICY "Recomendaciones visibles para todos"
  ON creator_recommendations FOR SELECT
  USING (true);

-- Bucket público: las portadas y avatares se sirven por URL directa, sin firma
-- y sin vencimiento. La subida la hace el script con la service role.
INSERT INTO storage.buckets (id, name, public)
VALUES ('recommendations', 'recommendations', true)
ON CONFLICT (id) DO NOTHING;
