-- ⚠️  NO VOLVER A CORRER. Ya se aplicó. La versión vigente de puede_ver_actividad está
-- en supabase-sin-perfil-privado-2026-09.sql (sólo "Ocultar actividad"); correr esto de
-- nuevo le devolvería la rama de "Perfil privado". Queda como registro.

-- ── Notas: media estrella de 0,5, y lectura según la privacidad ────────────
--
-- Dos cambios aprobados el 2026-09-24. Correr entero, una vez; se puede volver
-- a correr sin problema.
--
-- 1. MEDIA ESTRELLA DE 0,5
--
--    `ratings.rating` y `reviews.rating` son numeric(3,1) con CHECK desde 1,
--    pero la web, la app (también las versiones ya instaladas) y el importador
--    de Letterboxd ofrecen 0,5. Hoy un 0,5 se rechaza: en la web "Tu nota" lo
--    muestra como guardado y no lo está, y el importador saltea esas notas y
--    pierde las reseñas que las tienen. Se baja el mínimo a 0,5.
--
--    De paso se exige que sea múltiplo de 0,5, igual que en `season_reviews`.
--    Las 647 notas que hay hoy ya lo cumplen (verificado), así que agregarlo no
--    rechaza nada existente.
--
-- 2. NOTAS VISIBLES PARA LOS DEMÁS, RESPETANDO LA PRIVACIDAD
--
--    `ratings` es de lectura sólo del dueño, y eso rompe el promedio de la
--    ficha, el de la página de cada director, las notas en perfiles ajenos y
--    en el feed. Se abre, pero respetando los dos interruptores de la app:
--
--      - "Ocultar actividad" (hide_activity): "No mostrar qué viste ni qué
--        calificaste". Nadie más ve sus notas.
--      - "Perfil privado" (is_private): "Sólo tus seguidores pueden ver tu
--        perfil". Sólo las ven quienes lo siguen.
--
--    El dueño ve siempre las suyas: la política que ya existe ("Users can
--    read own ratings") no se toca, y las políticas se suman entre sí.
--
--    Consecuencia buscada: el promedio de una ficha no cuenta las notas de
--    quien las ocultó. Con 2 perfiles con algún interruptor prendido, la
--    diferencia hoy es mínima.

BEGIN;

-- ── 1. Mínimo 0,5 ─────────────────────────────────────────────────────────
--
-- Los CHECK actuales no tienen un nombre conocido de antemano: se buscan por
-- definición (los que hablan de `rating`, no el de media_type) y se reemplazan
-- por unos con nombre fijo.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS tabla, conname
    FROM pg_constraint
    WHERE contype = 'c'
      AND conrelid IN ('public.ratings'::regclass, 'public.reviews'::regclass)
      AND pg_get_constraintdef(oid) ~ '\mrating\M'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabla, r.conname);
  END LOOP;
END $$;

ALTER TABLE ratings ADD CONSTRAINT ratings_rating_check
  CHECK (rating >= 0.5 AND rating <= 5 AND rating * 2 = trunc(rating * 2));

-- En `reviews` la nota es opcional: NULL sigue pasando.
ALTER TABLE reviews ADD CONSTRAINT reviews_rating_check
  CHECK (rating >= 0.5 AND rating <= 5 AND rating * 2 = trunc(rating * 2));

-- ── 2. Lectura según la privacidad ────────────────────────────────────────
--
-- La decisión va en una función SECURITY DEFINER y no escrita dentro de la
-- política. Dentro de una política, las consultas a `profiles` y `follows`
-- pasan también por las políticas de esas tablas con los permisos de quien
-- mira: si algún día `profiles` deja de ser de lectura pública, la política
-- no encontraría el perfil y —escrita con NOT EXISTS— mostraría las notas de
-- todos. La función lee con sus propios permisos y, si no encuentra el
-- perfil, oculta: ante la duda, no mostrar.
--
-- Es la regla de "Ocultar actividad" + "Perfil privado", y la van a usar las
-- demás tablas de actividad (vistas, watchlist...) en el proyecto de
-- privacidad.

CREATE OR REPLACE FUNCTION puede_ver_actividad(dueno UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dueno = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = dueno
        AND NOT p.hide_activity
        AND (
          NOT p.is_private
          OR EXISTS (
            SELECT 1 FROM follows f
            WHERE f.follower_id = auth.uid()
              AND f.following_id = dueno
          )
        )
    )
$$;

REVOKE EXECUTE ON FUNCTION puede_ver_actividad(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION puede_ver_actividad(UUID) TO anon, authenticated;

DROP POLICY IF EXISTS "Notas visibles según la privacidad del dueño" ON ratings;
CREATE POLICY "Notas visibles según la privacidad del dueño"
  ON ratings FOR SELECT
  USING (puede_ver_actividad(user_id));

COMMIT;

-- ── Verificación (solo lectura) ───────────────────────────────────────────
-- Tiene que devolver las dos restricciones nuevas y las dos políticas de
-- lectura de `ratings` (la del dueño y la nueva, que llama a
-- puede_ver_actividad).
SELECT conrelid::regclass::text AS tabla, conname AS nombre, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conname IN ('ratings_rating_check', 'reviews_rating_check')
UNION ALL
SELECT tablename, policyname, cmd || ' USING ' || qual
FROM pg_policies
WHERE tablename = 'ratings' AND cmd = 'SELECT';
