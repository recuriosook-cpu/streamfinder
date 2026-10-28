-- ================================================================
-- GLYNBOX — El panel lee los resúmenes de analytics_events (paso 2 de 3)
-- Correr con: npx supabase db query --linked -f supabase-eventos-panel-2026-10.sql
-- DESPUÉS de supabase-eventos-resumen-2026-10.sql y de su carga inicial (las
-- tres llamadas a analytics_resumir del final de ese archivo): sin la carga,
-- el panel mostraría ceros. Seguro de correr más de una vez. No borra nada.
-- ================================================================
--
-- Las funciones y vistas que miran más atrás que lo que van a durar los
-- eventos crudos pasan a leer analytics_dia_instalacion, analytics_sesion y
-- analytics_dia_evento. Probado el 2026-10-28 en una transacción deshecha,
-- comparando cada una antes y después: dan lo mismo salvo
--   - "desde"/"primero" de deslizar, idioma y anuncios: el primer evento de
--     ese día, no el primer evento de ese tipo;
--   - actividad por hora: cuenta el día 30 entero (antes, desde esta hora);
--   - idioma de la app: "por cuenta" resuelve más instalaciones (el usuario
--     sale de cualquier evento del día, no sólo de app_open);
--   - retencion_app_instalaciones (sin sistema, la de respaldo): días
--     argentinos, como la v2, en vez de UTC;
--   - diferencias de un par de usuarios en "ayer" y en comportamiento por la
--     misma razón (días argentinos, sesiones en vez de eventos sueltos).
-- Las definiciones de partida son las de producción del 2026-10-28.
-- ================================================================


-- ── 1. Lo que el panel lee de más atrás, desde los resúmenes ──────────────

-- 4.1 Actividad por hora (Contenido). Ventana en días argentinos.
CREATE OR REPLACE FUNCTION public.admin_actividad_por_hora(p_dias integer DEFAULT 30)
RETURNS TABLE(hora integer, eventos bigint, personas bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH d AS (
    SELECT h.key::int AS hora, h.value::bigint AS n, b.anon_id
      FROM analytics_dia_instalacion b
      CROSS JOIN LATERAL jsonb_each_text(b.eventos_hora) h
     WHERE b.dia >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - GREATEST(p_dias, 1)
  )
  SELECT g.hora, coalesce(sum(d.n), 0)::bigint, count(DISTINCT d.anon_id)::bigint
    FROM generate_series(0, 23) AS g(hora)
    LEFT JOIN d ON d.hora = g.hora
   GROUP BY g.hora
   ORDER BY g.hora;
$$;

-- 4.2 Medición de la app. Onboarding y notificaciones siguen sobre los
-- eventos crudos (se guardan 60 días); deslizar sale de los contadores por
-- instalación y los anuncios del resumen por día.
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
    'fallos', (SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.ubicacion), '[]') FROM fallos f)
  )
)
$$;

-- 4.3 Retención de las instalaciones de la app, por sistema.
CREATE OR REPLACE FUNCTION public.retencion_app_instalaciones_v2(p_semanas integer DEFAULT 12)
RETURNS TABLE(sistema text, semana date, instalaciones bigint, d1 bigint, d7 bigint, d30 bigint, d1_maduro boolean, d7_maduro boolean, d30_maduro boolean)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH zona AS (SELECT 'America/Argentina/Buenos_Aires'::text AS tz),
  instalacion AS (
    SELECT b.anon_id,
           min(b.primer_evento AT TIME ZONE z.tz) AS alta,
           COALESCE(
             (array_agg(b.sistema ORDER BY b.ultimo_evento DESC)
                FILTER (WHERE b.sistema IN ('android', 'ios')))[1],
             'sin_dato'
           ) AS sistema
      FROM analytics_dia_instalacion b, zona z
     WHERE b.platform = 'mobile'
     GROUP BY b.anon_id
  ),
  cohorte AS (
    SELECT i.*
      FROM instalacion i, zona z
     WHERE i.alta >= date_trunc('week', now() AT TIME ZONE z.tz) - make_interval(weeks => GREATEST(p_semanas, 1))
  ),
  dias_activos AS (
    SELECT b.anon_id, b.dia::timestamp AS dia
      FROM analytics_dia_instalacion b
     WHERE b.platform = 'mobile'
       AND b.anon_id IN (SELECT anon_id FROM cohorte)
  ),
  marcado AS (
    SELECT
      c.sistema,
      date_trunc('week', c.alta) AS semana,
      c.alta,
      bool_or(da.dia = date_trunc('day', c.alta) + interval '1 day')  AS v1,
      bool_or(da.dia = date_trunc('day', c.alta) + interval '7 day')  AS v7,
      bool_or(da.dia = date_trunc('day', c.alta) + interval '30 day') AS v30
    FROM cohorte c
    LEFT JOIN dias_activos da ON da.anon_id = c.anon_id
    GROUP BY c.anon_id, c.sistema, c.alta
  )
  SELECT
    m.sistema,
    m.semana::date,
    count(*)::bigint,
    count(*) FILTER (WHERE COALESCE(m.v1,  false))::bigint,
    count(*) FILTER (WHERE COALESCE(m.v7,  false))::bigint,
    count(*) FILTER (WHERE COALESCE(m.v30, false))::bigint,
    (date_trunc('day', max(m.alta)) + interval '2 day'  <= (SELECT now() AT TIME ZONE tz FROM zona)),
    (date_trunc('day', max(m.alta)) + interval '8 day'  <= (SELECT now() AT TIME ZONE tz FROM zona)),
    (date_trunc('day', max(m.alta)) + interval '31 day' <= (SELECT now() AT TIME ZONE tz FROM zona))
  FROM marcado m
  GROUP BY m.sistema, m.semana
  ORDER BY m.sistema, m.semana DESC;
$$;

-- La versión sin sistema (la ruta la usa si la v2 falla): la suma de la v2.
-- Una semana es madura si lo es en todos los sistemas, que es lo mismo que
-- mirar el alta más nueva de toda la semana.
CREATE OR REPLACE FUNCTION public.retencion_app_instalaciones(p_semanas integer DEFAULT 12)
RETURNS TABLE(semana date, instalaciones bigint, d1 bigint, d7 bigint, d30 bigint, d1_maduro boolean, d7_maduro boolean, d30_maduro boolean)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT v.semana, sum(v.instalaciones)::bigint, sum(v.d1)::bigint, sum(v.d7)::bigint, sum(v.d30)::bigint,
         bool_and(v.d1_maduro), bool_and(v.d7_maduro), bool_and(v.d30_maduro)
    FROM public.retencion_app_instalaciones_v2(p_semanas) v
   GROUP BY v.semana
   ORDER BY v.semana DESC;
$$;

-- 4.4 Idioma de la app: instalaciones que abrieron la app en 30 días. Los
-- cambios de idioma siguen sobre los crudos (idioma_cambiado dura 60 días).
CREATE OR REPLACE FUNCTION public.admin_idioma_app()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH
dias AS (
  SELECT b.anon_id, b.ultimo_evento, b.primer_evento, b.idioma, b.ultimo_usuario
    FROM analytics_dia_instalacion b
   WHERE b.platform = 'mobile'
     AND b.dia >= (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 30
     AND (b.contadores ? 'app_open' OR b.idioma IS NOT NULL)
),
inst AS (
  SELECT anon_id,
         (array_agg(idioma         ORDER BY ultimo_evento DESC) FILTER (WHERE idioma         IS NOT NULL))[1] AS idioma,
         (array_agg(ultimo_usuario ORDER BY ultimo_evento DESC) FILTER (WHERE ultimo_usuario IS NOT NULL))[1] AS usuario
    FROM dias
   GROUP BY anon_id
),
fin AS (
  SELECT i.idioma AS de_evento,
         CASE WHEN i.idioma IS NULL AND p.idioma IN ('es', 'en') THEN p.idioma END AS de_cuenta
    FROM inst i
    LEFT JOIN profiles p ON i.idioma IS NULL AND p.id = i.usuario
),
cambios AS (
  SELECT CASE WHEN props->>'idioma' IN ('es', 'en') THEN props->>'idioma' END AS idioma
    FROM analytics_events
   WHERE is_bot = false
     AND platform = 'mobile'
     AND name = 'idioma_cambiado'
     AND created_at >= now() - interval '30 days'
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
  'desde', (SELECT min(primer_evento) FROM dias WHERE idioma IS NOT NULL),
  'cambios', jsonb_build_object(
    'aEs', (SELECT count(*) FROM cambios WHERE idioma = 'es'),
    'aEn', (SELECT count(*) FROM cambios WHERE idioma = 'en'))
)
FROM fin
$$;

-- 4.5 Retención por día de alta y por semana de alta: los días activos de
-- cada usuario salen de analytics_dia_instalacion.
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
    SELECT DISTINCT x.user_id, b.dia::timestamp AS dia
      FROM analytics_dia_instalacion b
      CROSS JOIN LATERAL unnest(b.usuarios) AS x(user_id)
     WHERE b.usuarios && ARRAY(SELECT id FROM altas)
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

CREATE OR REPLACE FUNCTION public.retencion_cohortes(p_semanas integer DEFAULT 12)
RETURNS TABLE(semana date, usuarios bigint, d1 bigint, d7 bigint, d30 bigint, d1_maduro boolean, d7_maduro boolean, d30_maduro boolean)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH zona AS (SELECT 'America/Argentina/Buenos_Aires'::text AS tz),
  medicion AS (
    SELECT date_trunc('week', min(b.dia)::timestamp) AS desde
      FROM analytics_dia_instalacion b
  ),
  altas AS (
    SELECT u.id,
           (u.created_at AT TIME ZONE z.tz) AS alta,
           date_trunc('week', u.created_at AT TIME ZONE z.tz) AS semana
      FROM public.usuarios_alta u, medicion m, zona z
     WHERE (u.created_at AT TIME ZONE z.tz)
             >= date_trunc('week', now() AT TIME ZONE z.tz) - make_interval(weeks => GREATEST(p_semanas, 1))
       AND date_trunc('week', u.created_at AT TIME ZONE z.tz) >= m.desde
  ),
  actividad AS (
    SELECT DISTINCT x.user_id, b.dia::timestamp AS dia
      FROM analytics_dia_instalacion b
      CROSS JOIN LATERAL unnest(b.usuarios) AS x(user_id)
     WHERE b.usuarios && ARRAY(SELECT id FROM altas)
  ),
  por_usuario AS (
    SELECT
      a.semana,
      a.alta,
      bool_or(act.dia = date_trunc('day', a.alta) + interval '1 day')  AS v1,
      bool_or(act.dia = date_trunc('day', a.alta) + interval '7 day')  AS v7,
      bool_or(act.dia = date_trunc('day', a.alta) + interval '30 day') AS v30
    FROM altas a
    LEFT JOIN actividad act ON act.user_id = a.id
    GROUP BY a.id, a.semana, a.alta
  )
  SELECT
    p.semana::date,
    count(*)::bigint,
    count(*) FILTER (WHERE COALESCE(p.v1,  false))::bigint,
    count(*) FILTER (WHERE COALESCE(p.v7,  false))::bigint,
    count(*) FILTER (WHERE COALESCE(p.v30, false))::bigint,
    -- Maduro = el día N del alta más nueva de la cohorte ya terminó, en
    -- Argentina.
    (date_trunc('day', max(p.alta)) + interval '2 day'  <= (SELECT now() AT TIME ZONE tz FROM zona)),
    (date_trunc('day', max(p.alta)) + interval '8 day'  <= (SELECT now() AT TIME ZONE tz FROM zona)),
    (date_trunc('day', max(p.alta)) + interval '31 day' <= (SELECT now() AT TIME ZONE tz FROM zona))
  FROM por_usuario p
  GROUP BY p.semana
  ORDER BY p.semana DESC;
$$;

-- 4.6 Uso de la app (Resumen y Métricas).
CREATE OR REPLACE FUNCTION public.admin_app_uso()
RETURNS TABLE(activas bigint, con_sesion bigint, sin_sesion bigint, android bigint, ios bigint, sin_sistema bigint, activas_prev bigint, desde timestamp with time zone)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ev AS (
    SELECT b.anon_id, b.usuarios, b.primer_evento, b.ultimo_evento, b.sistema
      FROM analytics_dia_instalacion b
     WHERE b.platform = 'mobile'
       AND b.ultimo_evento >= now() - interval '37 days'
  ),
  por_instalacion AS (
    SELECT
      ev.anon_id,
      bool_or(ev.ultimo_evento >= now() - interval '30 days') AS activa,
      bool_or(cardinality(ev.usuarios) > 0 AND ev.ultimo_evento >= now() - interval '30 days') AS con_sesion,
      bool_or(ev.primer_evento < now() - interval '7 days') AS activa_prev,
      (array_agg(ev.sistema ORDER BY ev.ultimo_evento DESC)
         FILTER (WHERE ev.sistema IN ('android', 'ios')))[1] AS sistema
    FROM ev
    GROUP BY ev.anon_id
  ),
  usuarios_instalacion AS (
    SELECT ev.anon_id, array_agg(DISTINCT x.user_id) AS usuarios
      FROM ev CROSS JOIN LATERAL unnest(ev.usuarios) AS x(user_id)
     GROUP BY ev.anon_id
  ),
  -- Los sistemas conocidos de cada usuario, de toda la historia.
  sistema_usuario AS (
    SELECT s.user_id, array_agg(DISTINCT s.sistema) AS sistemas
    FROM (
      SELECT x.user_id, b.os AS sistema
        FROM analytics_dia_instalacion b
        CROSS JOIN LATERAL unnest(b.usuarios) AS x(user_id)
       WHERE b.platform = 'mobile' AND b.os IN ('android', 'ios')
      UNION
      SELECT d.user_id, d.platform
        FROM public.user_devices d
       WHERE d.platform IN ('android', 'ios')
    ) s
    GROUP BY s.user_id
  ),
  resuelto AS (
    SELECT
      p.*,
      COALESCE(p.sistema, (
        -- Sólo si entre todos los usuarios de la instalación hay un único sistema.
        SELECT CASE WHEN count(DISTINCT x.s) = 1 THEN min(x.s) END
          FROM sistema_usuario su
          CROSS JOIN LATERAL unnest(su.sistemas) AS x(s)
         WHERE su.user_id = ANY (ui.usuarios)
      )) AS sistema_final
    FROM por_instalacion p
    LEFT JOIN usuarios_instalacion ui ON ui.anon_id = p.anon_id
  )
  SELECT
    count(*) FILTER (WHERE r.activa)::bigint,
    count(*) FILTER (WHERE r.activa AND r.con_sesion)::bigint,
    count(*) FILTER (WHERE r.activa AND NOT r.con_sesion)::bigint,
    count(*) FILTER (WHERE r.activa AND r.sistema_final = 'android')::bigint,
    count(*) FILTER (WHERE r.activa AND r.sistema_final = 'ios')::bigint,
    count(*) FILTER (WHERE r.activa AND r.sistema_final IS NULL)::bigint,
    count(*) FILTER (WHERE r.activa_prev)::bigint,
    (SELECT min(b.primer_evento) FROM analytics_dia_instalacion b WHERE b.platform = 'mobile')
  FROM resuelto r;
$$;

-- 4.7 "Siguen con Glynbox".
CREATE OR REPLACE FUNCTION public.admin_siguen_con_glynbox()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH desde AS (SELECT now() - interval '30 days' AS t),
  activos AS (
    SELECT x.user_id
      FROM analytics_dia_instalacion b
      CROSS JOIN LATERAL unnest(b.usuarios) AS x(user_id), desde
     WHERE b.ultimo_evento >= desde.t
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

-- 4.8 Primera semana y comportamiento: de las sesiones resumidas.
CREATE OR REPLACE FUNCTION public.retencion_sesiones_primera_semana(p_dias integer DEFAULT 90)
RETURNS TABLE(usuarios bigint, sesiones_promedio numeric, sesiones_mediana numeric, sin_actividad bigint, una_sola bigint, una_sola_y_no_volvio bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH medicion AS (
    SELECT min(primer_evento) AS desde FROM analytics_dia_instalacion
  ),
  altas AS (
    SELECT u.id, u.created_at
      FROM public.usuarios_alta u, medicion m
     WHERE u.created_at >= now() - make_interval(days => GREATEST(p_dias, 1))
       AND u.created_at <= now() - interval '7 day'   -- la semana ya cerró
       AND u.created_at >= m.desde
  ),
  por_usuario AS (
    SELECT
      a.id,
      -- Sesiones con algo dentro de la primera semana.
      count(s.session_id) FILTER (
        WHERE s.fin >= a.created_at
          AND s.inicio < a.created_at + interval '7 day'
      )::int AS sesiones,
      -- ¿Apareció alguna vez después de esa primera semana?
      bool_or(s.fin >= a.created_at + interval '7 day') AS volvio_despues
    FROM altas a
    LEFT JOIN analytics_sesion s ON s.user_id = a.id
    GROUP BY a.id
  )
  SELECT
    count(*)::bigint,
    round(avg(p.sesiones)::numeric, 2),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY p.sesiones)::numeric,
    count(*) FILTER (WHERE p.sesiones = 0)::bigint,
    count(*) FILTER (WHERE p.sesiones = 1)::bigint,
    count(*) FILTER (WHERE p.sesiones = 1 AND NOT COALESCE(p.volvio_despues, false))::bigint
  FROM por_usuario p;
$$;

CREATE OR REPLACE FUNCTION public.retencion_comportamiento(p_dias integer DEFAULT 90)
RETURNS TABLE(grupo text, usuarios bigint, paginas_promedio numeric, sesiones_promedio numeric, calificaciones_promedio numeric, watchlist_promedio numeric, resenas_promedio numeric, favoritos_promedio numeric, onboarding_completo_pct numeric)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH medicion AS (
    SELECT min(primer_evento) AS desde FROM analytics_dia_instalacion
  ),
  altas AS (
    SELECT u.id, u.created_at, u.created_at + interval '7 day' AS corte
      FROM public.usuarios_alta u, medicion m
     WHERE u.created_at >= now() - make_interval(days => GREATEST(p_dias, 1))
       AND u.created_at <= now() - interval '7 day'
       AND u.created_at >= m.desde
  ),
  eventos AS (
    SELECT
      a.id,
      coalesce((SELECT sum(s.paginas) FROM analytics_sesion s
                 WHERE s.user_id = a.id AND s.inicio < a.corte), 0)::int AS paginas,
      (SELECT count(*) FROM analytics_sesion s
        WHERE s.user_id = a.id AND s.inicio < a.corte)::int AS sesiones,
      EXISTS (SELECT 1 FROM analytics_dia_instalacion b
               WHERE b.usuarios @> ARRAY[a.id]
                 AND b.dia > (a.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS volvio
    FROM altas a
  ),
  -- Cada acción de dominio en subconsulta propia: son tablas distintas con
  -- nombres de fecha distintos (`rated_at`, `added_at`, `created_at`) y
  -- juntarlas en un solo JOIN multiplicaría las filas entre sí.
  acciones AS (
    SELECT
      a.id,
      (SELECT count(*) FROM public.ratings r
        WHERE r.user_id = a.id AND r.rated_at >= a.created_at AND r.rated_at < a.corte)::int AS calificaciones,
      (SELECT count(*) FROM public.watchlist w
        WHERE w.user_id = a.id AND w.added_at >= a.created_at AND w.added_at < a.corte)::int AS watchlist,
      (SELECT count(*) FROM public.reviews rv
        WHERE rv.user_id = a.id AND rv.created_at >= a.created_at AND rv.created_at < a.corte)::int AS resenas,
      (SELECT count(*) FROM public.favorites f
        WHERE f.user_id = a.id AND f.created_at >= a.created_at AND f.created_at < a.corte)::int AS favoritos,
      (SELECT (p.onboarding_completed_at IS NOT NULL) FROM public.profiles p WHERE p.id = a.id) AS onboarding_ok
    FROM altas a
  )
  SELECT
    CASE WHEN COALESCE(e.volvio, false) THEN 'volvio' ELSE 'no_volvio' END::text,
    count(*)::bigint,
    round(avg(e.paginas)::numeric, 1),
    round(avg(e.sesiones)::numeric, 2),
    round(avg(ac.calificaciones)::numeric, 2),
    round(avg(ac.watchlist)::numeric, 2),
    round(avg(ac.resenas)::numeric, 2),
    round(avg(ac.favoritos)::numeric, 2),
    round(100.0 * count(*) FILTER (WHERE ac.onboarding_ok) / NULLIF(count(*), 0), 1)
  FROM eventos e
  JOIN acciones ac ON ac.id = e.id
  GROUP BY 1;
$$;

-- 4.9 Vistas. Mismas columnas y tipos que antes (CREATE OR REPLACE VIEW no
-- deja cambiarlos).
CREATE OR REPLACE VIEW public.analytics_medicion AS
SELECT
  (SELECT min(primer_evento) FROM analytics_dia_instalacion) AS desde,
  (SELECT coalesce(sum(eventos), 0) FROM analytics_dia_evento WHERE NOT is_bot) AS eventos_humanos,
  (SELECT coalesce(sum(eventos), 0) FROM analytics_dia_evento WHERE is_bot) AS eventos_bot,
  (SELECT count(*) FROM analytics_sesion) AS sesiones_humanas,
  (SELECT count(DISTINCT x.user_id)
     FROM analytics_dia_instalacion b CROSS JOIN LATERAL unnest(b.usuarios) AS x(user_id)) AS usuarios_con_datos;

CREATE OR REPLACE VIEW public.analytics_sessions AS
SELECT s.session_id,
       s.user_id,
       s.anon_id,
       s.eventos::bigint AS eventos,
       s.inicio,
       s.fin,
       LEAST(
         CASE WHEN s.eventos = 1 THEN (30)::numeric
              ELSE EXTRACT(epoch FROM (s.fin - s.inicio)) END,
         (1800)::numeric) AS segundos
  FROM analytics_sesion s;

CREATE OR REPLACE VIEW public.actividad_diaria_usuario AS
SELECT DISTINCT x.user_id,
       (b.dia::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AS dia
  FROM analytics_dia_instalacion b
  CROSS JOIN LATERAL unnest(b.usuarios) AS x(user_id);

CREATE OR REPLACE VIEW public.user_app_usage AS
SELECT x.user_id,
       array_agg(DISTINCT b.os) FILTER (WHERE b.os = ANY (ARRAY['ios'::text, 'android'::text])) AS sistemas,
       min(b.primer_evento) AS primera_app,
       max(b.ultimo_evento) AS ultima_app
  FROM analytics_dia_instalacion b
  CROSS JOIN LATERAL unnest(b.usuarios) AS x(user_id)
 WHERE b.platform = 'mobile'
 GROUP BY x.user_id;

-- El resumen del inicio del panel. "Ayer" es ayer hasta esta misma hora: una
-- instalación cuenta si su primer evento de ayer fue antes de esa hora.
CREATE OR REPLACE VIEW public.admin_resumen_actividad AS
WITH v AS (
  SELECT d.hoy_desde,
         (d.hoy_desde - '1 day'::interval) AS ayer_desde,
         ((d.hoy_desde - '1 day'::interval) + (now() - d.hoy_desde)) AS ayer_hasta,
         (d.hoy_desde - '6 days'::interval) AS semana_desde,
         (d.hoy_desde - '13 days'::interval) AS semana_prev_desde,
         (d.hoy_desde - '29 days'::interval) AS mes_desde,
         d.hoy
    FROM (SELECT (date_trunc('day', now() AT TIME ZONE 'America/Argentina/Buenos_Aires')
                    AT TIME ZONE 'America/Argentina/Buenos_Aires') AS hoy_desde,
                 (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS hoy) d
), dias AS (
  SELECT b.anon_id, b.platform, b.dia, b.primer_evento, x.user_id
    FROM analytics_dia_instalacion b
    -- Un día sin usuario queda como una fila con user_id nulo.
    CROSS JOIN LATERAL unnest(CASE WHEN cardinality(b.usuarios) = 0 THEN ARRAY[NULL::uuid]
                                   ELSE b.usuarios END) AS x(user_id),
    v
   WHERE b.dia >= v.hoy - 29
), marcas AS (
  SELECT dias.anon_id, dias.user_id, dias.platform,
         bool_or(dias.dia = v.hoy) AS hoy,
         bool_or(dias.dia = v.hoy - 1 AND dias.primer_evento < v.ayer_hasta) AS ayer,
         bool_or(dias.dia >= v.hoy - 6) AS semana,
         bool_or(dias.dia >= v.hoy - 13 AND dias.dia < v.hoy - 6) AS semana_prev
    FROM dias, v
   GROUP BY dias.anon_id, dias.user_id, dias.platform
), eventos AS (
  SELECT count(DISTINCT marcas.user_id) FILTER (WHERE marcas.user_id IS NOT NULL AND marcas.hoy) AS usuarios_hoy,
         count(DISTINCT marcas.user_id) FILTER (WHERE marcas.user_id IS NOT NULL AND marcas.ayer) AS usuarios_ayer,
         count(DISTINCT marcas.user_id) FILTER (WHERE marcas.user_id IS NOT NULL AND marcas.semana) AS usuarios_semana,
         count(DISTINCT marcas.user_id) FILTER (WHERE marcas.user_id IS NOT NULL AND marcas.semana_prev) AS usuarios_semana_prev,
         count(DISTINCT marcas.user_id) FILTER (WHERE marcas.user_id IS NOT NULL) AS usuarios_30d,
         count(DISTINCT marcas.anon_id) FILTER (WHERE marcas.hoy)
           - count(DISTINCT marcas.anon_id) FILTER (WHERE marcas.hoy AND marcas.user_id IS NOT NULL) AS anonimos_hoy,
         count(DISTINCT marcas.anon_id) FILTER (WHERE marcas.ayer)
           - count(DISTINCT marcas.anon_id) FILTER (WHERE marcas.ayer AND marcas.user_id IS NOT NULL) AS anonimos_ayer,
         count(DISTINCT marcas.anon_id) FILTER (WHERE marcas.platform = 'web' AND marcas.hoy)
           - count(DISTINCT marcas.anon_id) FILTER (WHERE marcas.platform = 'web' AND marcas.hoy AND marcas.user_id IS NOT NULL) AS anonimos_hoy_web,
         count(DISTINCT marcas.anon_id) FILTER (WHERE marcas.platform = 'mobile' AND marcas.hoy)
           - count(DISTINCT marcas.anon_id) FILTER (WHERE marcas.platform = 'mobile' AND marcas.hoy AND marcas.user_id IS NOT NULL) AS anonimos_hoy_app,
         count(DISTINCT marcas.anon_id) FILTER (WHERE marcas.platform = 'web' AND marcas.ayer)
           - count(DISTINCT marcas.anon_id) FILTER (WHERE marcas.platform = 'web' AND marcas.ayer AND marcas.user_id IS NOT NULL) AS anonimos_ayer_web,
         count(DISTINCT marcas.anon_id) FILTER (WHERE marcas.platform = 'mobile' AND marcas.ayer)
           - count(DISTINCT marcas.anon_id) FILTER (WHERE marcas.platform = 'mobile' AND marcas.ayer AND marcas.user_id IS NOT NULL) AS anonimos_ayer_app
    FROM marcas
), ses AS (
  SELECT s.inicio,
         LEAST(CASE WHEN s.eventos = 1 THEN (30)::numeric
                    ELSE EXTRACT(epoch FROM (s.fin - s.inicio)) END,
               (1800)::numeric) AS segundos
    FROM analytics_sesion s, v
   WHERE s.fin >= v.mes_desde
), sesiones AS (
  SELECT count(s.inicio) FILTER (WHERE s.inicio >= v.hoy_desde) AS sesiones_hoy,
         count(s.inicio) FILTER (WHERE s.inicio >= v.ayer_desde AND s.inicio < v.ayer_hasta) AS sesiones_ayer,
         (round(avg(s.segundos) FILTER (WHERE s.inicio >= v.hoy_desde)))::integer AS seg_prom_hoy,
         (round(avg(s.segundos) FILTER (WHERE s.inicio >= v.ayer_desde AND s.inicio < v.ayer_hasta)))::integer AS seg_prom_ayer,
         (round(avg(s.segundos)))::integer AS seg_prom_total
    FROM v LEFT JOIN ses s ON true
   GROUP BY v.hoy_desde, v.ayer_desde, v.ayer_hasta
), app AS (
  SELECT (count(DISTINCT d.user_id))::integer AS usuarios_con_app,
         (count(DISTINCT d.user_id) FILTER (WHERE d.platform = 'android'))::integer AS android,
         (count(DISTINCT d.user_id) FILTER (WHERE d.platform = 'ios'))::integer AS ios,
         (count(DISTINCT d.user_id) FILTER (WHERE d.platform IS NULL OR d.platform <> ALL (ARRAY['android'::text, 'ios'::text])))::integer AS otras,
         (count(DISTINCT d.user_id) FILTER (WHERE d.created_at < v.semana_desde))::integer AS usuarios_con_app_prev
    FROM v LEFT JOIN user_devices d ON true
   GROUP BY v.semana_desde
)
SELECT (SELECT v.hoy_desde FROM v) AS hoy_desde,
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
       (SELECT v.ayer_hasta FROM v) AS ayer_hasta,
       (SELECT v.mes_desde FROM v) AS sesiones_desde
  FROM eventos, sesiones, app;


-- ── 2. El precálculo del panel rehace ayer y hoy antes de calcular ────────
-- `admin_panel_precalcular` de producción (2026-10-28) con el paso 0.

CREATE OR REPLACE FUNCTION public.admin_panel_precalcular(p_grupo text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  c        record;
  inicio   timestamptz;
  resultado jsonb;
  hoy      date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  -- 0. Los resúmenes de eventos de ayer y hoy (supabase-eventos-resumen-2026-10.sql).
  IF p_grupo = 'rapido' THEN
    BEGIN
      PERFORM public.analytics_resumir(hoy - 1, hoy);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'admin_panel_precalcular analytics_resumir: %', SQLERRM;
    END;
  END IF;

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
$function$;

REVOKE ALL ON FUNCTION public.admin_panel_precalcular(text) FROM PUBLIC, anon, authenticated;
