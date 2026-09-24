-- ── Puntos, etapa 1: que nadie pueda tocar los puntos de otro ──────────────
--
-- Aprobado el 2026-09-24. Correr entero, una vez; se puede volver a correr.
--
-- LO QUE PASA HOY
--
--   add_points(p_user_id, p_amount) es SECURITY DEFINER y no valida nada:
--   cualquier usuario logueado puede sumarle o RESTARLE puntos a cualquiera,
--   en cualquier cantidad.
--
--   Además está rota: cuando el nivel cambia, inserta la notificación en
--   `notifications.item_title`, una columna que no existe. El INSERT falla y
--   deshace la llamada entera, puntos incluidos. Por eso en producción hay 0
--   notificaciones de level_up, 273 de 274 perfiles en nivel 1, y el único
--   que pasó (por la carga inicial de supabase-levels.sql) está clavado en 699,
--   a uno de subir: cada punto que lo haría subir se pierde.
--
-- LO QUE HACE ESTE SQL
--
--   1. sumar_puntos(): la lógica real, interna, que ningún cliente puede
--      llamar. Guarda el nivel en `review_title` (la columna que leen el
--      webhook del push y el feed de comunidad). Sólo avisa cuando se SUBE de
--      nivel; si baja, actualiza el nivel sin avisar. Los puntos no bajan de 0.
--
--   2. add_points(): misma firma, así las apps instaladas la siguen llamando
--      sin error. Pero ahora sólo suma al propio usuario y sólo las cantidades
--      que se usan de verdad para uno mismo: 1 (watchlist, seguir), 3 (vista
--      de película), 5 (vista de serie, reseña larga) y 10 (reseña). Lo demás
--      se ignora en silencio: puntos para otro, negativos, inventados, y los
--      del importador de Letterboxd (2 por título, que se decidió eliminar).
--
--   3. Los puntos que hoy un usuario le da a OTRO los da la base, con un
--      trigger sobre la acción real, así nadie los pierde:
--        - seguir a alguien: +3 al seguido
--        - like en una reseña: +2 al autor
--      Las apps instaladas siguen llamando add_points para esos casos; esa
--      llamada ahora se ignora y el trigger los da una sola vez.
--      Los +2 por ser mencionado se eliminan (decidido el 2026-09-24).
--
--   4. puede_ver_actividad() devuelve false, no NULL, para un visitante sin
--      sesión. Hoy la política de `ratings` oculta bien igual (NULL cuenta
--      como no), pero un NOT puede_ver_actividad(...) daría NULL y podría
--      mostrar de más.
--
-- LO QUE NO RESUELVE (etapa 2)
--
--   Uno mismo todavía puede sumarse puntos llamando add_points en loop, o
--   poniendo y sacando algo de la watchlist. Eso se cierra cuando todos los
--   puntos los dé la base con un registro de lo ya otorgado.

BEGIN;

-- ── 1. La lógica, interna ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sumar_puntos(p_user_id UUID, p_amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_puntos      INTEGER;
  v_nivel_viejo INTEGER;
  v_nivel_nuevo INTEGER;
BEGIN
  UPDATE profiles
  SET points = GREATEST(0, COALESCE(points, 0) + p_amount)
  WHERE id = p_user_id
  RETURNING points INTO v_puntos;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(level, 1) INTO v_nivel_viejo FROM profiles WHERE id = p_user_id;
  v_nivel_nuevo := get_level(v_puntos);

  IF v_nivel_nuevo = v_nivel_viejo THEN
    RETURN;
  END IF;

  UPDATE profiles SET level = v_nivel_nuevo WHERE id = p_user_id;

  -- Sólo al subir. Bajar de nivel no es una noticia que haya que mandar, y el
  -- texto de "¡Subiste de nivel!" con un nivel menor era mentira.
  IF v_nivel_nuevo > v_nivel_viejo THEN
    INSERT INTO notifications (user_id, actor_id, type, review_title)
    VALUES (
      p_user_id,
      p_user_id,
      'level_up',
      CASE v_nivel_nuevo
        WHEN 2 THEN '🎬 Cinéfilo'
        WHEN 3 THEN '⭐ Crítico'
        WHEN 4 THEN '🎭 Experto'
        WHEN 5 THEN '🏆 Maestro'
      END
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION sumar_puntos(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

-- ── 2. add_points, la que llaman los clientes ─────────────────────────────

CREATE OR REPLACE FUNCTION add_points(p_user_id UUID, p_amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sin error a propósito: las apps instaladas la llaman "fire-and-forget" y
  -- un error no les sirve de nada. Lo que no corresponde, simplemente no suma.
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN;
  END IF;

  IF p_amount IS NULL OR p_amount NOT IN (1, 3, 5, 10) THEN
    RETURN;
  END IF;

  PERFORM sumar_puntos(p_user_id, p_amount);
END;
$$;

-- ── 3. Los puntos que se le dan a otro, desde la base ─────────────────────
--
-- Un fallo sumando puntos nunca puede impedir el follow o el like: por eso el
-- EXCEPTION. Se registra como WARNING en el log de Postgres y la acción sigue.

CREATE OR REPLACE FUNCTION puntos_por_follow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.following_id IS DISTINCT FROM NEW.follower_id THEN
    PERFORM sumar_puntos(NEW.following_id, 3);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'puntos_por_follow: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS puntos_por_follow ON follows;
CREATE TRIGGER puntos_por_follow
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION puntos_por_follow();

CREATE OR REPLACE FUNCTION puntos_por_like_resena()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_autor UUID;
BEGIN
  SELECT user_id INTO v_autor FROM reviews WHERE id = NEW.review_id;
  IF v_autor IS NOT NULL AND v_autor IS DISTINCT FROM NEW.user_id THEN
    PERFORM sumar_puntos(v_autor, 2);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'puntos_por_like_resena: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS puntos_por_like_resena ON review_likes;
CREATE TRIGGER puntos_por_like_resena
  AFTER INSERT ON review_likes
  FOR EACH ROW EXECUTE FUNCTION puntos_por_like_resena();

REVOKE EXECUTE ON FUNCTION puntos_por_follow() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION puntos_por_like_resena() FROM PUBLIC, anon, authenticated;

-- ── 4. puede_ver_actividad: false y no NULL ───────────────────────────────

CREATE OR REPLACE FUNCTION puede_ver_actividad(dueno UUID)
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
        AND NOT p.hide_activity
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

COMMIT;

-- ── Verificación (solo lectura) ───────────────────────────────────────────
--
-- 1. Funciones que llaman a add_points por dentro. Si aparece alguna además de
--    la propia (por ejemplo insert_list_comment), y le suma puntos a otro
--    usuario, esa suma ahora se ignora: avisame.
SELECT 'llama a add_points' AS chequeo, p.proname AS detalle
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
  AND p.proname <> 'add_points'
  AND pg_get_functiondef(p.oid) ILIKE '%add_points(%'
UNION ALL
-- 2. Los dos triggers nuevos.
SELECT 'trigger', tgname || ' en ' || tgrelid::regclass
FROM pg_trigger
WHERE tgname IN ('puntos_por_follow', 'puntos_por_like_resena')
UNION ALL
-- 3. sumar_puntos no la puede ejecutar un cliente (tiene que dar false/false).
SELECT 'sumar_puntos ejecutable por anon / authenticated',
       has_function_privilege('anon', 'sumar_puntos(uuid, integer)', 'EXECUTE')::text || ' / ' ||
       has_function_privilege('authenticated', 'sumar_puntos(uuid, integer)', 'EXECUTE')::text;
