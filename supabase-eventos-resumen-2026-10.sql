-- ================================================================
-- GLYNBOX — Resúmenes permanentes de analytics_events (paso 1 de 3)
-- Correr con: npx supabase db query --linked -f supabase-eventos-resumen-2026-10.sql
-- Seguro de correr más de una vez. No borra ningún evento. Siguen la carga
-- inicial (al final de este archivo), supabase-eventos-panel-2026-10.sql y
-- supabase-eventos-limpieza-2026-10.sql, que es la que borra.
-- ================================================================
--
-- Por qué: el 2026-10-28 la base pesaba 372 MB de los 500 del plan Free y
-- `analytics_events` ocupaba 211 (88 de datos y 124 de índices). Desde el
-- 21/10 entran ~27.000 eventos por día y cada fila cuesta ~600 bytes con sus
-- índices: guardarlos todos 60 días serían ~0,9 GB. El plan es guardar los
-- eventos crudos poco tiempo y lo que el panel necesita de más atrás, resumido:
--
--   analytics_dia_instalacion  un renglón por día, instalación (anon_id) y
--                              plataforma: quiénes la usaron, sistema, idioma,
--                              primer y último evento, eventos por hora y
--                              contadores de deslizar. De acá salen las altas
--                              de la app, D1/D7/D30, "activos", la hora del día.
--   analytics_sesion           un renglón por sesión: lo que antes armaba la
--                              vista analytics_sessions recorriendo la tabla.
--   analytics_dia_evento       cuántos eventos y personas por día, evento y
--                              plataforma (bots aparte). Los anuncios, por
--                              ubicación y sistema.
--
-- Los tres se rehacen desde los eventos crudos con `analytics_resumir(desde,
-- hasta)`: la del panel (cada 10 minutos) rehace ayer y hoy, y la limpieza
-- (paso 3) los tres últimos días antes de borrar nada. Pesan ~250 bytes por
-- instalación activa por día y ~150 por sesión: unos 60 MB por año al
-- tráfico de octubre.
--
-- Las funciones y vistas del panel que miraban más atrás que lo que van a
-- durar los eventos crudos leen ahora los resúmenes (paso 2). Las que
-- quedan sobre los crudos miran eventos que se guardan 60 días (embudo de
-- registro, onboarding, push, landing /descargar).
--
-- Definiciones de partida: las de producción, leídas el 2026-10-28 (los .sql
-- del repo están desactualizados).
-- ================================================================

SET statement_timeout = '15min';


-- ── 1. Tablas ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_dia_instalacion (
  dia            date        NOT NULL,              -- día argentino
  anon_id        text        NOT NULL,
  platform       text        NOT NULL,              -- 'web' o 'mobile'
  usuarios       uuid[]      NOT NULL DEFAULT '{}', -- los user_id de ese día
  ultimo_usuario uuid,
  sistema        text,  -- último android/ios de props.os o props.plataforma
  os             text,  -- último android/ios de props.os (user_app_usage)
  idioma         text,  -- último es/en de app_open o idioma_cambiado
  eventos        int         NOT NULL,
  primer_evento  timestamptz NOT NULL,
  ultimo_evento  timestamptz NOT NULL,
  -- {"13": 40, "14": 2}: eventos por hora argentina, sin los de anuncios
  -- (como admin_actividad_por_hora).
  eventos_hora   jsonb       NOT NULL DEFAULT '{}',
  -- {"deslizar_accion:like": 12, "deslizar_deshacer": 1, "app_open": 3, ...}
  contadores     jsonb       NOT NULL DEFAULT '{}',
  PRIMARY KEY (dia, anon_id, platform)
);
CREATE INDEX IF NOT EXISTS analytics_dia_instalacion_usuarios_idx
  ON public.analytics_dia_instalacion USING gin (usuarios);
CREATE INDEX IF NOT EXISTS analytics_dia_instalacion_app_idx
  ON public.analytics_dia_instalacion (anon_id, dia) WHERE platform = 'mobile';

CREATE TABLE IF NOT EXISTS public.analytics_sesion (
  session_id text        PRIMARY KEY,
  anon_id    text,
  user_id    uuid,       -- el último no nulo, como analytics_sessions
  platform   text,
  eventos    int         NOT NULL,
  paginas    int         NOT NULL,   -- page_view
  inicio     timestamptz NOT NULL,
  fin        timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_sesion_usuario_idx
  ON public.analytics_sesion (user_id, inicio) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_sesion_inicio_idx
  ON public.analytics_sesion (inicio);

CREATE TABLE IF NOT EXISTS public.analytics_dia_evento (
  dia      date    NOT NULL,
  name     text    NOT NULL,
  platform text    NOT NULL,
  is_bot   boolean NOT NULL,
  -- '' salvo ad_cargado: '<ubicacion>|<plataforma>'.
  detalle  text    NOT NULL DEFAULT '',
  eventos  int     NOT NULL,
  personas int     NOT NULL,  -- anon_id distintos de ESE día
  PRIMARY KEY (dia, name, platform, is_bot, detalle)
);

-- Sólo el servidor: nada de esto se lee desde la web ni la app.
ALTER TABLE public.analytics_dia_instalacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_sesion          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_dia_evento      ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_dia_instalacion, public.analytics_sesion, public.analytics_dia_evento
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.analytics_dia_instalacion, public.analytics_sesion, public.analytics_dia_evento
  TO service_role;

-- Los índices de analytics_events se tocan recién en el paso 3: crear uno
-- acá frenaría los INSERT de /api/track mientras dura la carga inicial.


-- ── 2. analytics_resumir ───────────────────────────────────────────────────
-- Rehace los tres resúmenes de los días argentinos [p_desde, p_hasta] desde
-- los eventos crudos. Las sesiones se actualizan sin achicarse nunca: si una
-- sesión tuviera eventos ya borrados, queda lo que se había contado.

CREATE OR REPLACE FUNCTION public.analytics_resumir(p_desde date, p_hasta date)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
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
             WHERE name NOT IN ('ad_cargado', 'ads_estado')
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
    (dia, anon_id, platform, usuarios, ultimo_usuario, sistema, os, idioma,
     eventos, primer_evento, ultimo_evento, eventos_hora, contadores)
  SELECT b.dia, b.anon_id, b.platform, b.usuarios, b.ultimo_usuario, b.sistema, b.os, b.idioma,
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
$$;

REVOKE ALL ON FUNCTION public.analytics_resumir(date, date) FROM PUBLIC, anon, authenticated;


-- ── 3. Carga inicial ─────────────────────────────────────────────────────
-- Toda la historia. No va en este archivo porque tarda más de lo que espera
-- la API de Supabase (~100 s); se corre en tres partes, en este orden, y
-- después supabase-eventos-panel-2026-10.sql:
--
--   npx supabase db query --linked "SELECT public.analytics_resumir('2026-08-01', '2026-10-20')"
--   npx supabase db query --linked "SELECT public.analytics_resumir('2026-10-21', '2026-10-24')"
--   npx supabase db query --linked "SELECT public.analytics_resumir('2026-10-25', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)"
