-- ════════════════════════════════════════════════════════════════════════════
-- De dónde vienen las visitas web — 17/11/2026
--
-- Bloque "De dónde vienen las visitas web" de /admin/metricas
-- (`app/api/admin/origen-visitas/route.ts`).
--
-- Desde el 17/11/2026 el primer page_view de cada visita web lleva de dónde
-- vino (`lib/referencia.ts`): ref (dominio o package de Android), navegador
-- (el de adentro de TikTok, Instagram o Facebook), utm_* y clic (la red del id
-- de clic del anuncio). Las visitas de antes no lo tienen: salen "sin_dato".
--
-- Dos cambios, que ya corren en producción:
--   1. analytics_origen_visitas(p_dias): visitas por origen y aparato, cuántas
--      entraron a /descargar y cuántas tocaron la tienda (desde /descargar o
--      desde el aviso). ~110 ms con 30 días; no hace falta precalcularla.
--   2. analytics_limpiar: el page_view con 'ref' se guarda 30 días, como los
--      de las sesiones de /descargar. Si no, a los 7 días se perdía el origen.
--      Es uno por visita: ~1.000 filas por día.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.analytics_origen_visitas(p_dias integer DEFAULT 30)
 RETURNS TABLE(origen text, aparato text, visitas bigint, a_descargar bigint, tienda_descargar bigint, tienda_aviso bigint)
 LANGUAGE sql
 STABLE
AS $function$
  WITH desde AS (SELECT now() - make_interval(days => GREATEST(p_dias, 1)) AS t),
  entrada AS (
    SELECT DISTINCT ON (e.session_id)
           e.session_id,
           e.props->>'ref'          AS ref,
           e.props->>'navegador'    AS navegador,
           e.props->>'clic'         AS clic,
           lower(e.props->>'utm_source') AS us,
           e.props->>'aparato'      AS aparato
      FROM public.analytics_events e, desde
     WHERE e.is_bot = false AND e.name = 'page_view' AND e.platform = 'web'
       AND e.created_at >= desde.t AND e.props ? 'ref'
     ORDER BY e.session_id, e.created_at
  ),
  acciones AS (
    SELECT e.session_id,
           bool_or(e.name = 'descargar_viewed') AS descargar,
           bool_or(e.name = 'descargar_clicked' AND e.props->>'destino' IN ('play_store', 'app_store')) AS tienda_descargar,
           bool_or(e.name = 'aviso_app_descargar') AS tienda_aviso,
           max(e.props->>'aparato') AS aparato
      FROM public.analytics_events e, desde
     WHERE e.is_bot = false AND e.platform = 'web'
       AND e.name IN ('descargar_viewed', 'descargar_clicked', 'aviso_app_descargar')
       AND e.created_at >= desde.t
     GROUP BY e.session_id
  ),
  sesiones AS (
    SELECT coalesce(n.aparato, a.aparato) AS aparato,
           CASE
             WHEN n.session_id IS NULL THEN 'sin_dato'
             WHEN n.navegador = 'tiktok' OR n.clic = 'tiktok' OR n.us LIKE '%tiktok%'
               OR n.ref ~ '(^|\.)tiktok\.com$' OR n.ref IN ('app:com.zhiliaoapp.musically', 'app:com.ss.android.ugc.trill') THEN 'tiktok'
             WHEN n.navegador = 'instagram' OR n.us ~ '^(ig|instagram)'
               OR n.ref ~ '(^|\.)instagram\.com$' OR n.ref = 'app:com.instagram.android' THEN 'instagram'
             WHEN n.navegador = 'facebook' OR n.clic = 'meta' OR n.us ~ '^(fb|facebook|meta)'
               OR n.ref ~ '(^|\.)facebook\.com$' OR n.ref LIKE 'app:com.facebook.%' THEN 'facebook'
             WHEN n.us LIKE '%whatsapp%' OR n.ref LIKE 'app:com.whatsapp%'
               OR n.ref ~ '(^|\.)(whatsapp\.com|wa\.me)$' THEN 'whatsapp'
             WHEN n.clic = 'google' OR n.us LIKE 'google%'
               OR n.ref ~ '(^|\.)google\.[a-z.]+$' OR n.ref = 'app:com.google.android.googlequicksearchbox' THEN 'google'
             WHEN n.ref = 'directo' AND n.us IS NULL THEN 'directo'
             ELSE 'otros'
           END AS origen,
           coalesce(a.descargar, false) AS descargar,
           coalesce(a.tienda_descargar, false) AS tienda_descargar,
           coalesce(a.tienda_aviso, false) AS tienda_aviso
      FROM entrada n
      FULL JOIN acciones a USING (session_id)
  )
  SELECT origen, coalesce(aparato, 'desconocido') AS aparato,
         count(*)::bigint AS visitas,
         count(*) FILTER (WHERE descargar)::bigint AS a_descargar,
         count(*) FILTER (WHERE tienda_descargar)::bigint AS tienda_descargar,
         count(*) FILTER (WHERE tienda_aviso)::bigint AS tienda_aviso
    FROM sesiones
   GROUP BY 1, 2
  ;
$function$;

REVOKE ALL ON FUNCTION public.analytics_origen_visitas(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_origen_visitas(integer) TO service_role;

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
    'page_view', 'deslizar_accion', 'media_rated', 'ad_cargado', 'media_opened',
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
