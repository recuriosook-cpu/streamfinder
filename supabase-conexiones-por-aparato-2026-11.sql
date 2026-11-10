-- ================================================================
-- GLYNBOX — "Se conectaron hoy" y "Sesiones hoy" por aparato
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez. No cambia datos (la columna nueva arranca vacía).
-- ================================================================
--
-- El Resumen del panel separa esas dos tarjetas en web desde computadora, web
-- desde el celular y app. La app ya se distinguía (`platform = 'mobile'`); la
-- web no guardaba nada del aparato: ni el user-agent ni una prop.
--
-- Desde el commit que acompaña este archivo, cada evento de la web trae
-- `props.aparato` = 'computadora' | 'celular' (lo pone el navegador, que sabe
-- separar un iPad de una Mac; si no viene, `/api/track` lo saca del
-- user-agent). Tablets cuentan como celular, igual que para el aviso de la app.
--
-- Acá:
--   1. `analytics_dia_instalacion.aparato`: el último aparato visto ese día
--      para ese navegador. Sólo en la web; en la app queda NULL.
--   2. `analytics_resumir` lo llena (resto de la función, sin cambios: es la
--      definición de producción del 10/11).
--   3. `admin_resumen_actividad` suma, al final, las columnas por aparato.
--      Las de antes quedan iguales, mismo orden y tipos (CREATE OR REPLACE VIEW).
--
-- Lo de antes del cambio no tiene aparato y no se puede recuperar: esos
-- navegadores salen en `*_web_sin_aparato`. El primer día, "ayer" por aparato
-- es 0.
-- ================================================================

ALTER TABLE public.analytics_dia_instalacion ADD COLUMN IF NOT EXISTS aparato text;

CREATE OR REPLACE FUNCTION public.analytics_resumir(p_desde date, p_hasta date)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  tz CONSTANT text := 'America/Argentina/Buenos_Aires';
  t0 timestamptz := p_desde::timestamp AT TIME ZONE tz;
  t1 timestamptz := (p_hasta + 1)::timestamp AT TIME ZONE tz;
BEGIN
  -- Días por instalación.
  DELETE FROM analytics_dia_instalacion WHERE dia BETWEEN p_desde AND p_hasta;

  WITH ev AS (
    SELECT (e.created_at AT TIME ZONE tz)::date AS dia,
           e.anon_id, e.platform, e.user_id, e.created_at, e.name, e.props,
           extract(hour FROM e.created_at AT TIME ZONE tz)::int AS hora
      FROM analytics_events e
     WHERE e.is_bot = false
       AND e.created_at >= t0 AND e.created_at < t1
  ),
  base AS (
    SELECT dia, anon_id, platform,
           coalesce(array_agg(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL), '{}') AS usuarios,
           (array_agg(user_id ORDER BY created_at DESC) FILTER (WHERE user_id IS NOT NULL))[1] AS ultimo_usuario,
           (array_agg(coalesce(props->>'os', props->>'plataforma') ORDER BY created_at DESC)
              FILTER (WHERE coalesce(props->>'os', props->>'plataforma') IN ('android', 'ios')))[1] AS sistema,
           (array_agg(props->>'os' ORDER BY created_at DESC)
              FILTER (WHERE props->>'os' IN ('android', 'ios')))[1] AS os,
           (array_agg(props->>'idioma' ORDER BY created_at DESC)
              FILTER (WHERE name IN ('app_open', 'idioma_cambiado') AND props->>'idioma' IN ('es', 'en')))[1] AS idioma,
           -- Nuevo: computadora o celular, sólo en la web.
           (array_agg(props->>'aparato' ORDER BY created_at DESC)
              FILTER (WHERE platform = 'web' AND props->>'aparato' IN ('computadora', 'celular')))[1] AS aparato,
           count(*)::int AS eventos,
           min(created_at) AS primer_evento,
           max(created_at) AS ultimo_evento
      FROM ev
     GROUP BY dia, anon_id, platform
  ),
  horas AS (
    SELECT dia, anon_id, platform, jsonb_object_agg(hora::text, n) AS eventos_hora
      FROM (SELECT dia, anon_id, platform, hora, count(*) AS n
              FROM ev
             WHERE name NOT IN ('ad_cargado', 'ads_estado')
             GROUP BY 1, 2, 3, 4) h
     GROUP BY dia, anon_id, platform
  ),
  claves AS (
    SELECT dia, anon_id, platform, jsonb_object_agg(clave, n) AS contadores
      FROM (SELECT dia, anon_id, platform,
                   CASE name
                     WHEN 'deslizar_accion'  THEN 'deslizar_accion:'  || coalesce(props->>'accion', '')
                     WHEN 'deslizar_abierto' THEN 'deslizar_abierto:' || coalesce(props->>'origen', 'desconocido')
                     ELSE name
                   END AS clave,
                   count(*) AS n
              FROM ev
             WHERE name IN ('deslizar_accion', 'deslizar_abierto', 'deslizar_deshacer', 'app_open')
             GROUP BY 1, 2, 3, 4) k
     GROUP BY dia, anon_id, platform
  )
  INSERT INTO analytics_dia_instalacion
    (dia, anon_id, platform, usuarios, ultimo_usuario, sistema, os, idioma, aparato,
     eventos, primer_evento, ultimo_evento, eventos_hora, contadores)
  SELECT b.dia, b.anon_id, b.platform, b.usuarios, b.ultimo_usuario, b.sistema, b.os, b.idioma, b.aparato,
         b.eventos, b.primer_evento, b.ultimo_evento,
         coalesce(h.eventos_hora, '{}'), coalesce(c.contadores, '{}')
    FROM base b
    LEFT JOIN horas  h USING (dia, anon_id, platform)
    LEFT JOIN claves c USING (dia, anon_id, platform);

  -- Sesiones con algún evento en el rango, contadas con todos sus eventos.
  INSERT INTO analytics_sesion (session_id, anon_id, user_id, platform, eventos, paginas, inicio, fin)
  SELECT e.session_id,
         (array_agg(e.anon_id  ORDER BY e.created_at DESC))[1],
         (array_agg(e.user_id  ORDER BY e.created_at DESC) FILTER (WHERE e.user_id IS NOT NULL))[1],
         (array_agg(e.platform ORDER BY e.created_at DESC))[1],
         count(*),
         count(*) FILTER (WHERE e.name = 'page_view'),
         min(e.created_at),
         max(e.created_at)
    FROM analytics_events e
   WHERE e.is_bot = false
     AND e.session_id IN (SELECT DISTINCT x.session_id FROM analytics_events x
                           WHERE x.is_bot = false AND x.created_at >= t0 AND x.created_at < t1)
   GROUP BY e.session_id
  ON CONFLICT (session_id) DO UPDATE SET
    anon_id  = EXCLUDED.anon_id,
    user_id  = coalesce(EXCLUDED.user_id, analytics_sesion.user_id),
    platform = EXCLUDED.platform,
    eventos  = greatest(EXCLUDED.eventos, analytics_sesion.eventos),
    paginas  = greatest(EXCLUDED.paginas, analytics_sesion.paginas),
    inicio   = least(EXCLUDED.inicio, analytics_sesion.inicio),
    fin      = greatest(EXCLUDED.fin, analytics_sesion.fin);

  -- Por día y evento, bots incluidos.
  DELETE FROM analytics_dia_evento WHERE dia BETWEEN p_desde AND p_hasta;

  INSERT INTO analytics_dia_evento (dia, name, platform, is_bot, detalle, eventos, personas)
  SELECT (e.created_at AT TIME ZONE tz)::date, e.name, e.platform, e.is_bot,
         CASE WHEN e.name = 'ad_cargado'
              THEN coalesce(e.props->>'ubicacion', '') || '|' || coalesce(e.props->>'plataforma', '')
              ELSE '' END,
         count(*), count(DISTINCT e.anon_id)
    -- En dos partes para que cada una vaya por su índice parcial.
    FROM (SELECT * FROM analytics_events
           WHERE is_bot = false AND created_at >= t0 AND created_at < t1
          UNION ALL
          SELECT * FROM analytics_events
           WHERE is_bot = true AND created_at >= t0 AND created_at < t1) e
   GROUP BY 1, 2, 3, 4, 5;
END
$function$;

CREATE OR REPLACE VIEW public.admin_resumen_actividad AS
WITH v AS (
  SELECT d.hoy_desde,
         d.hoy_desde - '1 day'::interval AS ayer_desde,
         d.hoy_desde - '1 day'::interval + (now() - d.hoy_desde) AS ayer_hasta,
         d.hoy_desde - '6 days'::interval AS semana_desde,
         d.hoy_desde - '13 days'::interval AS semana_prev_desde,
         d.hoy_desde - '29 days'::interval AS mes_desde,
         d.hoy
    FROM (SELECT (date_trunc('day', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires') AS hoy_desde,
                 (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS hoy) d
),
dias AS (
  SELECT b.anon_id, b.platform, b.dia, b.primer_evento, b.aparato, x.user_id
    FROM analytics_dia_instalacion b
    CROSS JOIN LATERAL unnest(
      CASE WHEN cardinality(b.usuarios) = 0 THEN ARRAY[NULL::uuid] ELSE b.usuarios END
    ) x(user_id),
    v
   WHERE b.dia >= v.hoy - 29
),
marcas AS (
  SELECT dias.anon_id, dias.user_id, dias.platform,
         bool_or(dias.dia = v.hoy) AS hoy,
         bool_or(dias.dia = v.hoy - 1 AND dias.primer_evento < v.ayer_hasta) AS ayer,
         bool_or(dias.dia >= v.hoy - 6) AS semana,
         bool_or(dias.dia >= v.hoy - 13 AND dias.dia < v.hoy - 6) AS semana_prev,
         -- Nuevas: por aparato (sólo tienen sentido con platform = 'web').
         bool_or(dias.dia = v.hoy AND dias.aparato = 'computadora') AS hoy_pc,
         bool_or(dias.dia = v.hoy AND dias.aparato = 'celular') AS hoy_cel,
         bool_or(dias.dia = v.hoy AND dias.aparato IS NULL) AS hoy_sin_aparato,
         bool_or(dias.dia = v.hoy - 1 AND dias.primer_evento < v.ayer_hasta AND dias.aparato = 'computadora') AS ayer_pc,
         bool_or(dias.dia = v.hoy - 1 AND dias.primer_evento < v.ayer_hasta AND dias.aparato = 'celular') AS ayer_cel
    FROM dias, v
   GROUP BY dias.anon_id, dias.user_id, dias.platform
),
eventos AS (
  SELECT count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND hoy) AS usuarios_hoy,
         count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND ayer) AS usuarios_ayer,
         count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND semana) AS usuarios_semana,
         count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND semana_prev) AS usuarios_semana_prev,
         count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS usuarios_30d,
         count(DISTINCT anon_id) FILTER (WHERE hoy) - count(DISTINCT anon_id) FILTER (WHERE hoy AND user_id IS NOT NULL) AS anonimos_hoy,
         count(DISTINCT anon_id) FILTER (WHERE ayer) - count(DISTINCT anon_id) FILTER (WHERE ayer AND user_id IS NOT NULL) AS anonimos_ayer,
         count(DISTINCT anon_id) FILTER (WHERE platform = 'web' AND hoy) - count(DISTINCT anon_id) FILTER (WHERE platform = 'web' AND hoy AND user_id IS NOT NULL) AS anonimos_hoy_web,
         count(DISTINCT anon_id) FILTER (WHERE platform = 'mobile' AND hoy) - count(DISTINCT anon_id) FILTER (WHERE platform = 'mobile' AND hoy AND user_id IS NOT NULL) AS anonimos_hoy_app,
         count(DISTINCT anon_id) FILTER (WHERE platform = 'web' AND ayer) - count(DISTINCT anon_id) FILTER (WHERE platform = 'web' AND ayer AND user_id IS NOT NULL) AS anonimos_ayer_web,
         count(DISTINCT anon_id) FILTER (WHERE platform = 'mobile' AND ayer) - count(DISTINCT anon_id) FILTER (WHERE platform = 'mobile' AND ayer AND user_id IS NOT NULL) AS anonimos_ayer_app,
         -- Nuevas: usuarios con sesión iniciada, por aparato. Quien entró por
         -- dos lados cuenta en los dos: no suman `usuarios_hoy`.
         count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND platform = 'web' AND hoy_pc) AS usuarios_hoy_pc,
         count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND platform = 'web' AND hoy_cel) AS usuarios_hoy_cel,
         count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND platform = 'mobile' AND hoy) AS usuarios_hoy_app,
         count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND platform = 'web' AND hoy_sin_aparato) AS usuarios_hoy_web_sin_aparato,
         count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND platform = 'web' AND ayer_pc) AS usuarios_ayer_pc,
         count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND platform = 'web' AND ayer_cel) AS usuarios_ayer_cel,
         count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND platform = 'mobile' AND ayer) AS usuarios_ayer_app
    FROM marcas
),
ses AS (
  SELECT s.inicio,
         LEAST(CASE WHEN s.eventos = 1 THEN 30::numeric ELSE EXTRACT(epoch FROM s.fin - s.inicio) END, 1800::numeric) AS segundos
    FROM analytics_sesion s, v
   WHERE s.fin >= v.mes_desde
),
sesiones AS (
  SELECT count(s.inicio) FILTER (WHERE s.inicio >= v.hoy_desde) AS sesiones_hoy,
         count(s.inicio) FILTER (WHERE s.inicio >= v.ayer_desde AND s.inicio < v.ayer_hasta) AS sesiones_ayer,
         round(avg(s.segundos) FILTER (WHERE s.inicio >= v.hoy_desde))::integer AS seg_prom_hoy,
         round(avg(s.segundos) FILTER (WHERE s.inicio >= v.ayer_desde AND s.inicio < v.ayer_hasta))::integer AS seg_prom_ayer,
         round(avg(s.segundos))::integer AS seg_prom_total
    FROM v
    LEFT JOIN ses s ON true
   GROUP BY v.hoy_desde, v.ayer_desde, v.ayer_hasta
),
-- Nuevo: las sesiones de hoy y ayer con el aparato del navegador ese día.
ses_aparato AS (
  SELECT s.platform, di.aparato,
         s.inicio >= v.hoy_desde AS es_hoy,
         s.inicio >= v.ayer_desde AND s.inicio < v.ayer_hasta AS es_ayer
    FROM v
    JOIN analytics_sesion s ON s.inicio >= v.ayer_desde
    LEFT JOIN analytics_dia_instalacion di
           ON di.dia = (s.inicio AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
          AND di.anon_id = s.anon_id
          AND di.platform = s.platform
),
sesiones_aparato AS (
  SELECT count(*) FILTER (WHERE es_hoy  AND platform = 'web' AND aparato = 'computadora') AS sesiones_hoy_pc,
         count(*) FILTER (WHERE es_hoy  AND platform = 'web' AND aparato = 'celular')     AS sesiones_hoy_cel,
         count(*) FILTER (WHERE es_hoy  AND platform = 'mobile')                          AS sesiones_hoy_app,
         count(*) FILTER (WHERE es_hoy  AND platform = 'web' AND aparato IS NULL)         AS sesiones_hoy_web_sin_aparato,
         count(*) FILTER (WHERE es_ayer AND platform = 'web' AND aparato = 'computadora') AS sesiones_ayer_pc,
         count(*) FILTER (WHERE es_ayer AND platform = 'web' AND aparato = 'celular')     AS sesiones_ayer_cel,
         count(*) FILTER (WHERE es_ayer AND platform = 'mobile')                          AS sesiones_ayer_app
    FROM ses_aparato
),
app AS (
  SELECT count(DISTINCT d.user_id)::integer AS usuarios_con_app,
         count(DISTINCT d.user_id) FILTER (WHERE d.platform = 'android')::integer AS android,
         count(DISTINCT d.user_id) FILTER (WHERE d.platform = 'ios')::integer AS ios,
         count(DISTINCT d.user_id) FILTER (WHERE d.platform IS NULL OR d.platform <> ALL (ARRAY['android', 'ios']))::integer AS otras,
         count(DISTINCT d.user_id) FILTER (WHERE d.created_at < v.semana_desde)::integer AS usuarios_con_app_prev
    FROM v
    LEFT JOIN user_devices d ON true
   GROUP BY v.semana_desde
)
SELECT (SELECT hoy_desde FROM v) AS hoy_desde,
       eventos.usuarios_hoy,
       eventos.usuarios_ayer,
       eventos.usuarios_semana,
       eventos.usuarios_semana_prev,
       eventos.anonimos_hoy,
       eventos.anonimos_ayer,
       sesiones.sesiones_hoy,
       sesiones.sesiones_ayer,
       sesiones.seg_prom_hoy,
       sesiones.seg_prom_ayer,
       sesiones.seg_prom_total,
       app.usuarios_con_app,
       app.android,
       app.ios,
       app.otras,
       app.usuarios_con_app_prev,
       eventos.usuarios_30d,
       eventos.anonimos_hoy_web,
       eventos.anonimos_hoy_app,
       eventos.anonimos_ayer_web,
       eventos.anonimos_ayer_app,
       (SELECT ayer_hasta FROM v) AS ayer_hasta,
       (SELECT mes_desde FROM v) AS sesiones_desde,
       -- Nuevas, al final.
       eventos.usuarios_hoy_pc,
       eventos.usuarios_hoy_cel,
       eventos.usuarios_hoy_app,
       eventos.usuarios_hoy_web_sin_aparato,
       eventos.usuarios_ayer_pc,
       eventos.usuarios_ayer_cel,
       eventos.usuarios_ayer_app,
       sesiones_aparato.sesiones_hoy_pc,
       sesiones_aparato.sesiones_hoy_cel,
       sesiones_aparato.sesiones_hoy_app,
       sesiones_aparato.sesiones_hoy_web_sin_aparato,
       sesiones_aparato.sesiones_ayer_pc,
       sesiones_aparato.sesiones_ayer_cel,
       sesiones_aparato.sesiones_ayer_app
  FROM eventos, sesiones, sesiones_aparato, app;

REVOKE ALL ON public.admin_resumen_actividad FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- VERIFICAR: una fila; hasta que llegue el deploy, todo lo de la web cae en
-- `*_web_sin_aparato`.
--
--   SELECT usuarios_hoy, usuarios_hoy_pc, usuarios_hoy_cel, usuarios_hoy_app, usuarios_hoy_web_sin_aparato,
--          sesiones_hoy, sesiones_hoy_pc, sesiones_hoy_cel, sesiones_hoy_app, sesiones_hoy_web_sin_aparato
--     FROM public.admin_resumen_actividad;
-- ----------------------------------------------------------------
