-- ================================================================
-- GLYNBOX — Idioma de cada usuario
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez. No borra ni cambia datos existentes.
-- ================================================================
--
-- Desde la app 1.0.16 hay versión en inglés. La app decide el idioma (el del
-- teléfono, o el que se elija en Ajustes) y lo guarda acá, porque las
-- notificaciones las escribe el servidor y tiene que saber en qué idioma
-- mandárselas a cada uno: las push, la bandeja, "Ferlage te recomienda ver" y
-- "Tu resumen semanal".
--
--   NULL -> nunca lo dijo (versiones anteriores de la app, o la web). Cuenta
--           como español, que es lo que todos recibían hasta ahora.
--   'es' -> español.
--   'en' -> inglés.
--
-- El código tolera que esto todavía no se haya corrido: si la columna no
-- existe, todos reciben en español, como hasta ahora.
-- ================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS idioma TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_idioma_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_idioma_check
      CHECK (idioma IS NULL OR idioma IN ('es', 'en'));
  END IF;
END $$;

-- `profiles` tiene permisos de lectura por columna desde
-- supabase-profiles-columnas-2026-09.sql: una columna nueva no la lee nadie
-- hasta darle GRANT. La app la lee para mostrarla en Ajustes en un teléfono
-- nuevo. No es pública: anon no la necesita.
--
-- Escribirla no necesita GRANT: UPDATE sigue a nivel tabla, y la política de
-- RLS deja tocar sólo la fila propia.
GRANT SELECT (idioma) ON public.profiles TO authenticated;

-- PostgREST cachea el esquema: sin esto la columna nueva puede tardar en
-- verse desde la API.
NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- VERIFICAR (cuando la 1.0.16 esté en uso):
-- ----------------------------------------------------------------
--
--   SELECT idioma, count(*) FROM public.profiles GROUP BY 1 ORDER BY 2 DESC;
