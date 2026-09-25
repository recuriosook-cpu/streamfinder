-- ── Sin "Perfil privado" ────────────────────────────────────────────────────
--
-- Decidido el 2026-09-24: Glynbox no tiene perfiles privados. Se queda
-- "Ocultar actividad" (hide_activity), que ya funciona con las políticas de
-- supabase-privacidad-fase1-2026-09.sql. Esto deshace la parte de esa fase que
-- dependía de is_private.
--
-- Correr entero, una vez; se puede volver a correr.
--
-- VUELVE ATRÁS
--   reseñas, reseñas de temporada, favoritas fijadas, seguimientos → públicos
--   listas → las propias siempre, las ajenas si son públicas (lo de antes)
--   puede_ver_perfil() → se borra
--
-- SE QUEDA
--   títulos de lista sólo si se ve la lista (cerró la fuga de los títulos de
--   las listas privadas; funciona igual con la regla de listas de antes)
--   vistas, notas, watchlist y estadísticas compartidas según
--   puede_ver_actividad(), que ahora mira sólo "Ocultar actividad"
--
-- LA COLUMNA is_private
--   Queda, siempre en false, en desuso. Las apps instaladas la leen en la
--   pantalla de Ajustes: si se borra, esa consulta falla y Ajustes da error
--   para todos. Borrarla cuando ninguna versión en uso la lea.
--
--   Prenderla se rechaza (CHECK). En las apps instaladas el interruptor
--   "Perfil privado" vuelve solo a apagado con "No pudimos guardar la
--   preferencia": no explica por qué, pero no promete nada. Aceptarlo en
--   silencio sería peor: la app mostraría "Tu perfil ahora es privado".

BEGIN;

-- ── 1. El único perfil que lo tenía prendido ──────────────────────────────
-- Tiene también "Ocultar actividad", que se le queda: su actividad sigue
-- oculta. No tiene reseñas, listas, favoritas fijadas ni seguimientos, así
-- que apagarlo no expone nada. Hay que hacerlo antes del CHECK.
UPDATE profiles SET is_private = false WHERE is_private;

-- ── 2. Nadie lo puede volver a prender ────────────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_sin_perfil_privado;
ALTER TABLE profiles ADD CONSTRAINT profiles_sin_perfil_privado
  CHECK (is_private IS NOT TRUE);

COMMENT ON COLUMN profiles.is_private IS
  'En desuso desde 2026-09-24 (Glynbox no tiene perfiles privados). Siempre false: '
  'lo fuerza profiles_sin_perfil_privado. Queda porque las apps instaladas la leen '
  'en Ajustes; borrarla cuando ninguna versión en uso la lea.';

-- ── 3. puede_ver_actividad: sólo "Ocultar actividad" ──────────────────────
-- El dueño ve lo suyo; los demás, si no lo ocultó. Ante la duda (perfil que
-- no aparece), no.
CREATE OR REPLACE FUNCTION puede_ver_actividad(dueno UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(dueno = auth.uid(), false)
      OR EXISTS (
           SELECT 1 FROM profiles p
           WHERE p.id = dueno AND p.hide_activity IS NOT TRUE
         )
$$;

-- ── 4. Las reglas de lectura que dependían de "Perfil privado" ────────────

DROP POLICY IF EXISTS "Reseñas según la privacidad del autor" ON reviews;
DROP POLICY IF EXISTS "Reseñas visibles para todos" ON reviews;
CREATE POLICY "Reseñas visibles para todos"
  ON reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Reseñas de temporada según la privacidad del autor" ON season_reviews;
DROP POLICY IF EXISTS "Reseñas de temporada visibles para todos" ON season_reviews;
CREATE POLICY "Reseñas de temporada visibles para todos"
  ON season_reviews FOR SELECT USING (true);

DROP POLICY IF EXISTS "Favoritas fijadas según la privacidad del dueño" ON pinned_favorites;
DROP POLICY IF EXISTS "Favoritas fijadas visibles para todos" ON pinned_favorites;
CREATE POLICY "Favoritas fijadas visibles para todos"
  ON pinned_favorites FOR SELECT USING (true);

DROP POLICY IF EXISTS "Seguimientos según la privacidad de los dos" ON follows;
DROP POLICY IF EXISTS "Seguimientos visibles para todos" ON follows;
CREATE POLICY "Seguimientos visibles para todos"
  ON follows FOR SELECT USING (true);

-- Listas: no son "públicas para todos". Las privadas (is_public = false)
-- siguen siendo sólo del dueño, como antes de la fase 1.
DROP POLICY IF EXISTS "Listas según la privacidad del dueño" ON lists;
DROP POLICY IF EXISTS "Listas públicas y las propias" ON lists;
CREATE POLICY "Listas públicas y las propias"
  ON lists FOR SELECT USING (
    user_id = auth.uid() OR COALESCE(is_public, false)
  );

-- "Títulos de lista si se ve la lista" (list_items) NO se toca.

-- ── 5. puede_ver_perfil ya no la usa nadie ────────────────────────────────
-- Si algo todavía dependiera de ella, este DROP falla y no se aplica nada.
DROP FUNCTION IF EXISTS puede_ver_perfil(UUID);

COMMIT;

-- ── Verificación (solo lectura) ───────────────────────────────────────────
SELECT 'lectura: ' || tablename AS que, policyname || ' → ' || coalesce(qual, '-') AS detalle
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('reviews', 'season_reviews', 'pinned_favorites', 'follows', 'lists', 'list_items',
                    'watched', 'watchlist', 'shared_stats', 'ratings')
  AND cmd IN ('SELECT', 'ALL')
UNION ALL
SELECT 'perfiles con is_private', count(*)::text FROM profiles WHERE is_private
UNION ALL
SELECT 'puede_ver_perfil existe', (count(*) > 0)::text
FROM pg_proc WHERE proname = 'puede_ver_perfil' AND pronamespace = 'public'::regnamespace
ORDER BY 1, 2;
