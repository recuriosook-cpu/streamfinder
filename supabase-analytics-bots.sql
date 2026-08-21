-- ================================================================
-- GLYNBOX — Marcado de bots en analytics_events
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez.
-- ================================================================
--
-- Contexto, para que dentro de seis meses se entienda por qué existe esto:
--
-- Las primeras 25 horas de medición dejaron 3086 eventos en 3083 sesiones.
-- De esos, sólo 16 eventos (14 sesiones, 3 usuarios) tenían `user_id`. El
-- 99,5% del tráfico registrado eran crawlers renderizando JavaScript —
-- Googlebot y compañía ejecutan JS, así que llegan hasta el `track()` y
-- disparan `app_open` como si fueran gente.
--
-- Cada render de un crawler es un contexto nuevo, con localStorage y
-- sessionStorage limpios, así que inventa un `anon_id` y un `session_id`
-- nuevos cada vez. Por eso la tabla parecía tener una sesión por evento.
--
-- A partir de acá `/api/track` clasifica el user-agent y marca. NO descarta:
-- ver el comentario largo en `lib/analytics-bots.ts`. En una frase: marcar mal
-- se arregla con un UPDATE, descartar mal no se arregla nunca.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. COLUMNAS
-- ----------------------------------------------------------------

-- DEFAULT false y NOT NULL: las filas viejas quedan todas en `false` y el paso
-- 3 se encarga de corregirlas. Preferimos ese orden —agregar barato, corregir
-- después— antes que un DEFAULT true que dejaría a los 16 humanos mal marcados
-- si el backfill se olvida de correr.
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS is_bot BOOLEAN NOT NULL DEFAULT false;

-- Qué patrón matcheó ('googlebot', 'generico', 'sin-user-agent', ...).
-- Es lo que permite auditar el filtro: si mañana desaparece el tráfico de algún
-- país, se puede mirar qué se estuvo marcando y por qué, en vez de adivinar.
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS bot_reason TEXT;

-- ----------------------------------------------------------------
-- 2. ÍNDICES
-- ----------------------------------------------------------------
-- Todas las consultas del panel llevan `is_bot = false` pegado. Los índices
-- parciales sobre esa condición son mucho más chicos que el índice completo,
-- porque hoy dejan afuera el 99,5% de las filas.

-- "qué hizo este usuario, sin bots" — el cálculo de tiempo de actividad
CREATE INDEX IF NOT EXISTS analytics_events_humano_user_idx
  ON public.analytics_events (user_id, created_at DESC)
  WHERE is_bot = false AND user_id IS NOT NULL;

-- "cuántos X hubo, sin bots" — embudo y métricas por evento
CREATE INDEX IF NOT EXISTS analytics_events_humano_name_idx
  ON public.analytics_events (name, created_at DESC)
  WHERE is_bot = false;

-- "las sesiones de este usuario" — agrupar por session_id sin escanear bots
CREATE INDEX IF NOT EXISTS analytics_events_humano_session_idx
  ON public.analytics_events (session_id, created_at)
  WHERE is_bot = false;

-- ----------------------------------------------------------------
-- 3. BACKFILL DE LOS EVENTOS QUE YA ESTÁN
-- ----------------------------------------------------------------
--
-- Problema: las filas viejas NO tienen user-agent guardado, así que no se
-- pueden clasificar con el mismo criterio que las nuevas. Hay que usar una
-- señal indirecta.
--
-- La señal es `user_id`. Un crawler no tiene cuenta, no se loguea y nunca va a
-- tener un `user_id`. Una persona logueada, sí. Y como Supabase Auth guarda la
-- sesión en localStorage, que un evento traiga `user_id` prueba además que el
-- storage de ese navegador funciona: no es un contexto efímero.
--
-- Se preserva por `anon_id`, no por fila. Si un navegador tuvo AL MENOS UN
-- evento con `user_id`, se salvan TODOS sus eventos — incluidos los anónimos de
-- antes de loguearse, que son justamente los del embudo de registro que
-- queremos poder medir. Preservar sólo las 16 filas con `user_id` tiraría esa
-- parte.
--
-- Sesgo conocido y aceptado: un visitante humano que nunca se logueó queda
-- marcado como bot. Con 3086 eventos y 3 usuarios no hay forma de distinguirlo,
-- y el error cae del lado seguro — subcontar humanos es preferible a inflar las
-- métricas con crawlers. Sólo afecta a lo que ya está: de acá en adelante se
-- clasifica por user-agent.

-- 3a. MIRAR ANTES DE TOCAR. Correr esto solo y leer el resultado.
SELECT
  count(*)                                            AS total,
  count(*) FILTER (WHERE user_id IS NOT NULL)         AS con_user_id,
  count(DISTINCT anon_id) FILTER (WHERE user_id IS NOT NULL)
                                                      AS navegadores_humanos,
  count(*) FILTER (WHERE anon_id IN (
    SELECT DISTINCT anon_id FROM public.analytics_events WHERE user_id IS NOT NULL
  ))                                                  AS se_preservan,
  count(*) FILTER (WHERE anon_id NOT IN (
    SELECT DISTINCT anon_id FROM public.analytics_events WHERE user_id IS NOT NULL
  ))                                                  AS se_marcan_bot
FROM public.analytics_events;

-- 3b. EL UPDATE. Correr recién después de mirar 3a.
--
-- `created_at < now()` no hace falta: esto se corre una vez, antes de que el
-- deploy nuevo empiece a escribir. Si llegara a correrse después, las filas
-- nuevas ya tienen bot_reason y el WHERE de abajo las excluye.
UPDATE public.analytics_events
   SET is_bot     = true,
       bot_reason = 'backfill-sin-user-agent'
 WHERE bot_reason IS NULL
   AND is_bot = false
   AND anon_id NOT IN (
     SELECT DISTINCT anon_id
       FROM public.analytics_events
      WHERE user_id IS NOT NULL
   );

-- 3c. VERIFICAR. Tienen que quedar ~16 eventos humanos y ~3070 bots.
SELECT is_bot, bot_reason, count(*) AS eventos,
       count(DISTINCT session_id) AS sesiones,
       count(DISTINCT anon_id)    AS navegadores
  FROM public.analytics_events
 GROUP BY is_bot, bot_reason
 ORDER BY is_bot, eventos DESC;

-- ----------------------------------------------------------------
-- 4. NO BORRAR
-- ----------------------------------------------------------------
-- La tentación es `DELETE FROM analytics_events WHERE is_bot`. No lo hagas:
-- 3070 filas no pesan nada, los índices parciales ya las ignoran, y saber
-- cuánto crawler nos entra es información útil por sí sola —es la respuesta a
-- "¿nos está indexando Google?" sin abrir Search Console.
--
-- Si algún día pesan de verdad, el borrado por retención es:
--   DELETE FROM public.analytics_events
--    WHERE is_bot = true AND created_at < now() - interval '90 days';
