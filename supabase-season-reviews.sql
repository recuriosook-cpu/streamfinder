-- ── Reseñas por temporada ──────────────────────────────────────────────────
--
-- En la ficha de una serie, además de valorar y reseñar la serie entera, se
-- puede ir por temporada: pestañas "Serie · T1 · T2 · … · Especiales", y cada
-- temporada tiene su nota, su reseña y las de la comunidad.
--
-- Tabla aparte, y no una columna `season_number` en `reviews` / `ratings`, a
-- propósito: esas tablas tienen UNIQUE (user_id, media_id, media_type) y todo
-- el código —web y app— escribe con upsert sobre esa clave y lee "mi reseña"
-- con maybeSingle(). Cambiar la clave rompe los guardados, y varias filas por
-- serie hacen fallar la lectura; y las versiones de la app ya instaladas en los
-- teléfonos no se pueden actualizar a la fuerza. Con una tabla nueva, nada de
-- lo que existe cambia: las reseñas y notas de series que ya hay siguen siendo
-- de la serie entera, y las reseñas de temporada no inflan puntos, logros ni
-- rankings salvo donde se sumen a propósito.
--
-- Una fila es la nota de un usuario para una temporada, con reseña opcional:
-- a diferencia de las películas y la serie entera (que tienen `ratings` y
-- `reviews` por separado), acá nota y reseña van juntas. Sin texto es sólo la
-- nota; con texto, además aparece en la lista de reseñas de la temporada.
--
-- La serie es su id de TMDB (el mismo `media_id` de `reviews` con
-- media_type = 'tv'). La temporada, su número: 0 son los "Especiales".
--
-- Lectura pública; cada usuario escribe sólo lo suyo.
--
-- Se puede volver a correr entero: todo es IF NOT EXISTS / OR REPLACE / DROP
-- IF EXISTS.

CREATE TABLE IF NOT EXISTS season_reviews (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  series_id      INTEGER     NOT NULL,
  season_number  INTEGER     NOT NULL CHECK (season_number >= 0),

  -- Copiados de TMDB al guardar, como `reviews.title` / `poster_path`: el
  -- feed, el perfil y las notificaciones los muestran sin pedirle nada a TMDB.
  series_title   TEXT        NOT NULL,
  season_name    TEXT,                   -- "Temporada 2", "Miniserie", "Especiales"
  poster_path    TEXT,                   -- el de la temporada, no el de la serie

  -- De 0,5 a 5 en medias estrellas, igual que `reviews.rating` en producción.
  -- Obligatoria: una fila sin nota no dice nada.
  rating         NUMERIC(2,1) NOT NULL
                 CHECK (rating BETWEEN 0.5 AND 5 AND rating * 2 = trunc(rating * 2)),

  -- NULL = sólo la nota. El tope es regla nueva (las reseñas de hoy no tienen
  -- ninguno): holgado para cualquier reseña real, pero no deja guardar un
  -- libro.
  body           TEXT        CHECK (char_length(body) <= 10000),
  recommended    BOOLEAN     NOT NULL DEFAULT true,
  has_spoiler    BOOLEAN     NOT NULL DEFAULT false,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Una por usuario y temporada: la clave de los upsert de la web y la app.
  UNIQUE (user_id, series_id, season_number)
);

-- Las reseñas y el promedio de una temporada, en la ficha.
CREATE INDEX IF NOT EXISTS season_reviews_season_idx
  ON season_reviews (series_id, season_number, created_at DESC);

-- ── updated_at ────────────────────────────────────────────────────────────
--
-- Función propia y no `handle_updated_at()`, que usa `reviews`: la versión de
-- esa función que está en producción puede no ser la del repo, y un CREATE OR
-- REPLACE acá la pisaría para todas las tablas que la usan.
CREATE OR REPLACE FUNCTION season_reviews_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS season_reviews_updated_at ON season_reviews;
CREATE TRIGGER season_reviews_updated_at
  BEFORE UPDATE ON season_reviews
  FOR EACH ROW EXECUTE FUNCTION season_reviews_touch_updated_at();

-- ── Permisos ──────────────────────────────────────────────────────────────

ALTER TABLE season_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reseñas de temporada visibles para todos" ON season_reviews;
CREATE POLICY "Reseñas de temporada visibles para todos"
  ON season_reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Cada uno crea sus reseñas de temporada" ON season_reviews;
CREATE POLICY "Cada uno crea sus reseñas de temporada"
  ON season_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE con WITH CHECK también: sin eso, alguien podría cambiarle el
-- user_id a una fila suya y "regalársela" a otro.
DROP POLICY IF EXISTS "Cada uno edita sus reseñas de temporada" ON season_reviews;
CREATE POLICY "Cada uno edita sus reseñas de temporada"
  ON season_reviews FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Cada uno borra sus reseñas de temporada" ON season_reviews;
CREATE POLICY "Cada uno borra sus reseñas de temporada"
  ON season_reviews FOR DELETE USING (auth.uid() = user_id);
