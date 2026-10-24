-- ================================================================
-- GLYNBOX — El navegador automatizado del 23/10, marcado como bot
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez. No borra eventos: los marca.
-- ================================================================
--
-- Desde las 18 UTC del 23/10 entró un Chrome de Linux de escritorio
-- (`X11; Linux x86_64 … Chrome/155.0.0.0`) desde IPs residenciales de EE.UU.,
-- Alemania, Francia, Reino Unido y Singapur: pasa el Challenge, ejecuta JS y
-- por cada navegador nuevo manda `page_view` + `app_open` desde una ficha.
-- Fueron ~5.500 "navegadores sin sesión" en una tarde (el día anterior, 339).
--
-- Desde el deploy de este commit, `/api/track` ya los marca solo
-- (`motivoLinuxDeAfuera` en lib/analytics-bots.ts). Esto marca lo que entró
-- antes. Como `analytics_events` no guarda el user-agent, se usa la huella:
-- navegador web sin sesión, de esos países, que sólo mandó eventos de entrada.
-- Medido el 23/10: 5.551 navegadores así y sólo 3 de esos países que hicieron
-- algo más (ésos quedan como personas).
-- ================================================================

-- Para mirar antes (no cambia nada): cuántos navegadores y eventos marcaría.
--
--   WITH nav AS (
--     SELECT anon_id
--       FROM public.analytics_events
--      WHERE platform = 'web' AND is_bot = false
--        AND created_at >= '2026-10-23 18:00+00'
--      GROUP BY anon_id
--     HAVING bool_and(user_id IS NULL)
--        AND bool_and(name IN ('page_view', 'app_open', 'app_banner_shown'))
--        AND min(country) IN ('US', 'GB', 'FR', 'DE', 'SG', 'NL', 'HK')
--        AND max(country) IN ('US', 'GB', 'FR', 'DE', 'SG', 'NL', 'HK')
--   )
--   SELECT count(*) FROM nav;

WITH nav AS (
  SELECT anon_id
    FROM public.analytics_events
   WHERE platform = 'web' AND is_bot = false
     AND created_at >= '2026-10-23 18:00+00'
   GROUP BY anon_id
  HAVING bool_and(user_id IS NULL)
     AND bool_and(name IN ('page_view', 'app_open', 'app_banner_shown'))
     AND min(country) IN ('US', 'GB', 'FR', 'DE', 'SG', 'NL', 'HK')
     AND max(country) IN ('US', 'GB', 'FR', 'DE', 'SG', 'NL', 'HK')
)
UPDATE public.analytics_events e
   SET is_bot = true,
       bot_reason = 'linux-de-afuera-retro:' || e.country
  FROM nav
 WHERE e.anon_id = nav.anon_id
   AND e.platform = 'web'
   AND e.is_bot = false
   AND e.created_at >= '2026-10-23 18:00+00';

-- El resumen del panel, ya sin ellos.
SELECT public.admin_panel_precalcular('rapido');


-- ----------------------------------------------------------------
-- VERIFICAR / VOLVER ATRÁS
-- ----------------------------------------------------------------
--   SELECT bot_reason, count(*) FROM public.analytics_events
--    WHERE bot_reason LIKE 'linux-de-afuera%' GROUP BY 1 ORDER BY 2 DESC;
--
--   UPDATE public.analytics_events SET is_bot = false, bot_reason = NULL
--    WHERE bot_reason LIKE 'linux-de-afuera-retro:%';
