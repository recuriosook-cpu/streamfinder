-- ================================================================
-- GLYNBOX — Marcar como bot el tráfico de China del 13/10/2026
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor
-- NO borra nada: sólo pone is_bot = true. Se deshace con el paso 3.
-- ================================================================
--
-- Qué pasó: el 13/10 el panel mostró 3.434 visitantes anónimos y 3.461
-- sesiones de unos 3 segundos. Eran bots desde China (y Oculus Networks, ASN
-- 398781) con user-agents de navegador normales, así que `classifyUserAgent`
-- no los marcó. A las 14:15 UTC se bloquearon en el firewall de Vercel.
--
-- Problema: `analytics_events` no guardaba país, IP ni user-agent, así que no
-- hay forma de saber de dónde vino cada evento viejo. El criterio es por
-- comportamiento, y por eso se mira primero (paso 1) antes de escribir:
--
--   - sesión que empezó hoy (hora de Buenos Aires, como el panel) y antes de
--     las 14:15 UTC, cuando entró el bloqueo;
--   - nunca tuvo sesión iniciada (ningún evento con user_id);
--   - duró 3 segundos o menos entre el primer y el último evento;
--   - su anon_id no aparece NUNCA con un user_id, ningún día: un navegador
--     que alguna vez se logueó es de una persona.
--
-- Riesgo conocido: un visitante real, sin cuenta, que entró hoy antes de las
-- 14:15 UTC y se fue en 3 segundos también queda marcado. El paso 1 compara
-- contra el mismo criterio después de las 14:15 para medir ese margen.
--
-- Desde el deploy de `lib/geo.ts`, `/api/track` guarda el país y marca solo
-- lo que llegue de un país bloqueado. Esto es sólo para lo de hoy.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. VISTA PREVIA (solo lectura). Correr esto primero.
-- ----------------------------------------------------------------
-- La fila 'antes 14:15' es lo que se va a marcar. La fila 'despues 14:15' es
-- el mismo criterio sobre tráfico que ya pasó por el bloqueo: es el ruido de
-- fondo de visitantes reales que cumplen el criterio, y da una idea de cuántos
-- humanos se marcarían por error.

WITH candidatas AS (
  SELECT session_id, min(created_at) AS inicio, count(*) AS eventos,
         count(DISTINCT anon_id) AS anon_ids
  FROM public.analytics_events
  WHERE is_bot = false
    AND created_at >= timestamptz '2026-10-13 00:00:00-03'
    AND created_at <  timestamptz '2026-10-14 00:00:00-03'
  GROUP BY session_id
  HAVING bool_and(user_id IS NULL)
     AND extract(epoch FROM max(created_at) - min(created_at)) <= 3
     AND NOT bool_or(anon_id IN (
       SELECT DISTINCT anon_id FROM public.analytics_events WHERE user_id IS NOT NULL
     ))
)
SELECT CASE WHEN inicio < timestamptz '2026-10-13 14:15:00+00'
            THEN 'antes 14:15' ELSE 'despues 14:15' END AS franja,
       count(*)      AS sesiones,
       sum(anon_ids) AS anon_ids,
       sum(eventos)  AS eventos
FROM candidatas
GROUP BY 1 ORDER BY 1;

-- ----------------------------------------------------------------
-- 2. MARCAR. Sólo si el paso 1 dio lo esperado (≈3.400 sesiones antes).
-- ----------------------------------------------------------------

WITH candidatas AS (
  SELECT session_id
  FROM public.analytics_events
  WHERE is_bot = false
    AND created_at >= timestamptz '2026-10-13 00:00:00-03'
    AND created_at <  timestamptz '2026-10-14 00:00:00-03'
  GROUP BY session_id
  HAVING min(created_at) < timestamptz '2026-10-13 14:15:00+00'
     AND bool_and(user_id IS NULL)
     AND extract(epoch FROM max(created_at) - min(created_at)) <= 3
     AND NOT bool_or(anon_id IN (
       SELECT DISTINCT anon_id FROM public.analytics_events WHERE user_id IS NOT NULL
     ))
)
UPDATE public.analytics_events e
   SET is_bot = true,
       bot_reason = 'backfill-cn-2026-10-13'
  FROM candidatas c
 WHERE e.session_id = c.session_id
   AND e.is_bot = false
   AND e.created_at >= timestamptz '2026-10-13 00:00:00-03'
   AND e.created_at <  timestamptz '2026-10-14 00:00:00-03';

-- ----------------------------------------------------------------
-- 3. DESHACER (por si hace falta)
-- ----------------------------------------------------------------
--
--   UPDATE public.analytics_events
--      SET is_bot = false, bot_reason = NULL
--    WHERE bot_reason = 'backfill-cn-2026-10-13';
