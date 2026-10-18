-- ════════════════════════════════════════════════════════════════════════════
-- Uso de la app por usuario (2026-10)
-- ════════════════════════════════════════════════════════════════════════════
--
-- La columna "App" de /admin/usuarios salía sólo de `user_devices`, que tiene
-- fila únicamente cuando la app guardó un token de push. Quien usa la app sin
-- aceptar las notificaciones figuraba como "sin app", y "Últ. acceso" decía
-- "nunca" porque `profiles.last_active` lo escribe sólo la web.
--
-- Esta vista dice quién usa la app según sus eventos (`platform = 'mobile'`),
-- en qué sistema y cuándo fue la última vez. `user_devices` sigue siendo lo que
-- dice si tiene las notificaciones activas: son dos cosas distintas.
--
-- `props->>'os'` lo manda la app desde la versión que trae `os` en cada evento.
-- Los eventos de versiones anteriores no lo tienen: esos usuarios figuran con
-- la app pero sin sistema, y el panel completa con `user_devices` si puede.
--
-- Sólo eventos con `user_id`: lo anónimo de antes del login no se le puede
-- imputar a nadie. Sin bots, como el resto del panel.
--
-- Solo lectura sobre `analytics_events`; no toca ninguna tabla. Se puede
-- volver a correr.

CREATE OR REPLACE VIEW public.user_app_usage
WITH (security_invoker = true) AS
SELECT
  user_id,
  array_agg(DISTINCT props->>'os') FILTER (WHERE props->>'os' IN ('ios', 'android')) AS sistemas,
  min(created_at) AS primera_app,
  max(created_at) AS ultima_app
FROM public.analytics_events
WHERE platform = 'mobile'
  AND is_bot = false
  AND user_id IS NOT NULL
GROUP BY user_id;

-- Como `user_activity_time`: sólo la service role (el panel) la lee.
REVOKE ALL ON public.user_app_usage FROM anon, authenticated;

-- Verificación:
--   SELECT count(*) AS usuarios_con_app,
--          count(*) FILTER (WHERE 'ios' = ANY(sistemas))     AS ios,
--          count(*) FILTER (WHERE 'android' = ANY(sistemas)) AS android,
--          count(*) FILTER (WHERE sistemas IS NULL)          AS sin_sistema
--   FROM public.user_app_usage;
