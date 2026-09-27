-- ── Calificación de capítulos ─────────────────────────────────────────────
--
-- En la página de cada temporada, cada capítulo tiene sus estrellas (0,5 a 5,
-- medias incluidas) y muestra el promedio de Glynbox y cuántos votaron. Sólo
-- nota, sin reseña. Aprobado el 2026-09-27.
--
-- Una fila es la nota de un usuario para un capítulo. La serie es su id de
-- TMDB; la temporada y el capítulo, sus números (temporada 0 = Especiales),
-- igual que en `season_reviews`.
--
-- ── Privacidad ─────────────────────────────────────────────────────────────
--
-- Las notas individuales son privadas: cada usuario lee sólo las suyas. Los
-- demás ven únicamente el promedio y la cantidad de votos por capítulo, que
-- salen de `episode_ratings_resumen()`. Si algún día se muestran en perfiles o
-- en el feed, abrir la lectura respetando "Ocultar actividad", como `ratings`.
--
-- ── Puntos ─────────────────────────────────────────────────────────────────
--
-- +1 por capítulo, una sola vez por capítulo, con tope de 10 puntos por día
-- (día calendario de Argentina). Pasado el tope el capítulo queda anotado en
-- `puntos_otorgados` con 0: borrar y volver a calificar otro día no suma.
--
-- La base no sabe cuándo se estrena cada capítulo (eso es de TMDB): que los
-- que no salieron no se califiquen lo controlan la web y la app.
--
-- Correr entero, una vez. Se puede volver a correr: todo es IF NOT EXISTS /
-- OR REPLACE / DROP IF EXISTS.

BEGIN;

-- ── 1. La tabla ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS episode_ratings (
  user_id         UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  series_id       INTEGER      NOT NULL CHECK (series_id > 0),
  season_number   INTEGER      NOT NULL CHECK (season_number >= 0),
  episode_number  INTEGER      NOT NULL CHECK (episode_number >= 0),

  -- Copiados de TMDB al guardar, para que la exportación se lea sola.
  series_title    TEXT         NOT NULL CHECK (char_length(series_title) <= 300),
  episode_name    TEXT                  CHECK (char_length(episode_name) <= 300),

  -- De 0,5 a 5 en medias estrellas, igual que `season_reviews.rating`.
  rating          NUMERIC(2,1) NOT NULL
                  CHECK (rating BETWEEN 0.5 AND 5 AND rating * 2 = trunc(rating * 2)),

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- Una por usuario y capítulo: la clave de los upsert de la web y la app.
  PRIMARY KEY (user_id, series_id, season_number, episode_number)
);

-- Los promedios de una temporada. (Las notas de un usuario ya las cubre la
-- clave primaria, que empieza por user_id.)
CREATE INDEX IF NOT EXISTS episode_ratings_temporada_idx
  ON episode_ratings (series_id, season_number, episode_number);

-- ── 2. updated_at ─────────────────────────────────────────────────────────
-- Función propia y no `handle_updated_at()`, por lo mismo que en
-- season_reviews: no pisar la compartida.

CREATE OR REPLACE FUNCTION episode_ratings_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS episode_ratings_updated_at ON episode_ratings;
CREATE TRIGGER episode_ratings_updated_at
  BEFORE UPDATE ON episode_ratings
  FOR EACH ROW EXECUTE FUNCTION episode_ratings_touch_updated_at();

-- ── 3. Permisos: cada uno lo suyo, y nada más ─────────────────────────────

ALTER TABLE episode_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cada uno ve sus notas de capítulos" ON episode_ratings;
CREATE POLICY "Cada uno ve sus notas de capítulos"
  ON episode_ratings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Cada uno crea sus notas de capítulos" ON episode_ratings;
CREATE POLICY "Cada uno crea sus notas de capítulos"
  ON episode_ratings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- WITH CHECK también en UPDATE: sin eso alguien podría cambiarle el user_id a
-- una fila suya y "regalársela" a otro.
DROP POLICY IF EXISTS "Cada uno edita sus notas de capítulos" ON episode_ratings;
CREATE POLICY "Cada uno edita sus notas de capítulos"
  ON episode_ratings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Cada uno borra sus notas de capítulos" ON episode_ratings;
CREATE POLICY "Cada uno borra sus notas de capítulos"
  ON episode_ratings FOR DELETE USING (auth.uid() = user_id);

-- ── 4. Promedios, para todos ──────────────────────────────────────────────
-- SECURITY DEFINER para poder agregar filas que el que llama no puede leer.
-- Devuelve sólo promedio y cantidad por capítulo: nunca quién votó ni cuánto.
-- Los capítulos sin votos no aparecen (la web y la app no muestran nada).

CREATE OR REPLACE FUNCTION episode_ratings_resumen(p_series_id INTEGER, p_season_number INTEGER)
RETURNS TABLE (episode_number INTEGER, promedio NUMERIC, votos INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.episode_number, round(avg(e.rating), 1), count(*)::INTEGER
  FROM episode_ratings e
  WHERE e.series_id = p_series_id AND e.season_number = p_season_number
  GROUP BY e.episode_number
  ORDER BY e.episode_number
$$;

REVOKE EXECUTE ON FUNCTION episode_ratings_resumen(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION episode_ratings_resumen(INTEGER, INTEGER) TO anon, authenticated;

-- ── 5. Puntos: +1 por capítulo, tope 10 por día ───────────────────────────

-- El motivo nuevo en el CHECK de puntos_otorgados. Se busca la restricción
-- por definición y se reemplaza por la misma lista más 'episodio'. La lista
-- es la de supabase-season-reviews-puntos-2026-09.sql; verificado el
-- 2026-09-27 que la base no tiene otros motivos.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.puntos_otorgados'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ '\mmotivo\M'
  LOOP
    EXECUTE format('ALTER TABLE puntos_otorgados DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE puntos_otorgados ADD CONSTRAINT puntos_otorgados_motivo_check CHECK (motivo IN (
  'vista', 'watchlist', 'resena', 'resena_larga', 'sigue', 'seguido', 'like_recibido',
  'resena_temporada', 'episodio'
));

CREATE OR REPLACE FUNCTION puntos_por_episodio()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inicio_dia TIMESTAMPTZ;
  v_hoy        INTEGER;
BEGIN
  -- Un usuario a la vez: sin esto, dos notas guardadas en el mismo instante
  -- podrían leer las dos "9 de 10" y pasarse del tope.
  PERFORM pg_advisory_xact_lock(hashtext('puntos_episodio:' || NEW.user_id));

  v_inicio_dia := date_trunc('day', now() AT TIME ZONE 'America/Argentina/Buenos_Aires')
                  AT TIME ZONE 'America/Argentina/Buenos_Aires';

  SELECT coalesce(sum(puntos), 0) INTO v_hoy
  FROM puntos_otorgados
  WHERE user_id = NEW.user_id AND motivo = 'episodio' AND created_at >= v_inicio_dia;

  -- Pasado el tope se anota igual, con 0: ese capítulo ya no suma nunca.
  PERFORM otorgar_puntos(NEW.user_id, 'episodio',
                         NEW.series_id || ':' || NEW.season_number || ':' || NEW.episode_number,
                         CASE WHEN v_hoy >= 10 THEN 0 ELSE 1 END);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Un fallo sumando puntos nunca impide guardar la nota.
  RAISE WARNING 'puntos_por_episodio: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS puntos_por_episodio ON episode_ratings;
CREATE TRIGGER puntos_por_episodio AFTER INSERT ON episode_ratings
  FOR EACH ROW EXECUTE FUNCTION puntos_por_episodio();

REVOKE EXECUTE ON FUNCTION puntos_por_episodio() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ── Verificación (solo lectura) ───────────────────────────────────────────
-- Tiene que devolver 8 filas: la tabla con RLS, 4 políticas, la función de
-- promedios con permiso para anon, el trigger de puntos y el CHECK con
-- 'episodio'.

SELECT 'tabla' AS que, relname || ' rls=' || relrowsecurity AS detalle
FROM pg_class WHERE relname = 'episode_ratings'
UNION ALL
SELECT 'política', policyname || ' (' || cmd || ')'
FROM pg_policies WHERE tablename = 'episode_ratings'
UNION ALL
SELECT 'función', 'episode_ratings_resumen anon=' ||
       has_function_privilege('anon', 'episode_ratings_resumen(integer,integer)', 'EXECUTE')
UNION ALL
SELECT 'trigger', tgname || ' en ' || tgrelid::regclass
FROM pg_trigger WHERE tgname = 'puntos_por_episodio'
UNION ALL
SELECT 'motivos', pg_get_constraintdef(oid)
FROM pg_constraint WHERE conname = 'puntos_otorgados_motivo_check';
