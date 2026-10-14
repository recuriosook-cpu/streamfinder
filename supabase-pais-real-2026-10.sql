-- ================================================================
-- GLYNBOX — País real: en los eventos y en el perfil
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez. No borra ni cambia datos existentes.
-- ================================================================
--
-- Hasta acá el país no se detectaba de verdad: `CountryContext` le preguntaba
-- a ipapi.co desde el navegador sólo en la primera visita, y si eso no andaba
-- quedaba 'AR'. Todos los perfiles terminaron en 'AR'.
--
-- Desde ahora el país sale del encabezado `x-vercel-ip-country`, que Vercel
-- calcula de la IP antes de que el pedido llegue a la función. Se usa en dos
-- lugares:
--
--   1. `/api/track` lo guarda en cada evento (`analytics_events.country`), y
--      marca como bot lo que llegue de un país bloqueado en el firewall.
--   2. `/api/perfil/pais` lo guarda en el perfil cuando hay sesión, salvo que
--      la persona lo haya elegido a mano en Ajustes.
--
-- El código tolera que esto todavía no se haya corrido: si las columnas no
-- existen, los eventos y el perfil se guardan como antes, sin país.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. EVENTOS
-- ----------------------------------------------------------------

-- Código ISO de dos letras, o NULL si Vercel no lo mandó (local, previews
-- raros) o si el evento es de antes de esta migración. Se guarda aunque el
-- evento sea de un bot: es justamente lo que permite auditar el filtro.
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS country TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analytics_events_country_check'
  ) THEN
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_country_check
      CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. PERFILES
-- ----------------------------------------------------------------

-- De dónde salió `profiles.country`. Tres estados:
--
--   NULL     -> de antes de esta migración. Es el 'AR' por defecto o una
--               detección vieja del navegador: no se puede leer como dato.
--   'auto'   -> detectado por la IP en el último ingreso.
--   'manual' -> elegido por la persona. La detección no lo pisa nunca más.
--
-- El panel cuenta sólo 'auto' y 'manual' en "Usuarios por país".
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_source TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_country_source_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_country_source_check
      CHECK (country_source IS NULL OR country_source IN ('auto', 'manual'));
  END IF;
END $$;

-- PostgREST cachea el esquema: sin esto las columnas nuevas pueden tardar en
-- verse desde la API.
NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- VERIFICAR, después del deploy y de entrar una vez al sitio:
-- ----------------------------------------------------------------
--
--   SELECT country, count(*) FROM public.analytics_events
--    WHERE created_at > now() - interval '1 hour'
--    GROUP BY 1 ORDER BY 2 DESC;
--
--   SELECT country, country_source, count(*) FROM public.profiles
--    GROUP BY 1, 2 ORDER BY 3 DESC;
