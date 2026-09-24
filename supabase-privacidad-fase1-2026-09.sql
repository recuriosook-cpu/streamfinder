-- ── Privacidad, fase 1: que los interruptores tapen lo que prometen ────────
--
-- Aprobado el 2026-09-24. Correr entero, una vez; se puede volver a correr.
--
-- Los dos interruptores de la app (Ajustes → Privacidad) no los respetaba
-- nada: vistas, watchlist, reseñas, listas y seguidores eran de lectura
-- pública para cualquiera. Esto pone la regla en la base, que es lo único que
-- alcanza también a las apps ya instaladas (leen casi todo directo de la base).
--
-- QUÉ TAPA CADA UNO (decidido el 2026-09-24)
--
--   "Ocultar actividad" (hide_activity) — "No mostrar qué viste ni qué
--   calificaste". Para todos, seguidores incluidos:
--       vistas, notas, watchlist, estadísticas compartidas
--   "Perfil privado" (is_private) — "Sólo tus seguidores pueden ver tu
--   perfil". Para quien no te sigue, además de lo anterior:
--       reseñas (también en las fichas y el feed), reseñas de temporada,
--       listas, favoritas fijadas, a quién seguís y quién te sigue
--
--   Quedan visibles siempre: el perfil (nombre, foto, bio, nivel), las
--   reseñas con "Ocultar actividad" (son publicaciones, no actividad), y los
--   comentarios y "me gusta" en contenido ajeno.
--   Los números anónimos ("24 la vieron", promedios) dejan de contar lo oculto.
--
-- LAS DOS FUNCIONES
--
--   puede_ver_actividad(dueno) — ya existe (supabase-ratings-2026-09.sql):
--       el dueño, o nadie oculta y (no es privado o lo seguís).
--   puede_ver_perfil(dueno)    — nueva: el dueño, o no es privado, o lo seguís.
--
--   Las dos son SECURITY DEFINER: leen `profiles` y `follows` con sus propios
--   permisos, así una política no depende de las políticas de otras tablas, y
--   ante la duda (perfil que no aparece) devuelven false.
--
-- LAS APPS YA INSTALADAS
--
--   Sólo se ocultan filas en las lecturas; ninguna escritura cambia. Todas las
--   pantallas de la app manejan una consulta con menos filas (verificado): no
--   se cae nada, pero hasta la próxima versión un perfil privado se ve como
--   vacío ("0 vistas") en vez de "Este perfil es privado".
--
-- LO QUE NO RESUELVE (fases 2 y 3)
--
--   Seguir a alguien sigue siendo instantáneo: hasta que haya aprobación de
--   seguidores, cualquiera puede seguir a un perfil privado y verlo.

BEGIN;

-- ── 0. Chequeos previos ───────────────────────────────────────────────────
--
-- Si alguna tabla tiene la RLS apagada, las políticas no hacen nada, y
-- prenderla sin revisar sus otras políticas podría bloquear escrituras de las
-- apps instaladas. Y una política FOR ALL que deje leer a cualquiera anularía
-- las nuevas (las políticas se suman). En los dos casos, no se toca nada.
DO $$
DECLARE
  t   TEXT;
  pol RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY['watched', 'watchlist', 'shared_stats', 'reviews', 'season_reviews',
                           'pinned_favorites', 'lists', 'list_items', 'follows']
  LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = format('public.%I', t)::regclass) THEN
      RAISE EXCEPTION 'La tabla % tiene la RLS apagada. No se aplicó nada: avisame antes de seguir.', t;
    END IF;
  END LOOP;

  FOR pol IN
    SELECT tablename, policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('watched', 'watchlist', 'shared_stats', 'reviews', 'season_reviews',
                        'pinned_favorites', 'lists', 'list_items', 'follows')
      AND cmd = 'ALL'
      AND permissive = 'PERMISSIVE'
      AND (qual IS NULL OR qual NOT ILIKE '%auth.uid()%')
  LOOP
    RAISE EXCEPTION 'La política "%" (FOR ALL) de % deja leer sin mirar al usuario (%). No se aplicó nada.',
      pol.policyname, pol.tablename, coalesce(pol.qual, 'sin USING');
  END LOOP;
END $$;

-- ── 1. puede_ver_perfil ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION puede_ver_perfil(dueno UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    dueno = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = dueno
        AND (
          NOT p.is_private
          OR EXISTS (
            SELECT 1 FROM follows f
            WHERE f.follower_id = auth.uid()
              AND f.following_id = dueno
          )
        )
    ),
    false
  )
$$;

REVOKE EXECUTE ON FUNCTION puede_ver_perfil(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION puede_ver_perfil(UUID) TO anon, authenticated;

-- ── 2. Sacar las políticas de lectura actuales ────────────────────────────
--
-- Se buscan por tabla y no por nombre: los nombres en producción no coinciden
-- con los del repo. Sólo las de SELECT; las de escritura no se tocan. Las
-- nuevas incluyen siempre al dueño, así que nadie deja de ver lo suyo.
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('watched', 'watchlist', 'shared_stats', 'reviews', 'season_reviews',
                        'pinned_favorites', 'lists', 'list_items', 'follows')
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ── 3. Las políticas nuevas ───────────────────────────────────────────────

-- Actividad: tapan los dos interruptores.
CREATE POLICY "Vistas según la privacidad del dueño"
  ON watched FOR SELECT USING (puede_ver_actividad(user_id));

CREATE POLICY "Watchlist según la privacidad del dueño"
  ON watchlist FOR SELECT USING (puede_ver_actividad(user_id));

CREATE POLICY "Estadísticas compartidas según la privacidad del dueño"
  ON shared_stats FOR SELECT USING (puede_ver_actividad(user_id));

-- Perfil: tapa sólo "Perfil privado".
CREATE POLICY "Reseñas según la privacidad del autor"
  ON reviews FOR SELECT USING (puede_ver_perfil(user_id));

CREATE POLICY "Reseñas de temporada según la privacidad del autor"
  ON season_reviews FOR SELECT USING (puede_ver_perfil(user_id));

CREATE POLICY "Favoritas fijadas según la privacidad del dueño"
  ON pinned_favorites FOR SELECT USING (puede_ver_perfil(user_id));

-- Listas: las propias siempre; las ajenas, si son públicas y se puede ver el
-- perfil del dueño.
CREATE POLICY "Listas según la privacidad del dueño"
  ON lists FOR SELECT USING (
    user_id = auth.uid()
    OR (COALESCE(is_public, false) AND puede_ver_perfil(user_id))
  );

-- Los títulos de una lista se ven si se ve la lista. Acá sí conviene que la
-- subconsulta pase por la RLS de `lists`: aplica exactamente la regla de
-- arriba. De paso cierra otra fuga: hasta ahora los títulos de las listas
-- PRIVADAS eran de lectura pública.
CREATE POLICY "Títulos de lista si se ve la lista"
  ON list_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM lists l WHERE l.id = list_items.list_id)
  );

-- Seguidores: una fila "A sigue a B" se ve si sos A o B (sin eso se rompen el
-- botón de seguir y tus propios contadores), o si se pueden ver los dos
-- perfiles. Un perfil privado desaparece de las listas de seguidores ajenas.
CREATE POLICY "Seguimientos según la privacidad de los dos"
  ON follows FOR SELECT USING (
    follower_id = auth.uid()
    OR following_id = auth.uid()
    OR (puede_ver_perfil(follower_id) AND puede_ver_perfil(following_id))
  );

COMMIT;

-- ── Verificación (solo lectura) ───────────────────────────────────────────
-- Tiene que quedar exactamente una política de SELECT por tabla: la nueva.
SELECT tablename AS tabla, policyname AS politica, qual AS regla
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('watched', 'watchlist', 'shared_stats', 'reviews', 'season_reviews',
                    'pinned_favorites', 'lists', 'list_items', 'follows')
  AND cmd IN ('SELECT', 'ALL')
ORDER BY tablename, cmd, policyname;
