-- ================================================================
-- GLYNBOX — `ad_visto` en el resumen diario y en la limpieza
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez. No cambia datos.
-- ================================================================
--
-- La app manda `ad_visto` desde la 1.0.21 (Google contó la impresión de un
-- anuncio nativo; props: { plataforma, version, ubicacion, reusado }), pero
-- `/api/track` no lo tenía en la lista de eventos aceptados y lo descartaba
-- sin avisar. El commit que acompaña este archivo lo agrega.
--
-- Acá, sobre las definiciones de producción del 18/11:
--   1. `analytics_resumir`: `analytics_dia_evento.detalle` de `ad_visto` es
--      '<ubicacion>|<plataforma>|<reusado>' (reusado = 'true' | 'false'), para
--      comparar vistos contra `ad_cargado` ('<ubicacion>|<plataforma>') por
--      lugar y plataforma. Y no cuenta en la actividad por hora, igual que
--      `ad_cargado`: es técnico, no algo que hizo la persona.
--   2. `analytics_limpiar`: `ad_visto` entra en los masivos (7 días), como
--      `ad_cargado`. Lo que queda para siempre es el resumen.
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
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_limpiar(p_dias_masivos integer DEFAULT 7, p_dias_resto integer DEFAULT 60, p_dias_bots integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
 SET statement_timeout TO '15min'
AS $function$
DECLARE
  tz CONSTANT text := 'America/Argentina/Buenos_Aires';
  hoy date := (now() AT TIME ZONE tz)::date;
  masivos_nombres CONSTANT text[] := ARRAY[
    'page_view', 'deslizar_accion', 'media_rated', 'ad_cargado', 'ad_visto', 'media_opened',
    'ads_estado', 'app_open', 'search_performed', 'watchlist_added',
    'que_veo_hoy_accion', 'que_veo_hoy_resultado', 'recomendaciones_regeneradas'
  ];
  dias_descargar CONSTANT int := 30;
  lote CONSTANT int := 20000;
  d   date;
  n   int;
  bots int := 0;
  masivos int := 0;
  resto int := 0;
BEGIN
  -- Con menos de 3 días se podría borrar algo antes de resumirlo.
  IF p_dias_bots < 3 OR p_dias_masivos < 3 OR p_dias_resto < dias_descargar THEN
    RAISE EXCEPTION 'analytics_limpiar: bots y masivos 3 días o más; el resto, % o más', dias_descargar;
  END IF;

  -- 1. Nada se borra sin resumir: los tres últimos días se rehacen siempre
  --    (el precálculo del panel sólo rehace ayer y hoy), y un día viejo que
  --    nunca se resumió (si el cron estuvo parado), también.
  PERFORM analytics_resumir(hoy - 3, hoy);
  FOR d IN
    SELECT g::date
      FROM generate_series(
             (SELECT (min(created_at) AT TIME ZONE tz)::date FROM analytics_events),
             hoy - 4, interval '1 day') g
     WHERE NOT EXISTS (SELECT 1 FROM analytics_dia_evento c WHERE c.dia = g::date)
  LOOP
    PERFORM analytics_resumir(d, d);
  END LOOP;

  -- 2. Bots.
  LOOP
    DELETE FROM analytics_events
     WHERE ctid IN (SELECT ctid FROM analytics_events
                     WHERE is_bot = true
                       AND created_at < now() - make_interval(days => p_dias_bots)
                     LIMIT lote);
    GET DIAGNOSTICS n = ROW_COUNT;
    bots := bots + n;
    EXIT WHEN n < lote;
  END LOOP;

  -- 3. Los masivos. Los de las sesiones de /descargar, a los 30 días. También
  --    el primer page_view de cada visita web (el que lleva 'ref', desde el
  --    17/11/2026): dice de dónde vino, y el bloque de origen del panel mira 30 días.
  LOOP
    DELETE FROM analytics_events
     WHERE ctid IN (SELECT e.ctid FROM analytics_events e
                     WHERE e.is_bot = false
                       AND e.name = ANY (masivos_nombres)
                       AND e.created_at < now() - make_interval(days => p_dias_masivos)
                       AND NOT (e.name = 'page_view' AND e.path IN ('/auth', '/onboarding/recomendaciones'))
                       AND (e.created_at < now() - make_interval(days => dias_descargar)
                            OR (NOT (e.name = 'page_view' AND e.props ? 'ref')
                                AND NOT EXISTS (SELECT 1 FROM analytics_events m
                                            WHERE m.session_id = e.session_id
                                              AND m.is_bot = false
                                              AND m.props->>'origen' = 'descargar')))
                     LIMIT lote);
    GET DIAGNOSTICS n = ROW_COUNT;
    masivos := masivos + n;
    EXIT WHEN n < lote;
  END LOOP;

  -- 4. Todo lo demás.
  LOOP
    DELETE FROM analytics_events
     WHERE ctid IN (SELECT ctid FROM analytics_events
                     WHERE is_bot = false
                       AND created_at < now() - make_interval(days => p_dias_resto)
                     LIMIT lote);
    GET DIAGNOSTICS n = ROW_COUNT;
    resto := resto + n;
    EXIT WHEN n < lote;
  END LOOP;

  RETURN jsonb_build_object('bots', bots, 'masivos', masivos, 'resto', resto);
END
$function$
;
