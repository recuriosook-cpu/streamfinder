-- ================================================================
-- GLYNBOX — admin_resumen_actividad más rápida
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez. No cambia datos.
-- ================================================================
--
-- La vista de `supabase-metricas-2026-10.sql` funcionaba, pero desde el salto
-- de tráfico del 20/10 (unos 90.000 eventos en 30 días) el panel la cortaba:
-- "canceling statement due to statement timeout" en cada carga de Resumen, y la
-- tarjeta "Activos en 30 días" quedaba vacía. Sola tardaba 1 a 3 s; al lado de
-- las otras consultas del panel pasaba el límite.
--
-- Recorría los eventos unas quince veces: once `count(DISTINCT …)` separados
-- sobre las 90.000 filas, y además `analytics_sessions`, que agrupa por sesión
-- TODA la tabla desde agosto.
--
-- Ahora:
--   · Los eventos de la ventana se reducen una sola vez a un renglón por
--     (navegador o instalación, usuario, plataforma) con en qué ventanas
--     apareció. Los conteos corren sobre esos pocos miles de renglones.
--   · Las sesiones se arman con los eventos de los últimos 30 días, no con toda
--     la historia. Por eso `seg_prom_total` pasa a ser el promedio de 30 días;
--     la columna nueva `sesiones_desde` se lo dice al panel.
--
-- Mismas columnas, mismo orden y mismos tipos que antes (lo exige CREATE OR
-- REPLACE VIEW), más `sesiones_desde` al final.
-- ================================================================

CREATE OR REPLACE VIEW public.admin_resumen_actividad
WITH (security_invoker = true) AS
WITH v AS (
  SELECT
    d.hoy_desde,
    d.hoy_desde - interval '1 day'                        AS ayer_desde,
    -- Ayer hasta la misma hora que hoy.
    d.hoy_desde - interval '1 day' + (now() - d.hoy_desde) AS ayer_hasta,
    d.hoy_desde - interval '6 days'                       AS semana_desde,
    d.hoy_desde - interval '13 days'                      AS semana_prev_desde,
    d.hoy_desde - interval '29 days'                      AS mes_desde
  FROM (
    SELECT (date_trunc('day', now() AT TIME ZONE 'America/Argentina/Buenos_Aires')
              AT TIME ZONE 'America/Argentina/Buenos_Aires') AS hoy_desde
  ) d
),

-- Una sola lectura de la tabla para todo lo de abajo.
ev AS (
  SELECT e.user_id, e.anon_id, e.platform, e.session_id, e.created_at
    FROM public.analytics_events e, v
   WHERE e.is_bot = false
     AND e.created_at >= v.mes_desde
),

-- Un renglón por (anon_id, user_id, plataforma) y en qué ventanas apareció.
marcas AS (
  SELECT
    ev.anon_id, ev.user_id, ev.platform,
    bool_or(ev.created_at >= v.hoy_desde)                                         AS hoy,
    bool_or(ev.created_at >= v.ayer_desde AND ev.created_at < v.ayer_hasta)       AS ayer,
    bool_or(ev.created_at >= v.semana_desde)                                      AS semana,
    bool_or(ev.created_at >= v.semana_prev_desde AND ev.created_at < v.semana_desde) AS semana_prev
  FROM ev, v
  GROUP BY ev.anon_id, ev.user_id, ev.platform
),

eventos AS (
  SELECT
    count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND hoy)         AS usuarios_hoy,
    count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND ayer)        AS usuarios_ayer,
    count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND semana)      AS usuarios_semana,
    count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND semana_prev) AS usuarios_semana_prev,
    count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL)                 AS usuarios_30d,

    -- Anónimos: los `anon_id` de la ventana menos los que estuvieron logueados
    -- en algún momento de esa misma ventana. Total y por plataforma.
    count(DISTINCT anon_id) FILTER (WHERE hoy)
      - count(DISTINCT anon_id) FILTER (WHERE hoy AND user_id IS NOT NULL)     AS anonimos_hoy,
    count(DISTINCT anon_id) FILTER (WHERE ayer)
      - count(DISTINCT anon_id) FILTER (WHERE ayer AND user_id IS NOT NULL)    AS anonimos_ayer,
    count(DISTINCT anon_id) FILTER (WHERE platform = 'web' AND hoy)
      - count(DISTINCT anon_id) FILTER (WHERE platform = 'web' AND hoy AND user_id IS NOT NULL)
      AS anonimos_hoy_web,
    count(DISTINCT anon_id) FILTER (WHERE platform = 'mobile' AND hoy)
      - count(DISTINCT anon_id) FILTER (WHERE platform = 'mobile' AND hoy AND user_id IS NOT NULL)
      AS anonimos_hoy_app,
    count(DISTINCT anon_id) FILTER (WHERE platform = 'web' AND ayer)
      - count(DISTINCT anon_id) FILTER (WHERE platform = 'web' AND ayer AND user_id IS NOT NULL)
      AS anonimos_ayer_web,
    count(DISTINCT anon_id) FILTER (WHERE platform = 'mobile' AND ayer)
      - count(DISTINCT anon_id) FILTER (WHERE platform = 'mobile' AND ayer AND user_id IS NOT NULL)
      AS anonimos_ayer_app
  FROM marcas
),

-- Las mismas reglas de duración que `analytics_sessions`: una sesión de un
-- solo evento vale 30 s, el resto lo que va del primero al último, con tope de
-- 30 minutos.
ses AS (
  SELECT
    min(ev.created_at) AS inicio,
    LEAST(
      CASE
        WHEN count(*) = 1 THEN 30
        ELSE EXTRACT(EPOCH FROM (max(ev.created_at) - min(ev.created_at)))
      END,
      1800
    ) AS segundos
  FROM ev
  GROUP BY ev.session_id
),

sesiones AS (
  SELECT
    count(s.inicio) FILTER (WHERE s.inicio >= v.hoy_desde)::bigint AS sesiones_hoy,
    count(s.inicio) FILTER (
      WHERE s.inicio >= v.ayer_desde AND s.inicio < v.ayer_hasta
    )::bigint AS sesiones_ayer,
    round(avg(s.segundos) FILTER (WHERE s.inicio >= v.hoy_desde))::int AS seg_prom_hoy,
    round(avg(s.segundos) FILTER (
      WHERE s.inicio >= v.ayer_desde AND s.inicio < v.ayer_hasta
    ))::int AS seg_prom_ayer,
    -- Desde este SQL, el promedio de los últimos 30 días (ver `sesiones_desde`).
    round(avg(s.segundos))::int AS seg_prom_total
  FROM v LEFT JOIN ses s ON true
  GROUP BY v.hoy_desde, v.ayer_desde, v.ayer_hasta
),

app AS (
  SELECT
    count(DISTINCT d.user_id)::int AS usuarios_con_app,
    count(DISTINCT d.user_id) FILTER (WHERE d.platform = 'android')::int AS android,
    count(DISTINCT d.user_id) FILTER (WHERE d.platform = 'ios')::int     AS ios,
    count(DISTINCT d.user_id) FILTER (
      WHERE d.platform IS NULL OR d.platform NOT IN ('android', 'ios')
    )::int AS otras,
    count(DISTINCT d.user_id) FILTER (
      WHERE d.created_at < v.semana_desde
    )::int AS usuarios_con_app_prev
  FROM v LEFT JOIN public.user_devices d ON true
  GROUP BY v.semana_desde
)

SELECT
  (SELECT hoy_desde FROM v) AS hoy_desde,
  eventos.usuarios_hoy,
  eventos.usuarios_ayer,
  eventos.usuarios_semana,
  eventos.usuarios_semana_prev,
  eventos.anonimos_hoy,
  eventos.anonimos_ayer,
  sesiones.*,
  app.*,
  eventos.usuarios_30d,
  eventos.anonimos_hoy_web,
  eventos.anonimos_hoy_app,
  eventos.anonimos_ayer_web,
  eventos.anonimos_ayer_app,
  (SELECT ayer_hasta FROM v) AS ayer_hasta,
  -- Nueva: desde cuándo cuenta `seg_prom_total`.
  (SELECT mes_desde FROM v) AS sesiones_desde
FROM eventos, sesiones, app;

REVOKE ALL ON public.admin_resumen_actividad FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- VERIFICAR: tiene que devolver una fila con `usuarios_30d` y `sesiones_desde`.
--
--   SELECT usuarios_30d, usuarios_semana, sesiones_hoy, seg_prom_total, sesiones_desde
--     FROM public.admin_resumen_actividad;
-- ----------------------------------------------------------------
