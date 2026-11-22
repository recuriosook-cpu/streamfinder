-- ================================================================
-- GLYNBOX — Monitor automático contra robots y gastos de más
-- Correr con: npx supabase db query --remote=<ref> --yes -f supabase-monitor-2026-11.sql
-- Seguro de correr más de una vez.
-- ================================================================
--
-- La Edge Function `monitor-glynbox` (supabase/functions/monitor-glynbox)
-- corre tres veces por día desde pg_cron —8:00, 15:00 y 22:00 de Buenos
-- Aires— y revisa:
--
--   · Vercel: gasto del ciclo (arranca el 9 de cada mes) contra el crédito
--     de 20 USD, pedidos de las últimas 3 horas e invocaciones de funciones
--     contra lo normal.
--   · Lo nuestro: ráfagas de bots (las que marca `analytics_marcar_rafagas`),
--     proporción de sesiones de bots y los inicios de sesión fallidos de
--     Supabase Auth (de los logs, por la Management API).
--
-- Si algo se dispara, manda un push a la app de fd_lage y Ferlageok. Cada
-- alerta tiene una clave (`vercel-gasto`, `bots-rafaga`…) y no se repite
-- antes de 8 horas. Todo chequeo queda en `monitor_chequeos`, y el Resumen
-- del panel muestra el último.
--
-- Lo que hay acá:
--   1. La tabla `monitor_chequeos`.
--   2. El secreto que manda pg_cron y verifica la función. Se genera en la
--      base y vive en Vault: nadie tiene que copiarlo a mano.
--   3. `monitor_secreto_valido`, para que la función lo compruebe.
--   4. `monitor_metricas_propias`, las cuentas de bots.
--   5. El cron.
--
-- Los secretos de la función (VERCEL_TOKEN, SB_ACCESS_TOKEN) se cargan con
-- `npx supabase secrets set`, no acá.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Tabla
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.monitor_chequeos (
  id         BIGSERIAL PRIMARY KEY,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'alerta' si se disparó algo; 'normal' si no; 'error' si no se disparó
  -- nada pero alguna fuente no se pudo leer.
  estado     TEXT NOT NULL CHECK (estado IN ('normal', 'alerta', 'error')),
  -- [{ "clave": "vercel-gasto", "texto": "..." }]: lo que se disparó, se
  -- haya avisado o no.
  alertas    JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Las claves que salieron por push en este chequeo. Lo que mira la regla
  -- de las 8 horas.
  avisadas   TEXT[] NOT NULL DEFAULT '{}',
  -- Cuántos aparatos recibieron el push.
  push_enviados INTEGER NOT NULL DEFAULT 0,
  -- Todas las mediciones, para ver de dónde salió cada alerta.
  datos      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- [{ "fuente": "vercel-cargos", "error": "..." }]
  errores    JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS monitor_chequeos_creado_idx
  ON public.monitor_chequeos (creado_en DESC);

-- Sólo la service role (la función y el panel, desde el servidor).
ALTER TABLE public.monitor_chequeos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.monitor_chequeos FROM anon, authenticated;

-- ----------------------------------------------------------------
-- 2. Secreto de pg_cron → función
-- ----------------------------------------------------------------
--
-- La función se publica sin verificación de JWT (pg_cron no tiene una
-- sesión), así que cualquiera con la URL podría llamarla. Con esto, sólo
-- quien conoce el secreto: pg_cron lo lee de Vault y la función lo compara
-- por RPC. Un llamado sin secreto no lee nada ni manda pushes.

SELECT vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'monitor_glynbox_secret',
  'Lo manda pg_cron a la Edge Function monitor-glynbox (supabase-monitor-2026-11.sql)'
)
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'monitor_glynbox_secret');

-- ----------------------------------------------------------------
-- 3. Verificar el secreto
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.monitor_secreto_valido(p_secreto text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(length(p_secreto) = 64 AND p_secreto = (
    SELECT decrypted_secret FROM vault.decrypted_secrets
    WHERE name = 'monitor_glynbox_secret'
  ), false)
$$;

REVOKE ALL ON FUNCTION public.monitor_secreto_valido(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_secreto_valido(text) TO service_role;

-- ----------------------------------------------------------------
-- 4. Bots: lo que mira el monitor de nuestras métricas
-- ----------------------------------------------------------------
--
-- En las últimas `p_horas`:
--   · sesiones de personas y de bots (una sesión es de bot si tiene algún
--     evento marcado);
--   · las ráfagas que marcó `analytics_marcar_rafagas` (cron de las :05),
--     por país;
--   · los motivos de bot más comunes.
--
-- Y la referencia: la misma proporción en los 3 días anteriores a la
-- ventana (los bots se guardan 3 días en `analytics_events`, ver
-- `analytics_limpiar`), para que el mensaje diga si es lo de siempre.
--
-- Lee `analytics_events` por `created_at`, como `analytics_marcar_rafagas`.

CREATE OR REPLACE FUNCTION public.monitor_metricas_propias(p_horas integer DEFAULT 8)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '60s'
AS $$
  -- Las dos mitades por separado, con `is_bot` explícito, para que cada una
  -- use su índice parcial por `created_at` (analytics_events_humano_created_idx
  -- y analytics_events_bot_created_idx) y no se recorra la tabla entera.
  WITH ev AS (
    SELECT session_id, created_at, false AS is_bot, NULL::text AS bot_reason
    FROM public.analytics_events
    WHERE is_bot = false
      AND created_at >= now() - make_interval(hours => p_horas) - interval '3 days'
    UNION ALL
    SELECT session_id, created_at, true, bot_reason
    FROM public.analytics_events
    WHERE is_bot = true
      AND created_at >= now() - make_interval(hours => p_horas) - interval '3 days'
  ),
  ventana AS (
    SELECT session_id,
           bool_or(is_bot)                           AS bot,
           coalesce(bool_or(bot_reason LIKE 'rafaga:%'), false) AS rafaga,
           min(split_part(bot_reason, ':', 2)) FILTER (WHERE bot_reason LIKE 'rafaga:%') AS pais_rafaga,
           min(split_part(coalesce(bot_reason, ''), ':', 1)) FILTER (WHERE is_bot) AS motivo
    FROM ev
    WHERE created_at >= now() - make_interval(hours => p_horas)
    GROUP BY session_id
  ),
  antes AS (
    SELECT session_id, bool_or(is_bot) AS bot
    FROM ev
    WHERE created_at < now() - make_interval(hours => p_horas)
    GROUP BY session_id
  )
  SELECT jsonb_build_object(
    'horas',          p_horas,
    'sesiones_humanas', (SELECT count(*) FROM ventana WHERE NOT bot),
    'sesiones_bot',     (SELECT count(*) FROM ventana WHERE bot),
    'sesiones_rafaga',  (SELECT count(*) FROM ventana WHERE rafaga),
    'rafaga_por_pais',  coalesce((
      SELECT jsonb_object_agg(pais_rafaga, n)
      FROM (SELECT pais_rafaga, count(*) AS n FROM ventana
            WHERE rafaga GROUP BY pais_rafaga ORDER BY n DESC LIMIT 6) p
    ), '{}'::jsonb),
    'motivos_bot',      coalesce((
      SELECT jsonb_object_agg(motivo, n)
      FROM (SELECT coalesce(nullif(motivo, ''), '?') AS motivo, count(*) AS n FROM ventana
            WHERE bot GROUP BY 1 ORDER BY n DESC LIMIT 6) m
    ), '{}'::jsonb),
    'antes_humanas',    (SELECT count(*) FROM antes WHERE NOT bot),
    'antes_bot',        (SELECT count(*) FROM antes WHERE bot)
  )
$$;

REVOKE ALL ON FUNCTION public.monitor_metricas_propias(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monitor_metricas_propias(integer) TO service_role;

-- ----------------------------------------------------------------
-- 5. Cron: 8:00, 15:00 y 22:00 de Buenos Aires (UTC−3, sin horario de
--    verano) = 11:00, 18:00 y 01:00 UTC.
-- ----------------------------------------------------------------
--
-- pg_net no espera la respuesta: el cron termina al instante y la función
-- corre sola (tarda unos segundos; el timeout es de 2 minutos).

SELECT cron.unschedule('glynbox-monitor')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'glynbox-monitor');

SELECT cron.schedule(
  'glynbox-monitor',
  '0 1,11,18 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://ddoqsdgiggkhbsulxncs.supabase.co/functions/v1/monitor-glynbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-monitor-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'monitor_glynbox_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

-- ----------------------------------------------------------------
-- VERIFICAR
-- ----------------------------------------------------------------
--
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'glynbox-monitor';
--   SELECT public.monitor_metricas_propias(8);
--   SELECT id, creado_en, estado, alertas, avisadas, errores
--   FROM public.monitor_chequeos ORDER BY id DESC LIMIT 5;
--
-- Las respuestas de la función (lo que devolvió cada llamada de pg_net):
--   SELECT id, status_code, left(content, 300), created
--   FROM net._http_response ORDER BY id DESC LIMIT 5;
