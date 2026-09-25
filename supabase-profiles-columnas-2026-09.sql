-- ── profiles: quién puede leer qué columna ─────────────────────────────────
--
-- Aprobado el 2026-09-25. Correr entero, una vez; se puede volver a correr.
--
-- Hasta ahora cualquiera, sin cuenta, podía leer TODAS las columnas de
-- `profiles` de todos: preferencias de notificación, país, última actividad,
-- si la cuenta está bloqueada por moderación, estado del onboarding...
--
-- RLS decide filas, no columnas. Para columnas, Postgres usa permisos por
-- columna: se saca el permiso de lectura sobre la tabla y se da columna por
-- columna. Consecuencia: una consulta que pida una columna sin permiso (o `*`)
-- falla entera. Verificado el 2026-09-25: ningún cliente que quede afectado lo
-- hace (la app, en toda su historia, nunca pidió `*` ni leyó last_active ni
-- blocked; la web se ajustó antes de este SQL).
--
-- ── ETAPA 1 (esto) ────────────────────────────────────────────────────────
--
--   Visitante sin sesión (anon): sólo las columnas públicas, las que se
--   muestran en un perfil.
--   Usuario logueado (authenticated): todas menos las internas (last_active,
--   blocked, blocked_at), que ya no ve ningún cliente; las usan el admin y
--   /api/ping-active con la service role.
--
--   Las apps instaladas leen las columnas del dueño (ajustes, onboarding,
--   pedido de reseña) y las preferencias de notificación de OTROS usuarios
--   (para decidir si les mandan una) siempre logueadas: siguen funcionando.
--
--   Y para que ningún cliente necesite leer las preferencias ajenas, la base
--   las hace cumplir: una notificación que el destinatario tiene apagada se
--   descarta al insertarse, venga de donde venga.
--
-- ── ETAPA 2 (más adelante) ────────────────────────────────────────────────
--
--   Cerrar también para los logueados las columnas del dueño (preferencias,
--   país, onboarding...), con el acceso propio por una función. Requiere
--   exigir una versión mínima de la app que ya no las lea directo.
--
-- ⚠️  COLUMNAS NUEVAS: desde acá, una columna que se agregue a `profiles` NO
--   la puede leer nadie salvo la service role hasta que se le dé permiso:
--     GRANT SELECT (columna) ON profiles TO authenticated;  -- y anon si es pública

BEGIN;

-- ── 1. Visitantes: sólo lo público ────────────────────────────────────────
REVOKE SELECT ON profiles FROM PUBLIC;
REVOKE SELECT ON profiles FROM anon;
GRANT SELECT (
  id, username, display_name, avatar_url, bio,
  instagram_username, tiktok_username, x_username,
  points, level, is_premium, hide_activity
) ON profiles TO anon;

-- ── 2. Logueados: todo menos lo interno ───────────────────────────────────
-- La lista se arma de las columnas que existen hoy, para no dejar afuera
-- ninguna por error de tipeo.
REVOKE SELECT ON profiles FROM authenticated;
DO $$
DECLARE
  cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO cols
  FROM pg_attribute
  WHERE attrelid = 'public.profiles'::regclass
    AND attnum > 0
    AND NOT attisdropped
    AND attname NOT IN ('last_active', 'blocked', 'blocked_at');
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', cols);
END $$;

COMMENT ON TABLE profiles IS
  'Lectura por columna (supabase-profiles-columnas-2026-09.sql): anon sólo ve las '
  'públicas; authenticated todas menos last_active, blocked y blocked_at. Una '
  'columna nueva no la lee nadie hasta darle GRANT SELECT (col).';

-- ── 3. Las preferencias de notificación las aplica la base ────────────────
-- Antes cada cliente leía las preferencias del destinatario y decidía si
-- insertar. Ahora se insertan igual y la base descarta las apagadas: ningún
-- cliente necesita leer las preferencias de otro (y la etapa 2 las puede
-- cerrar). Sólo un `false` explícito apaga; clave ausente = encendida.
--
-- Mapeo tipo → clave, el de la app: los avisos de listas caen en "likes" y
-- "comments". La web buscaba claves list_like / list_comment que no existen
-- en ningún perfil, así que esos avisos no se podían apagar.
CREATE OR REPLACE FUNCTION notificaciones_respetan_preferencias()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clave TEXT;
BEGIN
  v_clave := CASE lower(NEW.type)
    WHEN 'follow'         THEN 'follows'
    WHEN 'review_like'    THEN 'likes'
    WHEN 'like'           THEN 'likes'
    WHEN 'list_like'      THEN 'likes'
    WHEN 'list_duplicate' THEN 'likes'
    WHEN 'review_comment' THEN 'comments'
    WHEN 'comment'        THEN 'comments'
    WHEN 'list_comment'   THEN 'comments'
    WHEN 'comment_reply'  THEN 'replies'
    WHEN 'reply'          THEN 'replies'
    WHEN 'mention'        THEN 'mentions'
    WHEN 'level_up'       THEN 'level_up'
    WHEN 'actor_birthday' THEN 'actor_birthday'
    WHEN 'new_release'    THEN 'new_release'
    ELSE NULL
  END;

  IF v_clave IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = NEW.user_id
      AND notification_preferences ->> v_clave = 'false'
  ) THEN
    RETURN NULL;  -- no se inserta; para quien la mandó, salió bien
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notificaciones_respetan_preferencias ON notifications;
CREATE TRIGGER notificaciones_respetan_preferencias
  BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notificaciones_respetan_preferencias();

REVOKE EXECUTE ON FUNCTION notificaciones_respetan_preferencias() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ── Verificación (solo lectura) ───────────────────────────────────────────
-- anon: las 12 públicas. authenticated: todas menos 3. Y el trigger.
SELECT grantee AS rol,
       count(*) AS columnas,
       string_agg(column_name, ', ' ORDER BY column_name) FILTER (
         WHERE grantee = 'anon' OR column_name IN ('last_active', 'blocked', 'blocked_at')
       ) AS detalle
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND privilege_type = 'SELECT' AND grantee IN ('anon', 'authenticated')
GROUP BY grantee
UNION ALL
SELECT 'trigger', 1, tgname
FROM pg_trigger WHERE tgname = 'notificaciones_respetan_preferencias'
UNION ALL
SELECT 'columnas en profiles', count(*), NULL
FROM pg_attribute
WHERE attrelid = 'public.profiles'::regclass AND attnum > 0 AND NOT attisdropped;
