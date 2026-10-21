-- ================================================================
-- GLYNBOX — Completar profiles.country con el país de los eventos
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez.
-- ================================================================
--
-- La detección del país del perfil (`/api/perfil/pais`) corría sólo desde la
-- web, y casi todos usan la app: el 2026-10-21 había país en 22 de 970
-- perfiles. Pero `/api/track` guarda el país de cada evento desde el
-- 2026-10 (`analytics_events.country`, del encabezado de Vercel), también los
-- de la app. Esto le pone a cada perfil el país de su evento más reciente.
--
-- Reglas, las mismas de `/api/perfil/pais`:
--   · Un país elegido a mano en Ajustes (`country_source = 'manual'`) no se
--     toca nunca.
--   · Lo que se escribe queda como 'auto'.
--   · Sólo eventos de personas (`is_bot = false`) con país.
--
-- `analytics_events.user_id` lo manda el cliente sin verificar (ver
-- `/api/track`). Para un dato de métricas alcanza; por eso desde ahora la
-- detección en vivo de la app va por rutas con sesión verificada, no por acá.
--
-- Simulado contra producción el 2026-10-21: completa 486 perfiles (quedan 508
-- con país) y no cambia ninguno de los 22 que ya tenían.
-- ================================================================

WITH ultimo AS (
  SELECT DISTINCT ON (user_id) user_id, country
    FROM public.analytics_events
   WHERE user_id IS NOT NULL
     AND country IS NOT NULL
     AND is_bot = false
   ORDER BY user_id, created_at DESC
)
UPDATE public.profiles p
   SET country = u.country,
       country_source = 'auto'
  FROM ultimo u
 WHERE p.id = u.user_id
   AND (p.country_source IS NULL OR p.country_source = 'auto')
   AND (p.country IS DISTINCT FROM u.country OR p.country_source IS NULL);

-- ----------------------------------------------------------------
-- VERIFICAR:
-- ----------------------------------------------------------------
--
--   SELECT country_source, count(*) FROM public.profiles GROUP BY 1;
--
--   SELECT country, count(*) FROM public.profiles
--    WHERE country_source IS NOT NULL
--    GROUP BY 1 ORDER BY 2 DESC;
