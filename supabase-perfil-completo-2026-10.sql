-- ================================================================
-- GLYNBOX — Puntos por completar el perfil (foto, nombre y bio)
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez. Requiere supabase-puntos-etapa2-2026-09.sql.
-- ================================================================
--
-- La tarjeta "Completá tu perfil" (app y web) premia tener foto, nombre
-- visible y bio con 20 puntos, una sola vez en la vida, como todo lo de
-- `puntos_otorgados`: sacar la foto y volver a ponerla no suma de nuevo. En
-- la app además se desbloquea el logro "Perfil completo", que se calcula ahí.
--
-- Los que ya tienen el perfil completo reciben los 20 puntos al correr esto,
-- sin aviso de "subiste de nivel" (paso 3).
-- ================================================================

BEGIN;

-- 1. El motivo nuevo. NOT VALID: no revisa las filas viejas, sólo las nuevas.
ALTER TABLE puntos_otorgados DROP CONSTRAINT IF EXISTS puntos_otorgados_motivo_check;
ALTER TABLE puntos_otorgados ADD CONSTRAINT puntos_otorgados_motivo_check CHECK (motivo IN (
  'vista', 'watchlist', 'resena', 'resena_larga', 'sigue', 'seguido', 'like_recibido',
  'resena_temporada', 'episodio', 'perfil_completo'
)) NOT VALID;

-- 2. El trigger: al guardar el perfil con las tres cosas, 20 puntos una vez.
CREATE OR REPLACE FUNCTION public.perfil_completo(p_avatar TEXT, p_nombre TEXT, p_bio TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(btrim(p_avatar), '') <> ''
     AND coalesce(btrim(p_nombre), '') <> ''
     AND coalesce(btrim(p_bio), '') <> ''
$$;

CREATE OR REPLACE FUNCTION public.puntos_por_perfil_completo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.perfil_completo(NEW.avatar_url, NEW.display_name, NEW.bio) THEN
    PERFORM otorgar_puntos(NEW.id, 'perfil_completo', 'perfil', 20);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS puntos_por_perfil_completo ON public.profiles;
CREATE TRIGGER puntos_por_perfil_completo
  AFTER INSERT OR UPDATE OF avatar_url, display_name, bio ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.puntos_por_perfil_completo();

-- 3. Los que ya lo tienen completo: anotados y con los puntos, sin pasar por
--    sumar_puntos() (que avisaría "subiste de nivel"). El nivel se recalcula
--    solo la próxima vez que sumen puntos.
WITH nuevos AS (
  INSERT INTO puntos_otorgados (user_id, motivo, clave, puntos)
  SELECT id, 'perfil_completo', 'perfil', 20
    FROM public.profiles
   WHERE public.perfil_completo(avatar_url, display_name, bio)
  ON CONFLICT DO NOTHING
  RETURNING user_id
)
UPDATE public.profiles p
   SET points = coalesce(p.points, 0) + 20
  FROM nuevos n
 WHERE p.id = n.user_id;

COMMIT;

-- VERIFICAR (solo lectura):
--   SELECT count(*) FROM puntos_otorgados WHERE motivo = 'perfil_completo';
