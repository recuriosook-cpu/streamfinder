-- ── notifications: quién puede crear una ───────────────────────────────────
--
-- Hoy la única política de INSERT es "System can insert notifications" con
-- WITH CHECK (true): cualquier usuario logueado puede insertar una
-- notificación para cualquiera, con cualquier `actor_id` y cualquier tipo. El
-- webhook `/api/push/on-notification` la convierte en push con el nombre real
-- del perfil de ese `actor_id`: o sea, "Fulano te empezó a seguir" firmado por
-- quien uno quiera, o un aviso con cara de sistema ("Se estrena …") con
-- cualquier texto.
--
-- Se reemplaza por una regla que sólo deja crear lo que un usuario genera de
-- verdad desde la web o la app, y siempre firmado por él mismo.
--
-- ── Todos los caminos que escriben en notifications (relevados el 2026-09-24)
--
--   Web (lib/notify.ts, siempre actor_id = usuario logueado):
--     follow, list_like, list_comment, review_comment, comment_reply, mention
--   App, todas las versiones publicadas 1.0.0 a 1.0.10 (src/lib/notifications.ts,
--   siempre actor_id = usuario logueado):
--     follow, list_like, list_duplicate
--   Funciones de la base, SECURITY DEFINER (no pasan por esta regla):
--     add_points          → level_up
--     insert_list_comment → list_comment
--   Cron /api/cron/daily-notifications, con la service role (no pasa por RLS):
--     actor_birthday, new_release
--
-- `review_like` queda permitido aunque hoy nadie lo inserta desde el cliente:
-- es una acción de usuario, y cerrarlo no protege de nada.
--
-- Quedan afuera para los clientes: los tipos de sistema (level_up,
-- new_release, actor_birthday) y los nombres viejos (Follow, like, reply,
-- comment), que ningún cliente actual ni publicado usa.

BEGIN;

-- ── 0. Chequeo previo: las funciones tienen que saltear la RLS ────────────
--
-- add_points e insert_list_comment insertan en notifications. Una función
-- SECURITY DEFINER corre con los permisos de su dueño, y la RLS no se le
-- aplica si el dueño es el dueño de la tabla o tiene BYPASSRLS, salvo que la
-- tabla tenga FORCE ROW LEVEL SECURITY. Si eso no se cumple, la regla nueva
-- cortaría los avisos de nivel y de comentarios en listas: mejor no aplicar
-- nada y avisar.
DO $$
DECLARE
  tabla_forzada BOOLEAN;
  tabla_duenio  OID;
  f RECORD;
BEGIN
  SELECT relforcerowsecurity, relowner INTO tabla_forzada, tabla_duenio
  FROM pg_class WHERE oid = 'public.notifications'::regclass;

  IF tabla_forzada THEN
    RAISE EXCEPTION 'notifications tiene FORCE ROW LEVEL SECURITY: las funciones SECURITY DEFINER quedarían bloqueadas. No se aplicó nada.';
  END IF;

  FOR f IN
    SELECT p.proname, p.proowner, r.rolbypassrls
    FROM pg_proc p JOIN pg_roles r ON r.oid = p.proowner
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('add_points', 'insert_list_comment')
  LOOP
    IF f.proowner <> tabla_duenio AND NOT f.rolbypassrls THEN
      RAISE EXCEPTION 'La función % no es del dueño de notifications ni saltea RLS: la regla nueva la bloquearía. No se aplicó nada.', f.proname;
    END IF;
  END LOOP;
END $$;

-- ── 1. La regla nueva ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "System can insert notifications" ON notifications;

DROP POLICY IF EXISTS "Usuarios crean sus notificaciones" ON notifications;
CREATE POLICY "Usuarios crean sus notificaciones"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND type IN (
      'follow',
      'review_like',
      'review_comment',
      'comment_reply',
      'mention',
      'list_like',
      'list_comment',
      'list_duplicate'
    )
  );

COMMIT;

-- ── Verificación (solo lectura) ───────────────────────────────────────────
-- Tiene que quedar una sola política de INSERT: "Usuarios crean sus
-- notificaciones".
SELECT policyname AS politica, cmd, roles::text, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notifications'
ORDER BY cmd, policyname;
