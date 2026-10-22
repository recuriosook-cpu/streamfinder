-- ================================================================
-- GLYNBOX — Métricas del panel de admin (2026-10)
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez, también después de
-- supabase-resumen-rapido-2026-10.sql y supabase-embudo-web-2026-10.sql. No
-- borra ni cambia datos: sólo vistas y funciones de lectura del panel.
-- ================================================================
--
-- El panel funciona antes de correr esto (cae a las vistas y funciones
-- viejas y lo avisa en pantalla). Después de correrlo:
--
--   · Resumen: "hoy" contra ayer a la misma hora, "Activos en 30 días" con
--     web y app, anónimos separados en web y app, y el sistema operativo de
--     las instalaciones "sin dato" completado con el del mismo usuario.
--   · Métricas: actividad por hora con todos los eventos, en hora argentina.
--   · Retención: cohortes en días de Argentina, la app separada en Android e
--     iOS, y el embudo de registro separado por plataforma y por flujo de
--     onboarding, con "Completó" sólo para cuentas nuevas.
--
-- Primero lo de retención y después lo del resumen: si algo fallara a mitad,
-- lo que ya corrió sirve solo.
-- ================================================================

-- ----------------------------------------------------------------
-- RETENCIÓN Y EMBUDO DEL REGISTRO (2026-10)
-- ----------------------------------------------------------------
--
-- Tres cambios, que el panel (`/api/admin/retencion`) usa en cuanto existen y
-- que hasta entonces reemplaza por las funciones viejas:
--
--   1. `retencion_cohortes`, misma firma: los días pasan a ser de Argentina.
--      Con días UTC, alguien que se registró a las 22 h y volvió al otro día a
--      las 20 h aparecía volviendo el "día 0".
--   2. `retencion_app_instalaciones_v2`: la retención de la app separada por
--      sistema. Antes Android e iOS iban en una sola tabla titulada "App de
--      Android".
--   3. `retencion_embudo_registro_v2`: el embudo separado por plataforma (web y
--      app) y el onboarding separado por flujo (el corto de 3 pasos, desde el
--      15/10, y los viejos). Además:
--        · "Completó" cuenta sólo cuentas creadas hasta 48 h antes del evento.
--          La app manda `signup_completed` cada vez que se abre el onboarding,
--          también con cuentas viejas ("Rehacer la configuración inicial").
--        · "Empezó" incluye a los que completaron: nadie completa sin empezar,
--          y la app no marca el inicio cuando se entra con Google, Apple o
--          Facebook desde la pantalla de ingreso (lo corrige la 1.0.17). Sin
--          esto "Completó" daba más que "Empezó".

-- ── 1. Cohortes de usuarios registrados, en días de Argentina ──────────────
--
-- La actividad cuenta web y app: "volvió" es volver a Glynbox, por cualquiera
-- de las dos. Sigue sin usar `actividad_diaria_usuario`, que agrupa por día
-- UTC; la vista queda como está porque no la usa nadie más.

CREATE OR REPLACE FUNCTION public.retencion_cohortes(p_semanas int DEFAULT 12)
RETURNS TABLE (
  semana      date,
  usuarios    bigint,
  d1          bigint,
  d7          bigint,
  d30         bigint,
  d1_maduro   boolean,
  d7_maduro   boolean,
  d30_maduro  boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH zona AS (SELECT 'America/Argentina/Buenos_Aires'::text AS tz),
  medicion AS (
    SELECT date_trunc('week', min(e.created_at AT TIME ZONE z.tz)) AS desde
      FROM public.analytics_events e, zona z
     WHERE e.is_bot = false
     GROUP BY z.tz
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
    SELECT DISTINCT e.user_id, date_trunc('day', e.created_at AT TIME ZONE z.tz) AS dia
      FROM public.analytics_events e, zona z
     WHERE e.is_bot = false
       AND e.user_id IN (SELECT id FROM altas)
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

-- ── 2. Retención de la app, por sistema ────────────────────────────────────
--
-- El sistema de cada instalación es el último conocido en toda su historia:
-- `props.os` lo pone `/api/track` desde el 15/10 a partir del user-agent;
-- `props.plataforma` lo mandan los eventos de anuncios desde antes. Mismo
-- criterio que `admin_app_uso`. Las que nunca mandaron ninguno de los dos van
-- como 'sin_dato': son instalaciones que no abrieron la app desde que se
-- empezó a registrar el sistema.

CREATE OR REPLACE FUNCTION public.retencion_app_instalaciones_v2(p_semanas int DEFAULT 12)
RETURNS TABLE (
  sistema        text,
  semana         date,
  instalaciones  bigint,
  d1             bigint,
  d7             bigint,
  d30            bigint,
  d1_maduro      boolean,
  d7_maduro      boolean,
  d30_maduro     boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH zona AS (SELECT 'America/Argentina/Buenos_Aires'::text AS tz),
  ev AS (
    SELECT e.anon_id,
           (e.created_at AT TIME ZONE z.tz) AS cuando,
           e.created_at,
           COALESCE(e.props->>'os', e.props->>'plataforma') AS sistema
      FROM public.analytics_events e, zona z
     WHERE e.is_bot = false
       AND e.platform = 'mobile'
  ),
  instalacion AS (
    SELECT ev.anon_id,
           min(ev.cuando) AS alta,
           COALESCE(
             (array_agg(ev.sistema ORDER BY ev.created_at DESC)
                FILTER (WHERE ev.sistema IN ('android', 'ios')))[1],
             'sin_dato'
           ) AS sistema
      FROM ev
     GROUP BY ev.anon_id
  ),
  cohorte AS (
    SELECT i.*
      FROM instalacion i, zona z
     WHERE i.alta >= date_trunc('week', now() AT TIME ZONE z.tz) - make_interval(weeks => GREATEST(p_semanas, 1))
  ),
  dias_activos AS (
    SELECT DISTINCT ev.anon_id, date_trunc('day', ev.cuando) AS dia
      FROM ev
     WHERE ev.anon_id IN (SELECT anon_id FROM cohorte)
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

-- ── 3. Embudo del registro, por plataforma y flujo ─────────────────────────
--
-- Una fila por (plataforma, flujo, paso). `flujo` es 'registro' para las tres
-- etapas del alta, y 'corto' o 'viejo' para las del onboarding:
--
--   corto  -> `props.flujo = 'corto'`: Plataformas, Géneros, Gusto. El de la
--             app desde la 1.0.15 y el de la web desde el 15/10.
--   viejo  -> sin `flujo`: el de 5 pasos de la web y el de 6 de la app.
--
-- `ultimo` es el último evento de ese flujo en esa plataforma, para que el
-- panel esconda un flujo viejo que ya nadie usa. La unidad es el `anon_id`
-- (navegador o instalación), como antes: las primeras etapas pasan antes de
-- que exista la cuenta.

CREATE OR REPLACE FUNCTION public.retencion_embudo_registro_v2(p_dias int DEFAULT 90)
RETURNS TABLE (
  plataforma text,
  flujo      text,
  orden      int,
  clave      text,
  etiqueta   text,
  usuarios   bigint,
  ultimo     timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH ev AS (
    SELECT CASE WHEN e.platform = 'mobile' THEN 'app' ELSE 'web' END AS plataforma,
           e.name, e.path, e.props, e.anon_id, e.user_id, e.created_at,
           CASE WHEN e.props->>'flujo' = 'corto' THEN 'corto' ELSE 'viejo' END AS flujo,
           CASE WHEN e.props->>'paso' ~ '^[0-9]+$' THEN (e.props->>'paso')::int END AS paso
      FROM public.analytics_events e
     WHERE e.is_bot = false
       AND e.created_at >= now() - make_interval(days => GREATEST(p_dias, 1))
       -- La web, desde que manda `signup_completed` (17/10). Es el arreglo de
       -- supabase-embudo-web-2026-10.sql: está acá también para que volver a
       -- correr este archivo no lo deshaga.
       AND (e.platform = 'mobile' OR e.created_at >= timestamptz '2026-10-17 00:00-03')
  ),
  -- Un alta real: el evento llega dentro de las 48 h de creada la cuenta. El
  -- margen de 10 minutos hacia atrás cubre la diferencia entre el reloj de
  -- Auth y el de la base.
  completo AS (
    SELECT DISTINCT ev.plataforma, ev.anon_id
      FROM ev
      JOIN public.usuarios_alta u ON u.id = ev.user_id
     WHERE ev.name = 'signup_completed'
       AND ev.created_at BETWEEN u.created_at - interval '10 minutes'
                             AND u.created_at + interval '48 hours'
  ),
  empezo AS (
    SELECT ev.plataforma, ev.anon_id FROM ev WHERE ev.name = 'signup_started'
    UNION
    SELECT plataforma, anon_id FROM completo
  ),
  plataformas AS (SELECT unnest(ARRAY['web', 'app']) AS plataforma),
  -- Los nombres de cada paso, por flujo y plataforma.
  pasos AS (
    SELECT * FROM (VALUES
      ('web', 'corto', 1, 'Plataformas'), ('web', 'corto', 2, 'Géneros'), ('web', 'corto', 3, 'Gusto'),
      ('app', 'corto', 1, 'Plataformas'), ('app', 'corto', 2, 'Géneros'), ('app', 'corto', 3, 'Gusto'),
      ('web', 'viejo', 1, 'Nombre'), ('web', 'viejo', 2, 'Géneros'), ('web', 'viejo', 3, 'Plataformas'),
      ('web', 'viejo', 4, 'Seguir usuarios'), ('web', 'viejo', 5, 'Calificar'),
      ('app', 'viejo', 1, 'Nombre'), ('app', 'viejo', 2, 'Géneros'), ('app', 'viejo', 3, 'Plataformas'),
      ('app', 'viejo', 4, 'Seguir usuarios'), ('app', 'viejo', 5, 'Calificar'), ('app', 'viejo', 6, 'Notificaciones')
    ) AS t(plataforma, flujo, paso, nombre)
  ),
  ultimo_flujo AS (
    SELECT ev.plataforma, ev.flujo, max(ev.created_at) AS ultimo
      FROM ev
     WHERE ev.name IN ('onboarding_step_viewed', 'onboarding_step_completed', 'onboarding_skipped')
     GROUP BY ev.plataforma, ev.flujo
  )

  -- Las tres etapas del alta. "Llegó" suma a los que empezaron: en la app se
  -- puede entrar con Google, Apple o Facebook desde la bienvenida, que no es
  -- `/auth`, y sin esto el primer escalón daba menos que el segundo.
  SELECT p.plataforma, 'registro'::text, 1, 'vio_registro'::text,
         'Llegó a una pantalla de ingreso o registro'::text,
         (SELECT count(*) FROM (
            SELECT ev.anon_id FROM ev
             WHERE ev.plataforma = p.plataforma AND ev.name = 'page_view' AND ev.path = '/auth'
            UNION
            SELECT e.anon_id FROM empezo e WHERE e.plataforma = p.plataforma
          ) llego)::bigint,
         NULL::timestamptz
    FROM plataformas p
  UNION ALL
  SELECT p.plataforma, 'registro', 2, 'empezo', 'Empezó el registro',
         (SELECT count(DISTINCT e.anon_id) FROM empezo e WHERE e.plataforma = p.plataforma)::bigint,
         NULL
    FROM plataformas p
  UNION ALL
  SELECT p.plataforma, 'registro', 3, 'completo', 'Completó el registro',
         (SELECT count(DISTINCT c.anon_id) FROM completo c WHERE c.plataforma = p.plataforma)::bigint,
         NULL
    FROM plataformas p

  -- El onboarding: visto y completado alternados, por flujo.
  UNION ALL
  SELECT s.plataforma, s.flujo, s.paso * 2 - 1,
         'ob_' || s.paso || '_visto', s.nombre || ': lo vio',
         (SELECT count(DISTINCT ev.anon_id) FROM ev
           WHERE ev.plataforma = s.plataforma AND ev.flujo = s.flujo
             AND ev.name = 'onboarding_step_viewed' AND ev.paso = s.paso)::bigint,
         u.ultimo
    FROM pasos s
    LEFT JOIN ultimo_flujo u ON u.plataforma = s.plataforma AND u.flujo = s.flujo
  UNION ALL
  SELECT s.plataforma, s.flujo, s.paso * 2,
         'ob_' || s.paso || '_hecho', s.nombre || ': lo completó',
         (SELECT count(DISTINCT ev.anon_id) FROM ev
           WHERE ev.plataforma = s.plataforma AND ev.flujo = s.flujo
             AND ev.name = 'onboarding_step_completed' AND ev.paso = s.paso)::bigint,
         u.ultimo
    FROM pasos s
    LEFT JOIN ultimo_flujo u ON u.plataforma = s.plataforma AND u.flujo = s.flujo

  -- Fuera de la escalera: saltear es una salida lateral.
  UNION ALL
  SELECT f.plataforma, f.flujo, 99, 'salteo', 'Salteó el onboarding',
         (SELECT count(DISTINCT ev.anon_id) FROM ev
           WHERE ev.plataforma = f.plataforma AND ev.flujo = f.flujo
             AND ev.name = 'onboarding_skipped')::bigint,
         u.ultimo
    FROM (SELECT DISTINCT plataforma, flujo FROM pasos) f
    LEFT JOIN ultimo_flujo u ON u.plataforma = f.plataforma AND u.flujo = f.flujo

  ORDER BY 1, 2, 3;
$$;

REVOKE EXECUTE ON FUNCTION public.retencion_app_instalaciones_v2(int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.retencion_embudo_registro_v2(int)   FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.retencion_app_instalaciones_v2(int) TO service_role;
GRANT  EXECUTE ON FUNCTION public.retencion_embudo_registro_v2(int)   TO service_role;

-- Verificar:
--   SELECT * FROM public.retencion_app_instalaciones_v2(12);
--   SELECT * FROM public.retencion_embudo_registro_v2(90) WHERE flujo = 'registro';


-- ----------------------------------------------------------------
-- RESUMEN: "hoy" contra ayer a la misma hora, activos en 30 días y
-- anónimos separados en web y app
-- ----------------------------------------------------------------
--
-- Reemplaza la vista de `supabase-analytics-resumen.sql`. Cambia tres cosas:
--
--   1. "Ayer" deja de ser el día entero y pasa a ser ayer hasta la misma hora
--      que hoy: [00:00 de ayer, 00:00 de ayer + lo que va de hoy). Antes lo
--      que iba de hoy se comparaba contra un día completo y el porcentaje
--      salía negativo casi todo el día. Aplica a conectados, anónimos,
--      sesiones y duración.
--   2. `usuarios_30d`: usuarios distintos con algún evento (web o app) en los
--      últimos 30 días de Argentina, hoy incluido. Reemplaza a
--      `profiles.last_active`, que escribe sólo la web, en la tarjeta
--      "Activos" de arriba.
--   3. Los anónimos, también separados por plataforma: el total mezclaba
--      navegadores con instalaciones de la app sin sesión.
--
-- La definición es la de `supabase-resumen-rapido-2026-10.sql`, que vino
-- después: la misma vista recorriendo los eventos una sola vez (la anterior
-- daba "statement timeout" en el panel) y con la columna `sesiones_desde` al
-- final. Las dos tienen que quedar iguales.
--
-- DROP y CREATE, no CREATE OR REPLACE: este último no deja sacar ni reordenar
-- columnas, y la vista que haya en la base puede venir de cualquiera de los
-- archivos que la definieron. Fallaba con "42P16: cannot drop columns from
-- view" cuando ya se había corrido resumen-rapido. Va en una transacción, así
-- la vista no falta ni un momento. Sin CASCADE a propósito: ninguna vista ni
-- función depende de ésta (el panel la lee por la API); si algún día una
-- dependiera, el DROP frena con un error en vez de borrarla.

BEGIN;

DROP VIEW IF EXISTS public.admin_resumen_actividad;

CREATE VIEW public.admin_resumen_actividad
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

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- USO DE LA APP: el sistema de las instalaciones "sin dato"
-- ----------------------------------------------------------------
--
-- Reemplaza la función de `supabase-analytics-app-uso-2026-10.sql`. Una
-- instalación cuyos eventos no traen sistema toma el del mismo usuario cuando
-- se sabe sin ambigüedad: de otros eventos de la app con `props->>'os'` o de
-- `user_devices.platform`. Si el usuario usó Android y iPhone, queda sin dato.
--
-- Lo que sigue sin dato (medido el 2026-10-21: 101 de 108) son instalaciones
-- que no abren la app desde antes del 15/10, cuando `/api/track` empezó a
-- poner el sistema. El user-agent de esos eventos no se guardó, así que no hay
-- de dónde sacarlo; salen solas de la ventana de 30 días.

CREATE OR REPLACE FUNCTION public.admin_app_uso()
RETURNS TABLE (
  activas      bigint,
  con_sesion   bigint,
  sin_sesion   bigint,
  android      bigint,
  ios          bigint,
  sin_sistema  bigint,
  activas_prev bigint,
  desde        timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH ev AS (
    SELECT
      e.anon_id,
      e.user_id,
      e.created_at,
      COALESCE(e.props->>'os', e.props->>'plataforma') AS sistema
    FROM public.analytics_events e
    WHERE e.is_bot = false
      AND e.platform = 'mobile'
      AND e.created_at >= now() - interval '37 days'
  ),
  por_instalacion AS (
    SELECT
      ev.anon_id,
      bool_or(ev.created_at >= now() - interval '30 days') AS activa,
      bool_or(ev.user_id IS NOT NULL AND ev.created_at >= now() - interval '30 days') AS con_sesion,
      bool_or(ev.created_at < now() - interval '7 days') AS activa_prev,
      (array_agg(ev.sistema ORDER BY ev.created_at DESC)
         FILTER (WHERE ev.sistema IN ('android', 'ios')))[1] AS sistema,
      array_agg(DISTINCT ev.user_id) FILTER (WHERE ev.user_id IS NOT NULL) AS usuarios
    FROM ev
    GROUP BY ev.anon_id
  ),
  -- Los sistemas conocidos de cada usuario, de toda la historia.
  sistema_usuario AS (
    SELECT s.user_id, array_agg(DISTINCT s.sistema) AS sistemas
    FROM (
      SELECT x.user_id, x.props->>'os' AS sistema
        FROM public.analytics_events x
       WHERE x.is_bot = false AND x.platform = 'mobile' AND x.user_id IS NOT NULL
         AND x.props->>'os' IN ('android', 'ios')
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
         WHERE su.user_id = ANY (p.usuarios)
      )) AS sistema_final
    FROM por_instalacion p
  )
  SELECT
    count(*) FILTER (WHERE r.activa)::bigint,
    count(*) FILTER (WHERE r.activa AND r.con_sesion)::bigint,
    count(*) FILTER (WHERE r.activa AND NOT r.con_sesion)::bigint,
    count(*) FILTER (WHERE r.activa AND r.sistema_final = 'android')::bigint,
    count(*) FILTER (WHERE r.activa AND r.sistema_final = 'ios')::bigint,
    count(*) FILTER (WHERE r.activa AND r.sistema_final IS NULL)::bigint,
    count(*) FILTER (WHERE r.activa_prev)::bigint,
    (SELECT min(x.created_at)
       FROM public.analytics_events x
      WHERE x.is_bot = false AND x.platform = 'mobile')
  FROM resuelto r;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_app_uso() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_app_uso() TO service_role;

-- ----------------------------------------------------------------
-- ACTIVIDAD POR HORA DEL DÍA
-- ----------------------------------------------------------------
--
-- Todos los eventos de personas (web y app) de los últimos `p_dias` días, por
-- hora de Argentina. Sin `ad_cargado` ni `ads_estado`, que son técnicos: los
-- manda la app cuando carga un anuncio, no cuando la persona hace algo.
-- Se agrupa acá y no en el panel porque son ~80 mil eventos por mes.

CREATE OR REPLACE FUNCTION public.admin_actividad_por_hora(p_dias int DEFAULT 30)
RETURNS TABLE (hora int, eventos bigint, personas bigint)
LANGUAGE sql
STABLE
AS $$
  WITH ev AS (
    SELECT
      extract(hour FROM e.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::int AS hora,
      e.anon_id
    FROM public.analytics_events e
    WHERE e.is_bot = false
      AND e.created_at >= now() - make_interval(days => GREATEST(p_dias, 1))
      AND e.name NOT IN ('ad_cargado', 'ads_estado')
  )
  SELECT
    h.hora,
    count(ev.hora)::bigint,
    count(DISTINCT ev.anon_id)::bigint
  FROM generate_series(0, 23) AS h(hora)
  LEFT JOIN ev ON ev.hora = h.hora
  GROUP BY h.hora
  ORDER BY h.hora;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_actividad_por_hora(int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_actividad_por_hora(int) TO service_role;

-- VERIFICAR:
--   SELECT * FROM public.admin_resumen_actividad;
--   SELECT * FROM public.admin_app_uso();   -- sin_sistema tendría que bajar ~7
--   SELECT * FROM public.admin_actividad_por_hora(30);

-- PostgREST cachea el esquema: sin esto las funciones nuevas pueden tardar
-- en verse desde la API.
NOTIFY pgrst, 'reload schema';
