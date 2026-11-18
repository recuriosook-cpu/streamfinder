-- ================================================================
-- GLYNBOX — Panel de la app: anuncios vistos por lugar
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez. No cambia datos.
-- ================================================================
--
-- `admin_app_medicion()` (definición de producción del 18/11) suma, en
-- `anuncios`:
--   · vistosDesde: el primer día completo con `ad_visto` en la ventana de
--     30 días (el siguiente al primero que tiene alguno).
--   · vistos: por lugar y plataforma, cargados desde ese día, vistos que se
--     cargaron ahí (vistos) y vistos que llegaron reusados de otro lugar
--     (reusados). Los cargados no se separan por reusado: un anuncio se carga
--     una vez, en el lugar que lo pidió.
-- El resto de la función queda igual. Lee `analytics_dia_evento`, que llena
-- `analytics_resumir` cada hora (ver supabase-ad-visto-2026-11.sql).
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_app_medicion()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH
-- Onboarding: el flujo sale de la plataforma y de props.flujo.
onb AS (
  SELECT name, anon_id, created_at, props->>'paso' AS paso,
         CASE WHEN platform = 'mobile'
              THEN CASE WHEN props->>'flujo' = 'corto' THEN 'app_corto' ELSE 'app_viejo' END
              ELSE CASE WHEN props->>'flujo' = 'corto' THEN 'web_corto' ELSE 'web' END
         END AS flujo
    FROM analytics_events
   WHERE is_bot = false
     AND name IN ('onboarding_step_viewed', 'onboarding_skipped')
),
-- "Vio sus recomendaciones", el último paso de los flujos cortos.
recos AS (
  SELECT anon_id, created_at,
         CASE WHEN platform = 'mobile' THEN 'app_corto' ELSE 'web_corto' END AS flujo
    FROM analytics_events
   WHERE is_bot = false
     AND name = 'page_view'
     AND path = '/onboarding/recomendaciones'
),
-- Cuántos pasos tiene cada flujo (FLUJOS en la ruta).
flujos(flujo, pasos) AS (
  VALUES ('app_corto', 3), ('app_viejo', 6), ('web_corto', 3), ('web', 5)
),
onb_flujos AS (
  SELECT f.flujo,
         (SELECT min(t.created_at) FROM (SELECT created_at FROM onb WHERE onb.flujo = f.flujo
                                          UNION ALL SELECT created_at FROM recos WHERE recos.flujo = f.flujo) t) AS desde,
         (SELECT max(t.created_at) FROM (SELECT created_at FROM onb WHERE onb.flujo = f.flujo
                                          UNION ALL SELECT created_at FROM recos WHERE recos.flujo = f.flujo) t) AS ultimo,
         (SELECT count(DISTINCT anon_id) FROM recos WHERE recos.flujo = f.flujo) AS recos,
         (SELECT count(DISTINCT anon_id) FROM onb
           WHERE onb.flujo = f.flujo AND onb.name = 'onboarding_skipped'
             AND NOT coalesce(onb.paso = ANY (ARRAY(SELECT g::text FROM generate_series(1, f.pasos) g)), false)
         ) AS saltos_sin_paso,
         (SELECT coalesce(jsonb_agg(jsonb_build_object('paso', p.paso, 'vieron', p.vieron, 'saltearon', p.saltearon)), '[]')
            FROM (SELECT paso,
                         count(DISTINCT anon_id) FILTER (WHERE name = 'onboarding_step_viewed') AS vieron,
                         count(DISTINCT anon_id) FILTER (WHERE name = 'onboarding_skipped') AS saltearon
                    FROM onb WHERE onb.flujo = f.flujo
                   GROUP BY paso) p
         ) AS pasos
    FROM flujos f
),
-- Notificaciones: el camino es el origen, salvo los builds de prueba de la
-- 1.0.16, que mandaban origen 'recordatorio' y el camino en momento.
push AS (
  SELECT name, anon_id, created_at, props->>'resultado' AS resultado,
         CASE WHEN coalesce(props->>'origen', 'sin origen') = 'recordatorio'
              THEN coalesce(props->>'momento', 'recordatorio')
              ELSE coalesce(props->>'origen', 'sin origen')
         END AS camino
    FROM analytics_events
   WHERE is_bot = false
     AND name IN ('push_ofrecido', 'push_aceptado', 'push_ahora_no', 'push_ajustes_abiertos',
                  'push_activado', 'push_provisional', 'push_provisional_resultado')
),
push_personas AS (
  SELECT camino, anon_id, min(created_at) AS primero,
         bool_or(name = 'push_ofrecido') AS vio,
         bool_or(name IN ('push_aceptado', 'push_ajustes_abiertos')) AS toco,
         -- Antes de la 1.0.16 no existía push_activado.
         bool_or(name = 'push_activado' OR (name = 'push_aceptado' AND resultado = 'granted')) AS activo,
         bool_or(name = 'push_ahora_no') AS ahora_no
    FROM push
   GROUP BY camino, anon_id
),
caminos AS (
  SELECT camino, min(primero) AS primero,
         count(*) FILTER (WHERE vio) AS vieron,
         count(*) FILTER (WHERE toco) AS tocaron,
         count(*) FILTER (WHERE activo) AS activaron,
         count(*) FILTER (WHERE ahora_no) AS ahora_no,
         count(*) FILTER (WHERE vio AND NOT toco AND NOT ahora_no) AS sin_responder
    FROM push_personas
   GROUP BY camino
),
-- Modo deslizar, de toda la historia: los contadores de cada día por
-- instalación. "primero" y "desde" son el primer evento de ese día.
desl AS (
  SELECT b.anon_id, b.primer_evento, k.key, k.value::bigint AS n
    FROM analytics_dia_instalacion b
    CROSS JOIN LATERAL jsonb_each_text(b.contadores) k
   WHERE k.key LIKE 'deslizar\_%'
),
-- Tarjetas por persona: sus acciones menos las que deshizo, sin bajar de cero.
tarjetas AS (
  SELECT anon_id,
         greatest(0, coalesce(sum(n) FILTER (WHERE key LIKE 'deslizar\_accion:%'), 0)
                   - coalesce(sum(n) FILTER (WHERE key = 'deslizar_deshacer'), 0)) AS n
    FROM desl
   GROUP BY anon_id
),
-- Anuncios, últimos 30 días.
cargados AS (
  SELECT nullif(split_part(detalle, '|', 1), '') AS ubicacion,
         nullif(split_part(detalle, '|', 2), '') AS plataforma,
         dia, eventos
    FROM analytics_dia_evento
   WHERE is_bot = false
     AND name = 'ad_cargado'
     AND dia >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 30
),
-- Vistos (`ad_visto`, desde la app 1.0.21) contra cargados del mismo lugar y
-- plataforma, desde el primer día COMPLETO con vistos: el 18/11 llegaron
-- recién desde que /api/track los aceptó, y contra los cargados de todo el
-- día darían de menos. `reusado` = se cargó para otro lugar y se vio en este.
vistos AS (
  SELECT nullif(split_part(detalle, '|', 1), '') AS ubicacion,
         nullif(split_part(detalle, '|', 2), '') AS plataforma,
         split_part(detalle, '|', 3) = 'true' AS reusado,
         dia, eventos
    FROM analytics_dia_evento
   WHERE is_bot = false
     AND name = 'ad_visto'
     AND dia >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 30
),
vistos_desde AS (
  SELECT min(dia) + 1 AS dia FROM vistos
),
vistos_lugar AS (
  SELECT coalesce(c.ubicacion, v.ubicacion) AS ubicacion,
         coalesce(c.plataforma, v.plataforma) AS plataforma,
         coalesce(c.cargados, 0) AS cargados,
         coalesce(v.propios, 0) AS vistos,
         coalesce(v.reusados, 0) AS reusados
    FROM (SELECT ubicacion, plataforma, sum(eventos) AS cargados
            FROM cargados, vistos_desde d
           WHERE ubicacion IS NOT NULL AND cargados.dia >= d.dia
           GROUP BY 1, 2) c
    FULL JOIN (SELECT ubicacion, plataforma,
                      sum(eventos) FILTER (WHERE NOT reusado) AS propios,
                      sum(eventos) FILTER (WHERE reusado) AS reusados
                 FROM vistos, vistos_desde d
                WHERE ubicacion IS NOT NULL AND vistos.dia >= d.dia
                GROUP BY 1, 2) v
      ON v.ubicacion = c.ubicacion AND v.plataforma = c.plataforma
),
fallos AS (
  SELECT coalesce(context->>'ubicacion', '') AS ubicacion,
         count(*) AS total,
         count(*) FILTER (WHERE coalesce(context->>'code', '') LIKE '%no-fill%') AS sin_relleno
    FROM client_errors
   WHERE scope = 'ads.load'
     AND created_at >= now() - interval '30 days'
   GROUP BY 1
)
SELECT jsonb_build_object(
  'onboarding', (SELECT jsonb_agg(to_jsonb(o)) FROM onb_flujos o),
  'notificaciones', jsonb_build_object(
    'desde', (SELECT min(created_at) FROM push),
    'caminos', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.primero), '[]') FROM caminos c),
    'provisional', (SELECT jsonb_build_object(
        'loTienen',     count(DISTINCT anon_id) FILTER (WHERE name = 'push_provisional'),
        'normales',     count(DISTINCT anon_id) FILTER (WHERE name = 'push_provisional_resultado' AND resultado = 'normales'),
        'desactivadas', count(DISTINCT anon_id) FILTER (WHERE name = 'push_provisional_resultado' AND resultado = 'desactivadas'))
      FROM push)
  ),
  'deslizar', jsonb_build_object(
    'desde', (SELECT min(primer_evento) FROM desl),
    'aperturas', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.primero), '[]')
                    FROM (SELECT substr(key, length('deslizar_abierto:') + 1) AS origen,
                                 min(primer_evento) AS primero, sum(n) AS veces,
                                 count(DISTINCT anon_id) AS personas
                            FROM desl WHERE key LIKE 'deslizar\_abierto:%' GROUP BY 1) a),
    'personas', (SELECT count(*) FROM tarjetas),
    'tarjetasPromedio', (SELECT round(avg(n), 1) FROM tarjetas),
    'tarjetasMediana', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n) FROM tarjetas),
    'acciones', (SELECT coalesce(jsonb_object_agg(accion, veces), '{}')
                   FROM (SELECT substr(key, length('deslizar_accion:') + 1) AS accion, sum(n) AS veces
                           FROM desl WHERE key LIKE 'deslizar\_accion:_%' GROUP BY 1) x),
    'totalAcciones', (SELECT coalesce(sum(n), 0) FROM desl WHERE key LIKE 'deslizar\_accion:%'),
    'deshechas', (SELECT coalesce(sum(n), 0) FROM desl WHERE key = 'deslizar_deshacer')
  ),
  'anuncios', jsonb_build_object(
    -- El diagnóstico de Ajustes cuenta para "desde" y no para "sin lugar",
    -- como antes; la ruta lo saca de la lista.
    'desde', (SELECT min(dia)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'
                FROM cargados WHERE ubicacion IS NOT NULL),
    'sinLugar', (SELECT coalesce(sum(eventos), 0) FROM cargados WHERE ubicacion IS NULL),
    'cargados', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]')
                   FROM (SELECT ubicacion, sum(eventos) AS cargados,
                                coalesce(sum(eventos) FILTER (WHERE plataforma = 'android'), 0) AS android,
                                coalesce(sum(eventos) FILTER (WHERE plataforma = 'ios'), 0) AS ios
                           FROM cargados WHERE ubicacion IS NOT NULL GROUP BY ubicacion) x),
    'fallos', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.ubicacion), '[]') FROM fallos f),
    'vistosDesde', (SELECT dia::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires' FROM vistos_desde),
    'vistos', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') FROM vistos_lugar x
                WHERE x.plataforma IN ('android', 'ios'))
  )
)
$function$
;
