-- ================================================================
-- GLYNBOX — Tiempo de actividad por usuario
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez.
--
-- REQUIERE haber corrido antes `supabase-analytics-bots.sql`, porque todo
-- acá filtra por `is_bot = false`.
-- ================================================================
--
-- Definición del cálculo. Está fijada de antemano y el SQL la sigue al pie:
--
--   1. Una sesión es una tira de eventos con el mismo `session_id`.
--   2. Su duración es (último evento − primer evento).
--   3. Si tiene un solo evento, cuenta 30 segundos.
--   4. Toda sesión se topea en 30 minutos, para que una pestaña abierta toda
--      la noche no invente 8 horas de uso.
--   5. El tiempo del usuario es la suma de sus sesiones.
--
-- ================================================================

-- ----------------------------------------------------------------
-- 1. TIEMPO Y SESIONES POR USUARIO
-- ----------------------------------------------------------------

CREATE OR REPLACE VIEW public.user_activity_time
WITH (security_invoker = true) AS
WITH sesiones AS (
  SELECT
    session_id,

    -- A quién se le imputa la sesión.
    --
    -- Una sesión puede arrancar anónima —alguien que entra sin cuenta, navega
    -- y recién después se loguea— y terminar con `user_id`. Toda esa sesión
    -- cuenta para el usuario que la terminó, incluida la parte de antes del
    -- login: es tiempo que esa persona pasó en el sitio.
    --
    -- Se toma el ÚLTIMO `user_id` no nulo y no uno cualquiera, para que el caso
    -- raro de dos cuentas en la misma pestaña sea determinista en vez de
    -- depender del orden en que Postgres devuelva las filas.
    (array_agg(user_id ORDER BY created_at DESC)
       FILTER (WHERE user_id IS NOT NULL))[1] AS user_id,

    count(*)        AS eventos,
    min(created_at) AS inicio,
    max(created_at) AS fin

  FROM public.analytics_events
  WHERE is_bot = false          -- regla que no se negocia: el panel no cuenta bots
  GROUP BY session_id
),
con_duracion AS (
  SELECT
    user_id,
    session_id,
    inicio,
    fin,
    LEAST(
      CASE
        -- Regla 3: un solo evento no tiene duración medible. 30 segundos es una
        -- convención, no una medición — está para que una visita real no valga
        -- cero, no para ser exacta.
        WHEN eventos = 1 THEN 30
        -- Regla 2.
        ELSE EXTRACT(EPOCH FROM (fin - inicio))
      END,
      -- Regla 4. El tope va afuera del CASE porque aplica a toda sesión.
      1800
    ) AS segundos
  FROM sesiones
  -- Las sesiones que nunca tuvieron `user_id` son visitas anónimas. Existen y
  -- son tráfico real, pero no se le pueden imputar a nadie, así que quedan
  -- afuera de esta vista (que es por usuario). El embudo anónimo se mide por
  -- `anon_id`, y eso es otra fase.
  WHERE user_id IS NOT NULL
)
SELECT
  user_id,
  -- Regla 5.
  round(sum(segundos))::bigint AS segundos_totales,
  count(*)::int                AS sesiones,
  min(inicio)                  AS primera_actividad,
  max(fin)                     AS ultima_actividad
FROM con_duracion
GROUP BY user_id;

-- ----------------------------------------------------------------
-- 2. DESDE CUÁNDO MEDIMOS
-- ----------------------------------------------------------------
--
-- El panel necesita este dato para no mentir. La columna "Tiempo total" no es
-- el histórico del usuario: arranca el día que instalamos el tracking, no el
-- día que la persona se registró. Sin esa aclaración a la vista, dentro de tres
-- meses alguien va a mirar "2h 15m" y creer que es todo lo que usó la app.
--
-- Sale de la base y no hardcodeado, porque si algún día se purga la tabla por
-- retención la fecha se corrige sola.

CREATE OR REPLACE VIEW public.analytics_medicion
WITH (security_invoker = true) AS
SELECT
  min(created_at) FILTER (WHERE is_bot = false)            AS desde,
  count(*)        FILTER (WHERE is_bot = false)            AS eventos_humanos,
  count(*)        FILTER (WHERE is_bot = true)             AS eventos_bot,
  count(DISTINCT session_id) FILTER (WHERE is_bot = false) AS sesiones_humanas,
  count(DISTINCT user_id)    FILTER (WHERE is_bot = false) AS usuarios_con_datos
FROM public.analytics_events;

-- ----------------------------------------------------------------
-- 3. PERMISOS
-- ----------------------------------------------------------------
--
-- Dos capas, a propósito.
--
-- `security_invoker = true` en las dos vistas hace que se evalúen con los
-- permisos de QUIEN CONSULTA, no del dueño. Sin eso, una vista sobre una tabla
-- con RLS es un agujero: el dueño la creó, el dueño saltea RLS, y cualquiera
-- con la anon key —que viaja en el bundle— podría leer la actividad agregada de
-- todos los usuarios consultando la vista en vez de la tabla.
--
-- El REVOKE es la segunda capa. Supabase le da permisos a `anon` y
-- `authenticated` por default sobre lo que se crea en `public`, así que hay que
-- sacárselos explícitamente. La service role no pasa por acá: saltea RLS por
-- diseño y es la que usa el panel.

REVOKE ALL ON public.user_activity_time FROM anon, authenticated;
REVOKE ALL ON public.analytics_medicion  FROM anon, authenticated;

-- ----------------------------------------------------------------
-- 4. VERIFICAR
-- ----------------------------------------------------------------
--
--   SELECT * FROM public.analytics_medicion;
--
--   SELECT u.user_id, p.username, u.segundos_totales, u.sesiones,
--          u.segundos_totales / 60 AS minutos
--     FROM public.user_activity_time u
--     LEFT JOIN public.profiles p ON p.id = u.user_id
--    ORDER BY u.segundos_totales DESC
--    LIMIT 20;
--
-- Y para confirmar que anon NO puede leer (tiene que dar error de permisos):
--   curl "$SUPABASE_URL/rest/v1/user_activity_time?select=*&limit=1" \
--        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"

-- ----------------------------------------------------------------
-- 5. DOS COSAS PARA MÁS ADELANTE
-- ----------------------------------------------------------------
--
-- (a) EL REBOTE AHORA VALE CERO.
--
-- Con `page_view` en la lista blanca, quien entra y se va sin navegar genera
-- DOS eventos casi simultáneos —`app_open` y `page_view`, con milisegundos de
-- diferencia— en vez de uno. Como ya no es "una sesión de un solo evento", la
-- regla 3 no se le aplica: la regla 2 le calcula la duración real, que es
-- ~0 segundos. Antes esa misma visita valía 30.
--
-- O sea: agregar page_view mejora las sesiones largas y empeora los rebotes.
-- No lo cambio porque la definición estaba fijada de antemano, pero si querés
-- que un rebote siga valiendo 30 segundos, el cambio es poner un piso en vez de
-- un caso especial — reemplazar el CASE entero de arriba por:
--
--     LEAST(GREATEST(EXTRACT(EPOCH FROM (fin - inicio)), 30), 1800)
--
-- Eso deja las reglas 2, 4 y 5 intactas y sólo generaliza la 3: en vez de "una
-- sesión de un evento vale 30s", queda "ninguna sesión vale menos de 30s".
--
-- (b) CUÁNDO ESTA VISTA SE VA A PONER LENTA.
--
-- La vista agrupa TODA la tabla por session_id antes de filtrar por usuario, y
-- ese filtro no se puede empujar adentro del GROUP BY. Hoy son 16 filas
-- humanas y es instantáneo. El índice parcial
-- `analytics_events_humano_session_idx` la sostiene bastante, pero a partir del
-- millón de eventos conviene materializarla:
--
--     CREATE MATERIALIZED VIEW public.user_activity_time_mv AS
--       SELECT * FROM public.user_activity_time;
--     CREATE UNIQUE INDEX ON public.user_activity_time_mv (user_id);
--     -- y un cron cada 15 minutos:
--     REFRESH MATERIALIZED VIEW CONCURRENTLY public.user_activity_time_mv;
--
-- El panel pasaría a leer la materializada. No lo hago ahora porque un dato de
-- hace 15 minutos es peor que uno exacto mientras el exacto sea gratis.
