-- ================================================================
-- GLYNBOX — Marcar como bot las ráfagas de visitas sueltas desde afuera
-- Correr con: npx supabase db query --remote=<ref> --yes -f supabase-rafagas-bots-2026-11.sql
-- Seguro de correr más de una vez.
-- ================================================================
--
-- El 19/11 a las 20:55 (Buenos Aires) arrancó un robot que, hasta que se lo
-- bloqueó en el firewall de Vercel el 20/11 a las 18:55, mandó unas 350
-- visitas por hora: 6.803 sesiones, 13.606 eventos. Cada visita era:
--
--   - un navegador NUEVO (anon_id que no vuelve a aparecer),
--   - sin sesión iniciada, web, computadora,
--   - exactamente page_view + app_open, en 0 segundos,
--   - una ficha suelta (/movie, /actor, /director, /tv, /en/...),
--   - desde EE.UU. (6.390 el 20/11) y Hong Kong (242).
--
-- El user-agent era el de un Chrome normal, así que el filtro de
-- `lib/analytics-bots.ts` no lo veía, y una regla por navegador ("muchas
-- visitas del mismo anon_id") tampoco: cada visita era un navegador distinto.
-- Lo que sí lo delata es el VOLUMEN: en días normales ese tipo de sesión
-- (anónima, de computadora, 1 o 2 eventos de entrada, 5 s o menos) llega de
-- 0 a 30 veces POR DÍA, sumando todos los países, y nunca más de 3 en una
-- hora desde un mismo país de afuera (semana del 13 al 19/11); el robot
-- mandaba 350 por hora desde EE.UU. y ~12 desde Hong Kong.
--
-- La regla: si en una hora llegan más de 10 de esas sesiones desde un mismo
-- país de fuera de la región, todas las de esa hora y ese país se marcan
-- `is_bot = true`, `bot_reason = 'rafaga:<país>'`. Marcar, no borrar (ver
-- `lib/analytics-bots.ts`): si un día atrapa gente real, es un UPDATE.
--
-- Por qué 10: probado contra la semana del 13 al 20/11, con 5, 8, 10, 15 y
-- 20 no marca ninguna sesión antes del ataque; con 10 atrapa 6.771 de las
-- 6.803 del robot (con 30 se le escapaban Hong Kong y las primeras horas).
--
-- Corre a las :05 de cada hora, antes del precálculo `rapido` del panel
-- (:10), que rehace ayer y hoy: lo que se marca sale del panel en esa misma
-- pasada. Mira las últimas 3 horas, así que una hora que quedó a la mitad
-- se vuelve a evaluar entera en la pasada siguiente.
--
-- La lista de países de la región es la misma que `REGION_PROPIA` en
-- `lib/analytics-bots.ts`: si cambia allá, cambiarla acá.
-- ================================================================

CREATE OR REPLACE FUNCTION public.analytics_marcar_rafagas(
  p_horas  integer DEFAULT 3,
  p_umbral integer DEFAULT 10
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marcados integer;
BEGIN
  WITH ses AS (
    SELECT session_id,
           min(country)    AS pais,
           min(created_at) AS inicio
    FROM public.analytics_events
    WHERE is_bot = false
      AND created_at >= date_trunc('hour', now()) - make_interval(hours => p_horas)
    GROUP BY session_id
    HAVING bool_and(user_id IS NULL)
       AND bool_and(platform = 'web')
       AND bool_and(props->>'aparato' = 'computadora')
       AND bool_and(name IN ('page_view', 'app_open'))
       AND count(*) <= 2
       AND extract(epoch FROM max(created_at) - min(created_at)) <= 5
       AND count(DISTINCT country) = 1
       AND min(country) IS NOT NULL
       AND min(country) <> ALL (ARRAY[
         'AR','BO','BR','CL','CO','CR','CU','EC','SV','GT','HN','MX','NI',
         'PA','PY','PE','DO','UY','VE','PR','AG','BS','BB','BZ','GF','GY',
         'TC','JM','LC','TT','ES'
       ])
  ),
  rafagas AS (
    SELECT pais, date_trunc('hour', inicio) AS hora
    FROM ses
    GROUP BY 1, 2
    HAVING count(*) > p_umbral
  ),
  marcadas AS (
    SELECT s.session_id, s.pais
    FROM ses s
    JOIN rafagas r ON r.pais = s.pais AND r.hora = date_trunc('hour', s.inicio)
  ),
  upd AS (
    UPDATE public.analytics_events e
    SET is_bot = true,
        bot_reason = 'rafaga:' || m.pais
    FROM marcadas m
    WHERE e.session_id = m.session_id
      AND e.is_bot = false
      AND e.created_at >= date_trunc('hour', now()) - make_interval(hours => p_horas)
    RETURNING 1
  )
  SELECT count(*) INTO v_marcados FROM upd;

  RETURN v_marcados;
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_marcar_rafagas(integer, integer) FROM PUBLIC, anon, authenticated;

-- A las :05, antes de glynbox-panel-rapido (:10).
SELECT cron.unschedule('glynbox-eventos-rafagas')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'glynbox-eventos-rafagas');

SELECT cron.schedule(
  'glynbox-eventos-rafagas',
  '5 * * * *',
  'SELECT public.analytics_marcar_rafagas(3, 10)'
);
