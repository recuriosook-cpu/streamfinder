-- ================================================================
-- GLYNBOX — Sesiones de bots que quedaban en analytics_sesion
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez.
-- ================================================================
--
-- El 21/11 el panel mostró 660 sesiones web "sin dato de aparato". Eran del
-- robot de ráfagas (US y HK, 2 eventos, 0 s), ya marcadas como bot por
-- analytics_marcar_rafagas. Pero analytics_resumir había guardado la sesión
-- antes de la marca, y analytics_sesion sólo recibía INSERT ... ON CONFLICT:
-- nunca se borraba. analytics_dia_instalacion sí se rehace sin bots, así que
-- la sesión quedaba sin aparato. Inflaban también "Sesiones hoy" y la duración
-- promedio: 164 el 19/11, 6.510 el 20/11 y 660 el 21/11.
--
--   1. analytics_resumir (definición de producción del 21/11) borra, en el
--      rango que rehace, las sesiones con eventos bot y ninguno humano.
--   2. Limpieza única de lo que ya estaba (corrida el 21/11).
-- ================================================================

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
             WHERE name NOT IN ('ad_cargado', 'ad_visto', 'ads_estado')
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

  -- Sesiones que resultaron ser de bots. La sesión se guarda en los minutos
  -- entre que llegan los eventos y algo los marca como bot (el cron de ráfagas
  -- de las :05, un UPDATE a mano); el INSERT de abajo sólo suma, así que sin
  -- esto la sesión queda contada para siempre, sin aparato y con 0 s.
  -- Se borra la que tiene algún evento bot en el rango y ninguno humano.
  DELETE FROM analytics_sesion s
   USING (SELECT DISTINCT b.session_id FROM analytics_events b
           WHERE b.is_bot = true AND b.created_at >= t0 AND b.created_at < t1) bot
   WHERE s.session_id = bot.session_id
     AND NOT EXISTS (SELECT 1 FROM analytics_events h
                      WHERE h.is_bot = false AND h.session_id = s.session_id);

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
              WHEN e.name = 'ad_visto'
              THEN coalesce(e.props->>'ubicacion', '') || '|' || coalesce(e.props->>'plataforma', '')
                   || '|' || coalesce(e.props->>'reusado', '')
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


-- Limpieza única: sesiones cuyos eventos que quedan son todos bot. Las que
-- ya no tienen eventos (borrados por analytics_limpiar) no se tocan: no hay
-- forma de saber qué eran.
DELETE FROM public.analytics_sesion s
 USING (SELECT DISTINCT b.session_id FROM public.analytics_events b
         WHERE b.is_bot = true AND b.created_at >= now() - interval '7 days') bot
 WHERE s.session_id = bot.session_id
   AND NOT EXISTS (SELECT 1 FROM public.analytics_events h
                    WHERE h.is_bot = false AND h.session_id = s.session_id);
