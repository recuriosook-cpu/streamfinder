-- ================================================================
-- GLYNBOX — Métricas de actividad para el resumen de /admin
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez.
--
-- REQUIERE haber corrido antes:
--   1. supabase-analytics-bots.sql      (is_bot, bot_reason, índices)
--   2. supabase-analytics-actividad.sql (user_activity_time, analytics_medicion)
-- ================================================================
--
-- Este archivo hace dos cosas:
--
--   (a) Saca el cálculo de duración de sesión de adentro de
--       `user_activity_time` y lo pone en una vista propia,
--       `analytics_sessions`. La lógica es la misma, no cambia ni un número:
--       cambia dónde vive. Ahora hay UN solo lugar donde están escritas las
--       cuatro reglas, y las dos vistas que las necesitan la consultan.
--
--   (b) Agrega `admin_resumen_actividad`, que devuelve UNA fila con todas las
--       métricas del resumen y sus comparaciones contra el período anterior.
--
-- Sobre (a): `user_activity_time` se reconstruye con exactamente las mismas
-- columnas, en el mismo orden y con los mismos tipos, así que /admin/usuarios
-- no se entera. No hace falta tocar nada de esa página.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. UNA FILA POR SESIÓN — el cálculo, en un solo lugar
-- ----------------------------------------------------------------
--
-- Las cuatro reglas, tal como estaban:
--
--   1. Una sesión es una tira de eventos con el mismo `session_id`.
--   2. Su duración es (último evento − primer evento).
--   3. Si tiene un solo evento, cuenta 30 segundos.
--   4. Toda sesión se topea en 30 minutos.
--
-- (La regla 5 —el total por usuario es la suma— vive en la vista de abajo,
-- porque es lo único que es por usuario y no por sesión.)

CREATE OR REPLACE VIEW public.analytics_sessions
WITH (security_invoker = true) AS
WITH agrupadas AS (
  SELECT
    session_id,

    -- A quién se le imputa la sesión. Se toma el ÚLTIMO `user_id` no nulo:
    -- una sesión puede arrancar anónima y terminar logueada, y en ese caso
    -- toda la sesión —incluida la parte de antes del login— es tiempo que esa
    -- persona pasó en el sitio. Queda NULL si nunca hubo sesión iniciada.
    (array_agg(user_id ORDER BY created_at DESC)
       FILTER (WHERE user_id IS NOT NULL))[1] AS user_id,

    -- El navegador. Es lo que permite contar visitantes anónimos sin cuenta.
    (array_agg(anon_id ORDER BY created_at DESC))[1] AS anon_id,

    count(*)        AS eventos,
    min(created_at) AS inicio,
    max(created_at) AS fin

  FROM public.analytics_events
  WHERE is_bot = false      -- regla que no se negocia: nada del panel cuenta bots
  GROUP BY session_id
)
SELECT
  session_id,
  user_id,
  anon_id,
  eventos,
  inicio,
  fin,
  LEAST(
    CASE
      WHEN eventos = 1 THEN 30   -- regla 3
      ELSE EXTRACT(EPOCH FROM (fin - inicio))  -- regla 2
    END,
    1800                          -- regla 4
  ) AS segundos
FROM agrupadas;

-- ----------------------------------------------------------------
-- 2. TIEMPO POR USUARIO — ahora apoyado en la vista de arriba
-- ----------------------------------------------------------------
--
-- Mismas columnas, mismo orden, mismos tipos que la versión anterior. Lo único
-- que cambia es que el cálculo de duración ya no está duplicado acá adentro.
--
-- DROP + CREATE en vez de CREATE OR REPLACE porque `REPLACE` no deja tocar la
-- definición si Postgres decide que algún tipo cambió, y falla con un error
-- confuso. Nada depende de esta vista salvo /api/admin/users, que la consulta
-- por nombre.

DROP VIEW IF EXISTS public.user_activity_time;

CREATE VIEW public.user_activity_time
WITH (security_invoker = true) AS
SELECT
  user_id,
  round(sum(segundos))::bigint AS segundos_totales,  -- regla 5
  count(*)::int                AS sesiones,
  min(inicio)                  AS primera_actividad,
  max(fin)                     AS ultima_actividad
FROM public.analytics_sessions
-- Las sesiones que nunca tuvieron `user_id` son visitas anónimas: son tráfico
-- real, pero no se le pueden imputar a nadie, y esta vista es por usuario.
WHERE user_id IS NOT NULL
GROUP BY user_id;

-- ----------------------------------------------------------------
-- 3. EL RESUMEN — una fila con todo
-- ----------------------------------------------------------------
--
-- ── Sobre "hoy" ──────────────────────────────────────────────────────────
--
-- `now()` en Postgres es UTC. Si "hoy" arrancara en UTC, para nosotros el día
-- empezaría a las 21:00 de la noche anterior y el número de "conectados hoy"
-- sería incomprensible: a las 22:00 de un martes ya estaría contando el
-- miércoles. Por eso las ventanas se calculan en horario argentino y recién
-- después se convierten de vuelta a timestamptz para comparar contra
-- `created_at`.
--
-- ── Sobre las ventanas ───────────────────────────────────────────────────
--
--   hoy            [00:00 de hoy, ahora]
--   ayer           [00:00 de ayer, 00:00 de hoy)
--   semana         [00:00 de hace 6 días, ahora]      → 7 días con hoy incluido
--   semana previa  [00:00 de hace 13 días, semana)    → los 7 anteriores
--
-- ── Sobre los anónimos ───────────────────────────────────────────────────
--
-- Se cuentan los `anon_id` que NO tuvieron ningún evento logueado en la
-- ventana, no los eventos con `user_id IS NULL`. La diferencia importa: quien
-- entra sin cuenta y se loguea a los dos minutos tiene eventos de los dos
-- tipos, y con el criterio literal aparecería en las dos tarjetas al mismo
-- tiempo. Así los dos números son disjuntos y se pueden sumar.

CREATE OR REPLACE VIEW public.admin_resumen_actividad
WITH (security_invoker = true) AS
WITH v AS (
  SELECT
    d.hoy_desde,
    d.hoy_desde - interval '1 day'   AS ayer_desde,
    d.hoy_desde - interval '6 days'  AS semana_desde,
    d.hoy_desde - interval '13 days' AS semana_prev_desde
  FROM (
    SELECT (date_trunc('day', now() AT TIME ZONE 'America/Argentina/Buenos_Aires')
              AT TIME ZONE 'America/Argentina/Buenos_Aires') AS hoy_desde
  ) d
),

-- ── Eventos: usuarios y anónimos ────────────────────────────────────────
eventos AS (
  SELECT
    -- 1. Usuarios logueados distintos
    count(DISTINCT e.user_id) FILTER (
      WHERE e.user_id IS NOT NULL AND e.created_at >= v.hoy_desde
    ) AS usuarios_hoy,
    count(DISTINCT e.user_id) FILTER (
      WHERE e.user_id IS NOT NULL
        AND e.created_at >= v.ayer_desde AND e.created_at < v.hoy_desde
    ) AS usuarios_ayer,

    -- 2. Últimos 7 días. OJO: no es la suma de los diarios — alguien que entró
    -- tres días cuenta una sola vez. Por eso se calcula sobre la ventana
    -- entera y no agregando days.
    count(DISTINCT e.user_id) FILTER (
      WHERE e.user_id IS NOT NULL AND e.created_at >= v.semana_desde
    ) AS usuarios_semana,
    count(DISTINCT e.user_id) FILTER (
      WHERE e.user_id IS NOT NULL
        AND e.created_at >= v.semana_prev_desde AND e.created_at < v.semana_desde
    ) AS usuarios_semana_prev,

    -- 3. Anónimos: todos los navegadores de la ventana, menos los que en algún
    -- momento estuvieron logueados. La resta es lo que los hace disjuntos de
    -- las tarjetas de arriba.
    count(DISTINCT e.anon_id) FILTER (WHERE e.created_at >= v.hoy_desde)
      - count(DISTINCT e.anon_id) FILTER (
          WHERE e.user_id IS NOT NULL AND e.created_at >= v.hoy_desde
        ) AS anonimos_hoy,
    count(DISTINCT e.anon_id) FILTER (
      WHERE e.created_at >= v.ayer_desde AND e.created_at < v.hoy_desde
    ) - count(DISTINCT e.anon_id) FILTER (
      WHERE e.user_id IS NOT NULL
        AND e.created_at >= v.ayer_desde AND e.created_at < v.hoy_desde
    ) AS anonimos_ayer

  FROM v LEFT JOIN public.analytics_events e
    ON e.is_bot = false
   AND e.created_at >= v.semana_prev_desde
  GROUP BY v.hoy_desde, v.ayer_desde, v.semana_desde, v.semana_prev_desde
),

-- ── Sesiones: cuántas y cuánto duran ────────────────────────────────────
-- Sale de `analytics_sessions`, o sea con las cuatro reglas ya aplicadas y
-- sin bots. No se recalcula nada acá.
sesiones AS (
  SELECT
    count(*) FILTER (WHERE s.inicio >= v.hoy_desde)::bigint  AS sesiones_hoy,
    count(*) FILTER (
      WHERE s.inicio >= v.ayer_desde AND s.inicio < v.hoy_desde
    )::bigint AS sesiones_ayer,

    -- El promedio es sobre TODAS las sesiones humanas, anónimas incluidas: la
    -- pregunta "cuánto dura una sesión" no distingue si la persona tenía la
    -- cuenta iniciada. (`user_activity_time` sí es sólo de logueados, pero
    -- porque es por usuario y a un anónimo no se le puede imputar nada.)
    round(avg(s.segundos) FILTER (WHERE s.inicio >= v.hoy_desde))::int
      AS seg_prom_hoy,
    round(avg(s.segundos) FILTER (
      WHERE s.inicio >= v.ayer_desde AND s.inicio < v.hoy_desde
    ))::int AS seg_prom_ayer,
    round(avg(s.segundos))::int AS seg_prom_total

  FROM v LEFT JOIN public.analytics_sessions s ON true
  GROUP BY v.hoy_desde, v.ayer_desde
),

-- ── App instalada ───────────────────────────────────────────────────────
-- `user_devices` no pasa por el filtro de bots y no tiene por qué: es un
-- registro de dispositivos que escribe la app nativa después de un login, no
-- tráfico web. Un crawler no llega jamás.
app AS (
  SELECT
    count(DISTINCT d.user_id)::int AS usuarios_con_app,
    count(DISTINCT d.user_id) FILTER (WHERE d.platform = 'android')::int AS android,
    count(DISTINCT d.user_id) FILTER (WHERE d.platform = 'ios')::int     AS ios,
    count(DISTINCT d.user_id) FILTER (
      WHERE d.platform IS NULL OR d.platform NOT IN ('android', 'ios')
    )::int AS otras,

    -- Cuántos tenían la app hace una semana: los que ya tenían al menos un
    -- dispositivo registrado antes del corte. Es la base de la comparación.
    count(DISTINCT d.user_id) FILTER (
      WHERE d.created_at < v.semana_desde
    )::int AS usuarios_con_app_prev
  FROM v LEFT JOIN public.user_devices d ON true
  GROUP BY v.semana_desde
)

SELECT
  (SELECT hoy_desde FROM v) AS hoy_desde,
  eventos.*,
  sesiones.*,
  app.*
FROM eventos, sesiones, app;

-- ----------------------------------------------------------------
-- 4. PERMISOS
-- ----------------------------------------------------------------
-- Igual que las otras: `security_invoker` para que RLS se evalúe con los
-- permisos de quien consulta, y REVOKE porque Supabase le da acceso a `anon` y
-- `authenticated` por default a todo lo que se crea en `public`. La service
-- role —la que usa el panel— saltea RLS por diseño y no pasa por acá.

REVOKE ALL ON public.analytics_sessions       FROM anon, authenticated;
REVOKE ALL ON public.user_activity_time       FROM anon, authenticated;
REVOKE ALL ON public.admin_resumen_actividad  FROM anon, authenticated;

-- ----------------------------------------------------------------
-- 5. VERIFICAR
-- ----------------------------------------------------------------
--
--   SELECT * FROM public.admin_resumen_actividad;
--
-- Que /admin/usuarios siga dando lo mismo que antes (tiene que ser idéntico,
-- la vista se reconstruyó sin cambiar la lógica):
--
--   SELECT count(*) AS usuarios, sum(segundos_totales) AS seg, sum(sesiones) AS ses
--     FROM public.user_activity_time;
--
-- Que las tarjetas de logueados y anónimos no se pisen — el total de
-- navegadores de hoy tiene que dar igual a la suma de las dos:
--
--   SELECT count(DISTINCT anon_id) AS navegadores_hoy
--     FROM public.analytics_events
--    WHERE is_bot = false
--      AND created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Argentina/Buenos_Aires')
--                           AT TIME ZONE 'America/Argentina/Buenos_Aires');
