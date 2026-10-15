-- ================================================================
-- GLYNBOX — Cuántas instalaciones de la app se usan (panel de admin)
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez.
--
-- REQUIERE haber corrido antes:
--   · supabase-analytics-events.sql  (la tabla)
--   · supabase-analytics-bots.sql    (is_bot)
--   · supabase-analytics-app.sql     (el índice por plataforma)
-- ================================================================
--
-- El recuadro "Tienen la app instalada" del resumen contaba `user_devices`,
-- que es la tabla de tokens de notificaciones: sólo entran los que iniciaron
-- sesión EN la app y además aceptaron el permiso. El 2026-10-15 eran 49
-- usuarios contra 302 instalaciones que mandaban eventos y 228 dispositivos
-- activos según Google Play.
--
-- Esto cuenta lo que el recuadro quería decir: instalaciones que usaron la app
-- en los últimos 30 días, tengan o no la sesión iniciada.
--
-- ── Las definiciones ──────────────────────────────────────────────────────
--
--   · Instalación = un `anon_id` de la app (`platform = 'mobile'`). Nace con la
--     instalación y muere con ella; sobrevive a las actualizaciones. Existe
--     desde la versión 1.0.9 (2026-09-20): una instalación más vieja que no se
--     actualizó no manda eventos y acá no aparece.
--   · Activa = al menos un evento humano en los últimos 30 días. Es la misma
--     ventana que "dispositivos activos" de Google Play, para que se puedan
--     poner uno al lado del otro.
--   · Con sesión = alguno de esos eventos trae `user_id`. Una instalación que
--     inició sesión y después la cerró, dentro de la ventana, cuenta con sesión.
--   · Sistema = `props->>'os'`, que pone `/api/track` desde el user-agent
--     (desde 2026-10-15), o si no `props->>'plataforma'`, que traen los
--     eventos de anuncios desde antes. Se toma el último conocido. Las
--     instalaciones que no mandaron ninguno de los dos van a "sin dato", y ese
--     grupo se vacía solo a medida que vuelven a abrir la app.
--   · Hace una semana = activas en los 30 días que terminaban hace 7, para la
--     comparación del recuadro.
--
-- ================================================================

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
         FILTER (WHERE ev.sistema IN ('android', 'ios')))[1] AS sistema
    FROM ev
    GROUP BY ev.anon_id
  )
  SELECT
    count(*) FILTER (WHERE p.activa)::bigint,
    count(*) FILTER (WHERE p.activa AND p.con_sesion)::bigint,
    count(*) FILTER (WHERE p.activa AND NOT p.con_sesion)::bigint,
    count(*) FILTER (WHERE p.activa AND p.sistema = 'android')::bigint,
    count(*) FILTER (WHERE p.activa AND p.sistema = 'ios')::bigint,
    count(*) FILTER (WHERE p.activa AND p.sistema IS NULL)::bigint,
    count(*) FILTER (WHERE p.activa_prev)::bigint,
    -- Desde cuándo hay eventos de app: si es hace menos de 30 días, la ventana
    -- todavía no está llena y el panel lo dice.
    (SELECT min(x.created_at)
       FROM public.analytics_events x
      WHERE x.is_bot = false AND x.platform = 'mobile')
  FROM por_instalacion p;
$$;

-- ----------------------------------------------------------------
-- PERMISOS
-- ----------------------------------------------------------------
-- Como las demás funciones del panel: una función nueva nace con EXECUTE para
-- PUBLIC, y ni `anon` ni `authenticated` tienen que poder llamarla (la anon key
-- viaja en el bundle). Se le devuelve a `service_role`, que es con la que
-- consulta el endpoint.

REVOKE EXECUTE ON FUNCTION public.admin_app_uso() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_app_uso() TO service_role;

-- ----------------------------------------------------------------
-- VERIFICAR
-- ----------------------------------------------------------------
--
--   SELECT * FROM public.admin_app_uso();
--
-- `activas` tiene que ser igual a `con_sesion + sin_sesion` y a
-- `android + ios + sin_sistema`.
