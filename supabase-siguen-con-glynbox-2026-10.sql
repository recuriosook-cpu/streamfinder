-- ================================================================
-- GLYNBOX — "Siguen con Glynbox" en admin → Resumen
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez. No borra ni cambia datos de nadie.
-- ================================================================
--
-- Reemplaza a supabase-usuarios-panel-2026-10.sql: trae lo mismo (la
-- actividad por usuario de /admin/usuarios) y le suma esto. Si ya corriste
-- aquél, da igual: esto lo pisa con la misma función y el mismo cron.
--
-- Un usuario registrado "sigue con Glynbox" si:
--   1. tuvo actividad, web o app, en los últimos 30 días (eventos sin bots,
--      `profiles.last_active` o `user_devices.last_seen_at`), o
--   2. tiene la app instalada: un token de notificaciones que Expo todavía no
--      rechazó.
--
-- Los tokens de quien desinstala: Expo los rechaza con `DeviceNotRegistered`,
-- casi siempre en el recibo, minutos después del envío. Eso ya se revisaba,
-- pero el token se BORRABA de `user_devices` sin dejar rastro: no había forma
-- de saber quién se fue. Desde ahora la web lo anota en
-- `push_tokens_inactivos` (con su usuario) antes de sacarlo de `user_devices`.
-- Así `user_devices` sigue siendo "tokens válidos" para todo lo que ya lo lee
-- (los envíos, los conteos de la app) y lo inactivo queda guardado aparte.
-- Los ~60 que se borraron antes de esto no se pueden recuperar.
--
-- Las cuentas eliminadas: Supabase no guarda nada de un usuario borrado.
-- `cuentas_eliminadas` se llena desde ahora con un trigger sobre auth.users, y
-- hacia atrás con los eventos que quedaron de gente que ya no está (los
-- eventos no se borran con la cuenta).
--
-- Se calcula cada 10 minutos y el panel lee sólo eso: no hay cálculo en vivo.
-- ================================================================


-- ── 1. Tokens inactivos ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_tokens_inactivos (
  push_token    TEXT PRIMARY KEY,
  user_id       UUID,
  platform      TEXT,
  -- Lo que contestó Expo. Hoy siempre 'DeviceNotRegistered'.
  motivo        TEXT NOT NULL DEFAULT 'DeviceNotRegistered',
  -- El `last_seen_at` que tenía en `user_devices`: la última vez que abrió la app.
  ultimo_visto  TIMESTAMPTZ,
  detectado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_tokens_inactivos_user_idx
  ON public.push_tokens_inactivos (user_id);

ALTER TABLE public.push_tokens_inactivos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_tokens_inactivos FROM anon, authenticated;


-- ── 2. Cuentas eliminadas ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cuentas_eliminadas (
  user_id        UUID PRIMARY KEY,
  registrada_en  TIMESTAMPTZ,
  -- Exacta si vino del trigger; si vino de los eventos, su último evento.
  eliminada_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  origen         TEXT NOT NULL CHECK (origen IN ('trigger', 'eventos'))
);

ALTER TABLE public.cuentas_eliminadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cuentas_eliminadas FROM anon, authenticated;

-- Nunca frena el borrado: si algo falla, la cuenta se borra igual.
CREATE OR REPLACE FUNCTION public.anotar_cuenta_eliminada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.cuentas_eliminadas (user_id, registrada_en, eliminada_en, origen)
    VALUES (OLD.id, OLD.created_at, now(), 'trigger')
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'anotar_cuenta_eliminada: %', SQLERRM;
  END;
  RETURN OLD;
END
$$;

REVOKE ALL ON FUNCTION public.anotar_cuenta_eliminada() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS glynbox_anotar_cuenta_eliminada ON auth.users;
CREATE TRIGGER glynbox_anotar_cuenta_eliminada
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.anotar_cuenta_eliminada();

-- Hacia atrás: usuarios con eventos que ya no existen. El 27/10 eran 23.
INSERT INTO public.cuentas_eliminadas (user_id, registrada_en, eliminada_en, origen)
SELECT e.user_id, min(e.created_at), max(e.created_at), 'eventos'
  FROM public.analytics_events e
 WHERE e.user_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.user_id)
 GROUP BY e.user_id
ON CONFLICT (user_id) DO NOTHING;


-- ── 3. El cálculo ──────────────────────────────────────────────────────────
-- Cada usuario cae en UNA sola de las tres: actividad gana sobre la app, y
-- "desinstaló" es quien no tiene ninguna de las dos y tuvo un token que Expo
-- rechazó. Lo que sobra (ni actividad, ni token, nunca rechazado) son los que
-- simplemente no volvieron.

CREATE OR REPLACE FUNCTION public.admin_siguen_con_glynbox()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH desde AS (SELECT now() - interval '30 days' AS t),
  activos AS (
    SELECT e.user_id FROM public.analytics_events e, desde
     WHERE e.is_bot = false AND e.user_id IS NOT NULL AND e.created_at >= desde.t
    UNION
    SELECT p.id FROM public.profiles p, desde WHERE p.last_active >= desde.t
    UNION
    SELECT d.user_id FROM public.user_devices d, desde WHERE d.last_seen_at >= desde.t
  ),
  con_token AS (SELECT DISTINCT user_id FROM public.user_devices WHERE user_id IS NOT NULL),
  rechazados AS (SELECT DISTINCT user_id FROM public.push_tokens_inactivos WHERE user_id IS NOT NULL),
  usuarios AS (
    SELECT u.id,
           a.user_id IS NOT NULL AS activo,
           t.user_id IS NOT NULL AS token,
           r.user_id IS NOT NULL AS rechazado
      FROM auth.users u
      LEFT JOIN activos    a ON a.user_id = u.id
      LEFT JOIN con_token  t ON t.user_id = u.id
      LEFT JOIN rechazados r ON r.user_id = u.id
  )
  SELECT jsonb_build_object(
    'total',          count(*),
    'por_actividad',  count(*) FILTER (WHERE activo),
    'solo_app',       count(*) FILTER (WHERE NOT activo AND token),
    'desinstalaron',  count(*) FILTER (WHERE NOT activo AND NOT token AND rechazado),
    'eliminadas',     (SELECT count(*) FROM public.cuentas_eliminadas),
    -- Desde cuándo se anotan los rechazos, para leer "desinstalaron" bien.
    'desinstalados_desde', (SELECT min(detectado_en) FROM public.push_tokens_inactivos)
  )
  FROM usuarios
$$;

REVOKE ALL ON FUNCTION public.admin_siguen_con_glynbox() FROM PUBLIC, anon, authenticated;


-- ── 4. El precálculo de cada 10 minutos ────────────────────────────────────
-- La misma función de supabase-usuarios-panel-2026-10.sql, con una clave más.

CREATE OR REPLACE FUNCTION public.admin_usuarios_precalcular()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
-- Recorre la tabla de eventos entera: sin el límite que tiene la API.
SET statement_timeout = '120s'
AS $$
DECLARE
  c         record;
  inicio    timestamptz;
  resultado jsonb;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('user_activity_time',
         'SELECT coalesce(jsonb_agg(jsonb_build_object(
             ''user_id'', user_id, ''segundos_totales'', segundos_totales,
             ''sesiones'', sesiones, ''ultima_actividad'', ultima_actividad)), ''[]'')
          FROM public.user_activity_time'),
      ('user_app_usage',
         'SELECT coalesce(jsonb_agg(jsonb_build_object(
             ''user_id'', user_id, ''sistemas'', sistemas, ''ultima_app'', ultima_app)), ''[]'')
          FROM public.user_app_usage'),
      ('admin_siguen_con_glynbox',
         'SELECT public.admin_siguen_con_glynbox()')
    ) AS v(clave, consulta)
  LOOP
    BEGIN
      inicio := clock_timestamp();
      EXECUTE c.consulta INTO resultado;
      INSERT INTO public.admin_panel_precalculado (clave, datos, calculado_en, milisegundos)
      VALUES (c.clave, resultado, clock_timestamp(),
              (extract(epoch FROM clock_timestamp() - inicio) * 1000)::int)
      ON CONFLICT (clave) DO UPDATE
        SET datos = EXCLUDED.datos,
            calculado_en = EXCLUDED.calculado_en,
            milisegundos = EXCLUDED.milisegundos;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'admin_usuarios_precalcular %: %', c.clave, SQLERRM;
    END;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.admin_usuarios_precalcular() FROM PUBLIC, anon, authenticated;

-- Cada 10 minutos, corrido 3 minutos del de 'rapido' para no pisarse. Con el
-- mismo nombre, reemplaza al anterior.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('glynbox-panel-usuarios', '3-59/10 * * * *',
  $$SELECT public.admin_usuarios_precalcular()$$);

-- La primera vez, ya mismo.
SELECT public.admin_usuarios_precalcular();

NOTIFY pgrst, 'reload schema';


-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura)
-- ----------------------------------------------------------------
-- Lo que lee el panel (tienen que estar las 3 claves):
--   SELECT clave, calculado_en, milisegundos, left(datos::text, 200)
--     FROM public.admin_panel_precalculado
--    WHERE clave IN ('admin_siguen_con_glynbox', 'user_activity_time', 'user_app_usage');
--
-- Los tokens rechazados que se van anotando (después del próximo envío):
--   SELECT platform, count(*), max(detectado_en) FROM public.push_tokens_inactivos GROUP BY 1;
--
-- Las cuentas eliminadas:
--   SELECT origen, count(*) FROM public.cuentas_eliminadas GROUP BY 1;
--
-- Para apagar el precálculo (el panel muestra "sin calcular"):
--   SELECT cron.unschedule('glynbox-panel-usuarios');
