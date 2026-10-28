-- ================================================================
-- GLYNBOX — Borrado de eventos viejos de analytics_events (paso 3 de 3)
-- Correr con: npx supabase db query --linked -f supabase-eventos-limpieza-2026-10.sql
-- DESPUÉS de supabase-eventos-resumen-2026-10.sql con su carga inicial,
-- supabase-eventos-panel-2026-10.sql, el deploy de la web que lee los
-- resúmenes, y de mirar que el panel muestre lo mismo que antes.
-- Seguro de correr más de una vez.
-- Deja programado el borrado de todas las noches; no borra nada al correrlo
-- (ver el final para la primera limpieza).
-- ================================================================
--
-- Cuánto dura cada evento crudo (lo de más atrás queda en los resúmenes del
-- paso 1):
--
--   bots                                              3 días
--   los masivos (ver la lista en analytics_limpiar)   7 días
--   los masivos de una sesión que pasó por /descargar 30 días (la landing
--                                                     mira 7 y 30)
--   todo lo demás: registro, onboarding, push,
--   /descargar, page_view de /auth y de
--   /onboarding/recomendaciones, los poco frecuentes  60 días
--
-- Los masivos son los que mandan muchas veces por persona y que ninguna
-- función del panel lee crudos más allá de lo que resumen
-- analytics_dia_instalacion, analytics_sesion y analytics_dia_evento. En la
-- semana al 2026-10-28 eran ~165.000 de ~210.000 eventos.
--
-- En régimen, al tráfico de esa semana: ~165.000 masivos + ~20.000 de
-- sesiones de /descargar + ~200.000 de los de 60 días + ~7.000 bots, unas
-- 390.000 filas. Con los cuatro índices que se borran abajo cada fila pesa
-- ~400 bytes en vez de ~600: ~160 MB, contra 211 del 28/10, y deja de crecer
-- con el tiempo (sólo con el tráfico). Los días se cambian en el cron:
-- `SELECT public.analytics_limpiar(7, 60, 3)`.
--
-- Borrar no achica el archivo de la tabla: Postgres reusa ese lugar para los
-- eventos nuevos, así que la tabla deja de crecer pero no baja de golpe. Los
-- índices borrados sí liberan su lugar en el acto.
-- ================================================================

SET statement_timeout = '15min';


-- ── 1. Índices que ya no usa nadie ─────────────────────────────────────────
-- Medido el 2026-10-28 con pg_stat_user_indexes y el código:
--   name_created (23 MB): su único uso era lib/push-envios.ts, que ahora
--     filtra is_bot y va por analytics_events_humano_name_idx.
--   anon_created (18 MB): ninguna consulta filtra por anon_id sin is_bot.
--   humano_plataforma (16 MB): lo usaban las funciones de instalaciones de
--     la app, que ahora leen analytics_dia_instalacion.
--   user_created (7 MB): repetido de analytics_events_humano_user_idx.
-- Si algo los necesitara, se vuelven a crear (supabase-rendimiento-2026-10.sql).
DROP INDEX IF EXISTS public.analytics_events_name_created_idx;
DROP INDEX IF EXISTS public.analytics_events_anon_created_idx;
DROP INDEX IF EXISTS public.analytics_events_humano_plataforma_idx;
DROP INDEX IF EXISTS public.analytics_events_user_created_idx;

-- Para resumir y borrar los bots por fecha: el de created_at que había es
-- sólo de humanos. Los bots duran 3 días, así que éste queda chico.
-- Crearlo frena los INSERT de /api/track unos segundos (lo que tarda en
-- recorrer la tabla); por eso este archivo no hace nada largo.
CREATE INDEX IF NOT EXISTS analytics_events_bot_created_idx
  ON public.analytics_events (created_at) WHERE is_bot = true;


-- ── 2. analytics_limpiar ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.analytics_limpiar(
  p_dias_masivos integer DEFAULT 7,
  p_dias_resto   integer DEFAULT 60,
  p_dias_bots    integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
SET statement_timeout = '15min'
AS $$
DECLARE
  tz CONSTANT text := 'America/Argentina/Buenos_Aires';
  hoy date := (now() AT TIME ZONE tz)::date;
  masivos_nombres CONSTANT text[] := ARRAY[
    'page_view', 'deslizar_accion', 'media_rated', 'ad_cargado', 'media_opened',
    'ads_estado', 'app_open', 'search_performed', 'watchlist_added',
    'que_veo_hoy_accion', 'que_veo_hoy_resultado', 'recomendaciones_regeneradas'
  ];
  dias_descargar CONSTANT int := 30;
  lote CONSTANT int := 20000;
  d   date;
  n   int;
  bots int := 0;
  masivos int := 0;
  resto int := 0;
BEGIN
  -- Con menos de 3 días se podría borrar algo antes de resumirlo.
  IF p_dias_bots < 3 OR p_dias_masivos < 3 OR p_dias_resto < dias_descargar THEN
    RAISE EXCEPTION 'analytics_limpiar: bots y masivos 3 días o más; el resto, % o más', dias_descargar;
  END IF;

  -- 1. Nada se borra sin resumir: los tres últimos días se rehacen siempre
  --    (el precálculo del panel sólo rehace ayer y hoy), y un día viejo que
  --    nunca se resumió (si el cron estuvo parado), también.
  PERFORM analytics_resumir(hoy - 3, hoy);
  FOR d IN
    SELECT g::date
      FROM generate_series(
             (SELECT (min(created_at) AT TIME ZONE tz)::date FROM analytics_events),
             hoy - 4, interval '1 day') g
     WHERE NOT EXISTS (SELECT 1 FROM analytics_dia_evento c WHERE c.dia = g::date)
  LOOP
    PERFORM analytics_resumir(d, d);
  END LOOP;

  -- 2. Bots.
  LOOP
    DELETE FROM analytics_events
     WHERE ctid IN (SELECT ctid FROM analytics_events
                     WHERE is_bot = true
                       AND created_at < now() - make_interval(days => p_dias_bots)
                     LIMIT lote);
    GET DIAGNOSTICS n = ROW_COUNT;
    bots := bots + n;
    EXIT WHEN n < lote;
  END LOOP;

  -- 3. Los masivos. Los de las sesiones de /descargar, a los 30 días.
  LOOP
    DELETE FROM analytics_events
     WHERE ctid IN (SELECT e.ctid FROM analytics_events e
                     WHERE e.is_bot = false
                       AND e.name = ANY (masivos_nombres)
                       AND e.created_at < now() - make_interval(days => p_dias_masivos)
                       AND NOT (e.name = 'page_view' AND e.path IN ('/auth', '/onboarding/recomendaciones'))
                       AND (e.created_at < now() - make_interval(days => dias_descargar)
                            OR NOT EXISTS (SELECT 1 FROM analytics_events m
                                            WHERE m.session_id = e.session_id
                                              AND m.is_bot = false
                                              AND m.props->>'origen' = 'descargar'))
                     LIMIT lote);
    GET DIAGNOSTICS n = ROW_COUNT;
    masivos := masivos + n;
    EXIT WHEN n < lote;
  END LOOP;

  -- 4. Todo lo demás.
  LOOP
    DELETE FROM analytics_events
     WHERE ctid IN (SELECT ctid FROM analytics_events
                     WHERE is_bot = false
                       AND created_at < now() - make_interval(days => p_dias_resto)
                     LIMIT lote);
    GET DIAGNOSTICS n = ROW_COUNT;
    resto := resto + n;
    EXIT WHEN n < lote;
  END LOOP;

  RETURN jsonb_build_object('bots', bots, 'masivos', masivos, 'resto', resto);
END
$$;

REVOKE ALL ON FUNCTION public.analytics_limpiar(integer, integer, integer) FROM PUBLIC, anon, authenticated;


-- ── 3. Todas las noches ────────────────────────────────────────────────────
-- A las 4:15 de Argentina (7:15 UTC), entre los precálculos del panel (cada
-- 10 minutos desde el 0 y desde el 3, y el lento a los 7).
SELECT cron.unschedule('glynbox-eventos-limpiar')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'glynbox-eventos-limpiar');
SELECT cron.schedule('glynbox-eventos-limpiar', '15 7 * * *',
                     $$SELECT public.analytics_limpiar(7, 60, 3)$$);

-- La primera limpieza no va acá: si corriera en la misma transacción que los
-- índices de arriba, frenaría los INSERT hasta terminar. La hace el cron a la
-- noche, o se corre aparte:
--   npx supabase db query --linked "SELECT public.analytics_limpiar(7, 60, 3)"
