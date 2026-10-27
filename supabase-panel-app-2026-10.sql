-- ================================================================
-- GLYNBOX — Medición e idioma de la app precalculados, retención por día
-- Correr con: npx supabase db query --linked -f supabase-panel-app-2026-10.sql
-- Seguro de correr más de una vez. No borra ni cambia datos de nadie.
-- ================================================================
--
-- 1. "Medición de la app" e "Idioma de la app" (/admin/metricas) daban
--    "canceling statement due to statement timeout": sus rutas bajaban
--    `analytics_events` de a 1000 filas con OFFSET (26.000 `deslizar_accion`,
--    18.000 `ad_cargado`, 29.000 `app_open`), y cada página volvía a ordenar
--    todo hasta pasar los 8 segundos de PostgREST. Ahora lo cuentan dos
--    funciones en la base, `admin_app_medicion()` y `admin_idioma_app()`, y
--    pg_cron las deja en `admin_panel_precalculado` cada 10 minutos, como la
--    landing (supabase-rendimiento-2026-10.sql).
-- 2. `retencion_por_dia(14)`: día 1 y día 7 por día de alta, para el bloque
--    nuevo de Retención. Se calcula cada hora con el resto de retención.
--
-- `admin_panel_precalcular` es la de supabase-rendimiento-2026-10.sql (leída
-- de producción el 27/10) con esas tres claves más.
-- ================================================================


-- ── 1. Medición de la app ──────────────────────────────────────────────────
-- Los conteos de app/api/admin/app-medicion/route.ts. Los nombres, el orden y
-- lo que sale de `user_devices` y `profiles` se arman en la ruta.

CREATE OR REPLACE FUNCTION public.admin_app_medicion()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
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
-- Modo deslizar.
desl AS (
  SELECT name, anon_id, created_at,
         coalesce(props->>'origen', 'desconocido') AS origen,
         props->>'accion' AS accion
    FROM analytics_events
   WHERE is_bot = false
     AND name IN ('deslizar_abierto', 'deslizar_accion', 'deslizar_deshacer')
),
-- Tarjetas por persona: sus acciones menos las que deshizo, sin bajar de cero.
tarjetas AS (
  SELECT anon_id,
         greatest(0, count(*) FILTER (WHERE name = 'deslizar_accion')
                   - count(*) FILTER (WHERE name = 'deslizar_deshacer')) AS n
    FROM desl
   GROUP BY anon_id
),
-- Anuncios, últimos 30 días.
cargados AS (
  SELECT nullif(props->>'ubicacion', '') AS ubicacion, props->>'plataforma' AS plataforma, created_at
    FROM analytics_events
   WHERE is_bot = false
     AND name = 'ad_cargado'
     AND created_at >= now() - interval '30 days'
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
    'desde', (SELECT min(created_at) FROM desl),
    'aperturas', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.primero), '[]')
                    FROM (SELECT origen, min(created_at) AS primero, count(*) AS veces,
                                 count(DISTINCT anon_id) AS personas
                            FROM desl WHERE name = 'deslizar_abierto' GROUP BY origen) a),
    'personas', (SELECT count(*) FROM tarjetas),
    'tarjetasPromedio', (SELECT round(avg(n), 1) FROM tarjetas),
    'tarjetasMediana', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n) FROM tarjetas),
    'acciones', (SELECT coalesce(jsonb_object_agg(accion, veces), '{}')
                   FROM (SELECT accion, count(*) AS veces FROM desl
                          WHERE name = 'deslizar_accion' AND accion IS NOT NULL GROUP BY accion) x),
    'totalAcciones', (SELECT count(*) FROM desl WHERE name = 'deslizar_accion'),
    'deshechas', (SELECT count(*) FROM desl WHERE name = 'deslizar_deshacer')
  ),
  'anuncios', jsonb_build_object(
    -- El diagnóstico de Ajustes cuenta para "desde" y no para "sin lugar",
    -- como antes; la ruta lo saca de la lista.
    'desde', (SELECT min(created_at) FROM cargados WHERE ubicacion IS NOT NULL),
    'sinLugar', (SELECT count(*) FROM cargados WHERE ubicacion IS NULL),
    'cargados', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]')
                   FROM (SELECT ubicacion, count(*) AS cargados,
                                count(*) FILTER (WHERE plataforma = 'android') AS android,
                                count(*) FILTER (WHERE plataforma = 'ios') AS ios
                           FROM cargados WHERE ubicacion IS NOT NULL GROUP BY ubicacion) x),
    'fallos', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.ubicacion), '[]') FROM fallos f)
  )
)
$$;

REVOKE ALL ON FUNCTION public.admin_app_medicion() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_app_medicion() TO service_role;


-- ── 2. Idioma de la app ────────────────────────────────────────────────────
-- Lo mismo que contaba app/api/admin/idioma-app/route.ts, ya con la forma
-- que devuelve la ruta. Una instalación es un anon_id con app_open o
-- idioma_cambiado de la app en 30 días; su idioma es el último que mandó y,
-- si no mandó ninguno, el de `profiles.idioma` de su última cuenta.

CREATE OR REPLACE FUNCTION public.admin_idioma_app()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH
ev AS (
  SELECT name, anon_id, user_id, created_at,
         CASE WHEN props->>'idioma' IN ('es', 'en') THEN props->>'idioma' END AS idioma
    FROM analytics_events
   WHERE is_bot = false
     AND platform = 'mobile'
     AND name IN ('app_open', 'idioma_cambiado')
     AND created_at >= now() - interval '30 days'
),
inst AS (
  SELECT anon_id,
         (array_agg(idioma  ORDER BY created_at DESC) FILTER (WHERE idioma  IS NOT NULL))[1] AS idioma,
         (array_agg(user_id ORDER BY created_at DESC) FILTER (WHERE user_id IS NOT NULL))[1] AS usuario
    FROM ev
   GROUP BY anon_id
),
fin AS (
  SELECT i.idioma AS de_evento,
         CASE WHEN i.idioma IS NULL AND p.idioma IN ('es', 'en') THEN p.idioma END AS de_cuenta
    FROM inst i
    LEFT JOIN profiles p ON i.idioma IS NULL AND p.id = i.usuario
)
SELECT jsonb_build_object(
  'instalaciones', count(*),
  'es', jsonb_build_object(
    'total',  count(*) FILTER (WHERE coalesce(de_evento, de_cuenta) = 'es'),
    'evento', count(*) FILTER (WHERE de_evento = 'es'),
    'cuenta', count(*) FILTER (WHERE de_cuenta = 'es')),
  'en', jsonb_build_object(
    'total',  count(*) FILTER (WHERE coalesce(de_evento, de_cuenta) = 'en'),
    'evento', count(*) FILTER (WHERE de_evento = 'en'),
    'cuenta', count(*) FILTER (WHERE de_cuenta = 'en')),
  'sinDato', count(*) FILTER (WHERE de_evento IS NULL AND de_cuenta IS NULL),
  'desde', (SELECT min(created_at) FROM ev WHERE idioma IS NOT NULL),
  'cambios', jsonb_build_object(
    'aEs', (SELECT count(*) FROM ev WHERE name = 'idioma_cambiado' AND idioma = 'es'),
    'aEn', (SELECT count(*) FROM ev WHERE name = 'idioma_cambiado' AND idioma = 'en'))
)
FROM fin
$$;

REVOKE ALL ON FUNCTION public.admin_idioma_app() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_idioma_app() TO service_role;


-- ── 3. Retención por día de alta ───────────────────────────────────────────
-- Como retencion_cohortes, pero por día y sólo día 1 y día 7: para ver cómo
-- vuelve la gente de cada día sin esperar a que cierre la semana.

CREATE OR REPLACE FUNCTION public.retencion_por_dia(p_dias integer DEFAULT 14)
RETURNS TABLE(dia date, usuarios bigint, d1 bigint, d7 bigint, d1_maduro boolean, d7_maduro boolean)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH zona AS (SELECT 'America/Argentina/Buenos_Aires'::text AS tz),
  altas AS (
    SELECT u.id, date_trunc('day', u.created_at AT TIME ZONE z.tz) AS dia
      FROM public.usuarios_alta u, zona z
     WHERE u.created_at AT TIME ZONE z.tz
             >= date_trunc('day', now() AT TIME ZONE z.tz) - make_interval(days => GREATEST(p_dias, 1) - 1)
  ),
  actividad AS (
    SELECT DISTINCT e.user_id, date_trunc('day', e.created_at AT TIME ZONE z.tz) AS dia
      FROM public.analytics_events e, zona z
     WHERE e.is_bot = false
       AND e.user_id IN (SELECT id FROM altas)
  ),
  por_usuario AS (
    SELECT a.dia,
           bool_or(act.dia = a.dia + interval '1 day') AS v1,
           bool_or(act.dia = a.dia + interval '7 day') AS v7
      FROM altas a
      LEFT JOIN actividad act ON act.user_id = a.id
     GROUP BY a.id, a.dia
  )
  SELECT
    p.dia::date,
    count(*)::bigint,
    count(*) FILTER (WHERE COALESCE(p.v1, false))::bigint,
    count(*) FILTER (WHERE COALESCE(p.v7, false))::bigint,
    -- Maduro = el día N ya terminó, en Argentina.
    (p.dia + interval '2 day' <= (SELECT now() AT TIME ZONE tz FROM zona)),
    (p.dia + interval '8 day' <= (SELECT now() AT TIME ZONE tz FROM zona))
  FROM por_usuario p
  GROUP BY p.dia
  ORDER BY p.dia DESC;
$$;

REVOKE ALL ON FUNCTION public.retencion_por_dia(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retencion_por_dia(integer) TO service_role;


-- ── 4. El precálculo, con las tres claves nuevas ───────────────────────────

CREATE OR REPLACE FUNCTION public.admin_panel_precalcular(p_grupo text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c        record;
  inicio   timestamptz;
  resultado jsonb;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('rapido', 'admin_resumen_actividad',
         'SELECT to_jsonb(x) FROM public.admin_resumen_actividad x'),
      ('rapido', 'admin_app_uso',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.admin_app_uso() x'),
      ('rapido', 'admin_actividad_por_hora:30',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.admin_actividad_por_hora(30) x'),
      -- La landing /descargar, desde el 23/10: con el tráfico de ese día se
      -- cortaba por tiempo y el panel lo mostraba como "ninguna sesión". Las
      -- ventanas son las de lib/metricas-ventanas.ts.
      ('rapido', 'analytics_descargar_resumen:7',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.analytics_descargar_resumen(7) x'),
      ('rapido', 'analytics_descargar_resumen:30',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.analytics_descargar_resumen(30) x'),
      ('rapido', 'analytics_descargar_dispositivos:7',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.analytics_descargar_dispositivos(7) x'),
      ('rapido', 'analytics_descargar_dispositivos:30',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.analytics_descargar_dispositivos(30) x'),
      -- "Medición de la app" e "Idioma de la app", desde el 27/10.
      ('rapido', 'admin_app_medicion',
         'SELECT public.admin_app_medicion()'),
      ('rapido', 'admin_idioma_app',
         'SELECT public.admin_idioma_app()'),
      ('lento',  'retencion_cohortes:12',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.retencion_cohortes(12) x'),
      ('lento',  'retencion_por_dia:14',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.retencion_por_dia(14) x'),
      ('lento',  'retencion_app_instalaciones_v2:12',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.retencion_app_instalaciones_v2(12) x'),
      ('lento',  'retencion_embudo_registro_v2:90',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.retencion_embudo_registro_v2(90) x'),
      ('lento',  'retencion_sesiones_primera_semana:90',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.retencion_sesiones_primera_semana(90) x'),
      ('lento',  'retencion_comportamiento:90',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.retencion_comportamiento(90) x'),
      ('lento',  'analytics_medicion',
         'SELECT to_jsonb(x) FROM public.analytics_medicion x')
    ) AS v(grupo, clave, consulta)
    WHERE v.grupo = p_grupo
  LOOP
    BEGIN
      inicio := clock_timestamp();
      EXECUTE c.consulta INTO resultado;
      IF resultado IS NOT NULL THEN
        INSERT INTO public.admin_panel_precalculado (clave, datos, calculado_en, milisegundos)
        VALUES (c.clave, resultado, clock_timestamp(),
                (extract(epoch FROM clock_timestamp() - inicio) * 1000)::int)
        ON CONFLICT (clave) DO UPDATE
          SET datos = EXCLUDED.datos,
              calculado_en = EXCLUDED.calculado_en,
              milisegundos = EXCLUDED.milisegundos;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'admin_panel_precalcular %: %', c.clave, SQLERRM;
    END;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.admin_panel_precalcular(text) FROM PUBLIC, anon, authenticated;

-- Las tres nuevas, ya mismo, así el panel no espera al cron.
SELECT public.admin_panel_precalcular('rapido');
SELECT public.admin_panel_precalcular('lento');

NOTIFY pgrst, 'reload schema';


-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura)
-- ----------------------------------------------------------------
--   SELECT clave, calculado_en, milisegundos FROM public.admin_panel_precalculado
--    WHERE clave IN ('admin_app_medicion', 'admin_idioma_app', 'retencion_por_dia:14');
