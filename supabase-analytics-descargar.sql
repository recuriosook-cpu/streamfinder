-- ================================================================
-- GLYNBOX — Embudo de la landing /descargar
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez.
--
-- REQUIERE haber corrido antes:
--   · supabase-analytics-events.sql  (la tabla)
--   · supabase-analytics-bots.sql    (la columna is_bot y sus índices)
-- ================================================================
--
-- Qué se quiere medir, de la gente que entra por la landing de campañas:
--
--   1. Cuántos la visitaron.
--   2. Cuántos tocaron cada botón, separando Play Store de "entrar al sitio".
--   3. De los que entraron al sitio, cuántos terminaron registrándose.
--   4. Cuánto tiempo se quedaron y cuántas páginas vieron.
--
-- Los puntos 3 y 4 son los que obligan a todo esto. Contar visitas y clicks
-- alcanza con contar eventos sueltos, y de hecho así se hacía. Pero un registro
-- no ocurre en `/descargar`: ocurre dos o tres pantallas después, en el
-- onboarding, y para entonces el único hilo que queda con el origen es la
-- sesión. Lo mismo el tiempo y las páginas: son propiedades de la sesión
-- entera, no de un evento.
--
-- ── La marca de origen ────────────────────────────────────────────────────
--
-- `lib/analytics.ts` escribe `origen: 'descargar'` en las props de TODOS los
-- eventos de una sesión, desde que esa sesión pisa `/descargar` y hasta que se
-- termina. La marca vive en sessionStorage atada al `session_id`, así que
-- sobrevive a la vuelta del login de Google —misma pestaña— y no se contagia a
-- la sesión siguiente.
--
-- Acá esa marca se usa sólo para IDENTIFICAR la sesión. Una vez identificada,
-- se agregan todos sus eventos, tenga cada uno la marca o no.
--
-- ── La unidad es la sesión, no el evento ──────────────────────────────────
--
-- Todo lo que sale de acá cuenta sesiones. Es la única unidad con la que el
-- embudo cierra: si "clicks" contara eventos, alguien que toca el botón tres
-- veces daría 300% de conversión sobre su propia visita. Una sesión con tres
-- clicks es una persona que tocó el botón, y eso es lo que se quiere saber.
--
-- ── Lo que no se puede medir ──────────────────────────────────────────────
--
-- Quien se va a Play Store sale del sitio y no vuelve a aparecer. De esa rama
-- sólo se cuenta el click; la instalación ocurre en Google y no llega hasta
-- acá. El panel lo dice en pantalla para que nadie lea ese número como
-- instalaciones.
--
-- ================================================================

-- ----------------------------------------------------------------
-- 1. ÍNDICE
-- ----------------------------------------------------------------
--
-- El acceso nuevo es "dame las sesiones marcadas". Sin índice eso es un scan de
-- toda la tabla, porque `props` es JSONB y no hay nada que lo cubra.
--
-- Parcial sobre la condición, como los de `supabase-analytics-bots.sql`: hoy
-- las sesiones con marca son una fracción mínima del total, así que el índice
-- queda chiquito y sigue sirviendo cuando la tabla crezca.

CREATE INDEX IF NOT EXISTS analytics_events_humano_origen_idx
  ON public.analytics_events (session_id)
  WHERE is_bot = false AND props->>'origen' IS NOT NULL;

-- ----------------------------------------------------------------
-- 2. UNA FILA POR SESIÓN QUE LLEGÓ POR /descargar
-- ----------------------------------------------------------------
--
-- La duración sigue exactamente la misma convención que
-- `supabase-analytics-actividad.sql`, y no por copiar: si esta vista midiera el
-- tiempo distinto que `user_activity_time`, el panel mostraría dos promedios
-- que no se pueden comparar entre sí.
--
--   · Duración = último evento − primer evento.
--   · Una sesión de un solo evento vale 30 segundos.
--   · Toda sesión se topea en 30 minutos.

CREATE OR REPLACE VIEW public.analytics_descargar_sesiones
WITH (security_invoker = true) AS
WITH marcadas AS (
  SELECT DISTINCT session_id
    FROM public.analytics_events
   WHERE is_bot = false
     AND props->>'origen' = 'descargar'
)
SELECT
  e.session_id,

  min(e.created_at) AS inicio,
  max(e.created_at) AS fin,

  LEAST(
    CASE
      WHEN count(*) = 1 THEN 30
      ELSE EXTRACT(EPOCH FROM (max(e.created_at) - min(e.created_at)))
    END,
    1800
  )::int AS segundos,

  -- Páginas vistas en toda la sesión, incluida la landing: `PageViewTracker`
  -- está en el layout raíz y dispara también en `/descargar`.
  count(*) FILTER (WHERE e.name = 'page_view')::int AS vistas,

  count(*) FILTER (
    WHERE e.name = 'descargar_clicked' AND e.props->>'destino' = 'play_store'
  )::int AS clicks_play,

  count(*) FILTER (
    WHERE e.name = 'descargar_clicked' AND e.props->>'destino' = 'glynbox_web'
  )::int AS clicks_web,

  -- El registro se dispara en `/onboarding`, ya lejos de la landing. Es
  -- justamente lo que la marca de origen permite atribuir.
  count(*) FILTER (WHERE e.name = 'signup_completed')::int AS registros,

  -- Con qué aparato llegó: el de su primera vista de la landing.
  --
  -- `array_agg(...)[1]` y no `min()`: se quiere el PRIMERO en el tiempo, no el
  -- menor alfabéticamente. Una sesión marcada siempre debería tener al menos un
  -- `descargar_viewed`; el COALESCE cubre el caso raro de que ese evento se
  -- haya perdido en el camino y evita que la sesión desaparezca del agrupado
  -- por tener el dispositivo en NULL.
  COALESCE(
    (array_agg(e.props->>'dispositivo' ORDER BY e.created_at)
       FILTER (WHERE e.name = 'descargar_viewed' AND e.props->>'dispositivo' IS NOT NULL))[1],
    'desconocido'
  ) AS dispositivo

FROM public.analytics_events e
JOIN marcadas m ON m.session_id = e.session_id
WHERE e.is_bot = false     -- regla que no se negocia: el panel no cuenta bots
GROUP BY e.session_id;

-- ----------------------------------------------------------------
-- 3. EL RESUMEN QUE CONSUME EL PANEL
-- ----------------------------------------------------------------
--
-- Una función y no una vista porque el panel filtra por ventana de tiempo (7 o
-- 30 días) y PostgREST no sabe agrupar: pedirle a la vista que devuelva las
-- filas y promediarlas en JavaScript funcionaría hoy y se rompería el día que
-- haya cien mil sesiones.
--
-- La ventana se aplica sobre `inicio`, o sea la sesión se cuenta en el día en
-- que empezó. Una sesión que arranca 23:58 y termina 00:03 cuenta entera para
-- el día que arrancó, que es lo que uno espera al leer "últimos 7 días".
--
-- `primera` va sin ventana a propósito: es "desde cuándo medimos", y sirve
-- justamente para saber si los últimos 30 días son 30 días de datos o tres.

CREATE OR REPLACE FUNCTION public.analytics_descargar_resumen(p_dias int DEFAULT 30)
RETURNS TABLE (
  visitas           bigint,
  con_click         bigint,
  con_click_play    bigint,
  con_click_web     bigint,
  registros         bigint,
  segundos_promedio numeric,
  vistas_promedio   numeric,
  primera           timestamptz
)
LANGUAGE sql
STABLE
AS $$
  -- Todas las columnas van calificadas con `v.`, y no es manía de estilo.
  -- `RETURNS TABLE (...)` declara parámetros de salida, y esos nombres quedan
  -- visibles dentro del cuerpo: `registros` es a la vez una columna de la
  -- vista y un parámetro de salida de esta función. Sin calificar, esa
  -- referencia es ambigua y depende de una regla de precedencia que no tiene
  -- por qué conocer el que venga a tocar esto.
  WITH ventana AS (
    SELECT *
      FROM public.analytics_descargar_sesiones
     WHERE inicio >= now() - make_interval(days => GREATEST(p_dias, 1))
  )
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE v.clicks_play + v.clicks_web > 0)::bigint,
    count(*) FILTER (WHERE v.clicks_play > 0)::bigint,
    count(*) FILTER (WHERE v.clicks_web  > 0)::bigint,
    count(*) FILTER (WHERE v.registros   > 0)::bigint,
    round(avg(v.segundos)::numeric, 1),
    round(avg(v.vistas)::numeric, 2),
    (SELECT min(s.inicio) FROM public.analytics_descargar_sesiones s)
  FROM ventana v;
$$;

-- ----------------------------------------------------------------
-- 4. EL MISMO CORTE, POR DISPOSITIVO
-- ----------------------------------------------------------------
--
-- Va aparte y no como columna del resumen porque devuelve N filas y el resumen
-- devuelve una. Las dos las pide el endpoint en paralelo.

CREATE OR REPLACE FUNCTION public.analytics_descargar_dispositivos(p_dias int DEFAULT 30)
RETURNS TABLE (
  dispositivo    text,
  visitas        bigint,
  con_click_play bigint,
  con_click_web  bigint,
  registros      bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    s.dispositivo,
    count(*)::bigint,
    count(*) FILTER (WHERE s.clicks_play > 0)::bigint,
    count(*) FILTER (WHERE s.clicks_web  > 0)::bigint,
    count(*) FILTER (WHERE s.registros   > 0)::bigint
  FROM public.analytics_descargar_sesiones s
  WHERE s.inicio >= now() - make_interval(days => GREATEST(p_dias, 1))
  GROUP BY s.dispositivo;
$$;

-- ----------------------------------------------------------------
-- 5. PERMISOS
-- ----------------------------------------------------------------
--
-- Mismo criterio que `supabase-analytics-actividad.sql`, con una vuelta de
-- tuerca que las vistas no necesitan.
--
-- La vista se protege con `security_invoker = true` —se evalúa con los permisos
-- de quien consulta, no del dueño— más el REVOKE, porque Supabase le da acceso
-- a `anon` y `authenticated` por default a todo lo que se crea en `public`. Sin
-- las dos capas, cualquiera con la anon key (que viaja en el bundle) podría
-- leer las sesiones.
--
-- Las funciones necesitan además un REVOKE a PUBLIC: en Postgres una función
-- nueva nace con EXECUTE para todo el mundo, y ni `anon` ni `authenticated`
-- tienen que poder llamarlas. Como PUBLIC incluye a `service_role`, después
-- hay que devolvérselo explícitamente — es el rol con el que el endpoint del
-- panel las consulta.

REVOKE ALL ON public.analytics_descargar_sesiones FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.analytics_descargar_resumen(int)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.analytics_descargar_resumen(int)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.analytics_descargar_dispositivos(int)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.analytics_descargar_dispositivos(int)
  TO service_role;

-- ----------------------------------------------------------------
-- 6. VERIFICAR
-- ----------------------------------------------------------------
--
-- Hay marca de origen llegando?
--
--   SELECT count(*) AS eventos_marcados,
--          count(DISTINCT session_id) AS sesiones_marcadas
--     FROM public.analytics_events
--    WHERE is_bot = false AND props->>'origen' = 'descargar';
--
-- Las últimas sesiones, una por fila:
--
--   SELECT session_id, dispositivo, segundos, vistas,
--          clicks_play, clicks_web, registros, inicio
--     FROM public.analytics_descargar_sesiones
--    ORDER BY inicio DESC
--    LIMIT 20;
--
-- El embudo, que es lo que muestra el panel:
--
--   SELECT * FROM public.analytics_descargar_resumen(30);
--   SELECT * FROM public.analytics_descargar_dispositivos(30);
--
-- Con cero sesiones marcadas el resumen devuelve una fila de ceros y NULLs, no
-- cero filas: es un agregado sin GROUP BY. El endpoint lo trata como "todavía
-- no hay datos".
