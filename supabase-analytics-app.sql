-- ================================================================
-- GLYNBOX — Retención de la app de Android
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez.
--
-- REQUIERE haber corrido antes:
--   · supabase-analytics-events.sql  (la tabla)
--   · supabase-analytics-bots.sql    (is_bot y sus índices)
-- ================================================================
--
-- Esto es lo que faltaba para contestar "por qué se desinstala la app". Hasta
-- ahora la app no mandaba un solo evento y todo el panel de retención medía la
-- web; con la app instrumentada, sus eventos entran a la misma
-- `analytics_events` con `platform = 'mobile'`.
--
-- ── Por qué la unidad es la instalación y no el usuario ───────────────────
--
-- La retención de la web se cohortea por fecha de alta de la cuenta, porque
-- ahí la pregunta es sobre personas registradas. Acá la pregunta es otra: una
-- desinstalación no es una baja de cuenta, es una instalación que deja de
-- aparecer. Y hay dos casos que el corte por usuario perdería enteros:
--
--   · el que instala, mira dos pantallas y borra la app sin registrarse —
--     que es probablemente la mayoría de lo que se está buscando entender;
--   · el que ya tenía cuenta en la web desde hace meses e instala la app hoy.
--     Cohorteado por fecha de alta caería en una semana vieja y su primer día
--     de app no sería el día 1 de nada.
--
-- Por eso la cohorte es la semana del PRIMER evento de esa instalación, y la
-- unidad es el `anon_id`, que en la app vive en AsyncStorage: nace con la
-- instalación y muere con ella. Si un `anon_id` deja de aparecer, esa
-- instalación se abandonó o se borró. No se puede distinguir una cosa de la
-- otra —Google no lo dice— pero para el propósito son lo mismo.
--
-- ── Las mismas dos advertencias de siempre ────────────────────────────────
--
--   1. Antes de que se despliegue la versión instrumentada no hay eventos de
--      app, así que las primeras semanas van a estar vacías. No es un error.
--   2. Una cohorte joven no tiene D7 ni D30 todavía. Van las banderas de
--      madurez y el panel muestra "—" en vez de un cero que no significa nada.
--
-- ================================================================

-- ----------------------------------------------------------------
-- 1. ÍNDICE
-- ----------------------------------------------------------------
--
-- El acceso nuevo es "todos los eventos de app de esta instalación". Los
-- índices de `supabase-analytics-bots.sql` cubren por usuario, por nombre y
-- por sesión, pero ninguno arranca por `platform`, y con la web ya adentro de
-- la misma tabla filtrar por plataforma sin índice es recorrerla entera.

CREATE INDEX IF NOT EXISTS analytics_events_humano_plataforma_idx
  ON public.analytics_events (platform, anon_id, created_at)
  WHERE is_bot = false;

-- ----------------------------------------------------------------
-- 2. RETENCIÓN POR SEMANA DE INSTALACIÓN
-- ----------------------------------------------------------------
--
-- "Volvió el día N" = hubo actividad de app EN el día calendario N contado
-- desde el primer evento. Es la misma definición Día-N que usa
-- `retencion_cohortes` para la web, a propósito: son las dos tablas que
-- alguien va a mirar una al lado de la otra.

CREATE OR REPLACE FUNCTION public.retencion_app_instalaciones(p_semanas int DEFAULT 12)
RETURNS TABLE (
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
  WITH primer_evento AS (
    SELECT e.anon_id, min(e.created_at) AS alta
      FROM public.analytics_events e
     WHERE e.is_bot = false
       AND e.platform = 'mobile'
     GROUP BY e.anon_id
  ),
  cohorte AS (
    SELECT pe.anon_id, pe.alta
      FROM primer_evento pe
     WHERE pe.alta >= date_trunc('week', now()) - make_interval(weeks => GREATEST(p_semanas, 1))
  ),
  dias_activos AS (
    SELECT DISTINCT e.anon_id, date_trunc('day', e.created_at) AS dia
      FROM public.analytics_events e
     WHERE e.is_bot = false
       AND e.platform = 'mobile'
  ),
  marcado AS (
    SELECT
      date_trunc('week', c.alta) AS semana,
      c.alta,
      bool_or(da.dia = date_trunc('day', c.alta) + interval '1 day')  AS v1,
      bool_or(da.dia = date_trunc('day', c.alta) + interval '7 day')  AS v7,
      bool_or(da.dia = date_trunc('day', c.alta) + interval '30 day') AS v30
    FROM cohorte c
    LEFT JOIN dias_activos da ON da.anon_id = c.anon_id
    GROUP BY c.anon_id, c.alta
  )
  SELECT
    m.semana::date,
    count(*)::bigint,
    -- COALESCE porque `bool_or` sobre cero filas da NULL, no false.
    count(*) FILTER (WHERE COALESCE(m.v1,  false))::bigint,
    count(*) FILTER (WHERE COALESCE(m.v7,  false))::bigint,
    count(*) FILTER (WHERE COALESCE(m.v30, false))::bigint,
    (max(m.alta) + interval '2 day'  <= now()),
    (max(m.alta) + interval '8 day'  <= now()),
    (max(m.alta) + interval '31 day' <= now())
  FROM marcado m
  GROUP BY m.semana
  ORDER BY m.semana DESC;
$$;

-- ----------------------------------------------------------------
-- 3. RESUMEN DE LO QUE MANDA LA APP
-- ----------------------------------------------------------------
--
-- Para poder confirmar de un vistazo que la instrumentación está llegando, sin
-- abrir el panel. Es lo primero que hay que mirar después de publicar la
-- versión: si esto devuelve cero filas, el problema es la app, no el panel.

CREATE OR REPLACE FUNCTION public.analytics_app_resumen()
RETURNS TABLE (
  evento        text,
  veces         bigint,
  instalaciones bigint,
  ultimo        timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.name,
    count(*)::bigint,
    count(DISTINCT e.anon_id)::bigint,
    max(e.created_at)
  FROM public.analytics_events e
  WHERE e.is_bot = false
    AND e.platform = 'mobile'
  GROUP BY e.name
  ORDER BY 2 DESC;
$$;

-- ----------------------------------------------------------------
-- 4. PERMISOS
-- ----------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.retencion_app_instalaciones(int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.analytics_app_resumen()          FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.retencion_app_instalaciones(int)  TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_app_resumen()           TO service_role;

-- ----------------------------------------------------------------
-- 5. VERIFICAR
-- ----------------------------------------------------------------
--
-- ¿Está llegando algo de la app?
--
--   SELECT * FROM public.analytics_app_resumen();
--
-- Tendría que aparecer `app_open`, `page_view` y, a medida que se use, los
-- demás. Si está vacío, revisar en este orden:
--
--   1. ¿La versión instrumentada está publicada e instalada?
--   2. ¿El nombre del evento está en `EVENT_NAMES` de
--      `lib/analytics-events.ts`? `/api/track` descarta en silencio lo que no
--      esté en esa lista — no devuelve error.
--   3. ¿Los eventos entraron marcados como bot? `SELECT is_bot, bot_reason,
--      count(*) FROM analytics_events WHERE platform='mobile' GROUP BY 1,2;`
--
-- La retención, que es lo que muestra el panel:
--
--   SELECT * FROM public.retencion_app_instalaciones(12);
