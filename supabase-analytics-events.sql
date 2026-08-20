-- ================================================================
-- GLYNBOX — Tabla de eventos de analytics
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez.
-- ================================================================
--
-- Es la primera medición propia del proyecto. Hasta ahora sólo existían
-- `profiles.last_active` (un timestamp que se sobrescribe, no sirve para
-- reconstruir nada) y `watch_history` (visitas a fichas, sólo de /movie/[id]).
--
-- Nota sobre RLS: el rol `anon` puede INSERTAR pero NO puede leer. Es a
-- propósito. Los eventos son datos de comportamiento de gente real; si se
-- pudieran leer desde el navegador, cualquiera con la anon key —que viaja en el
-- bundle— podría descargarse la actividad de todos los usuarios.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. TABLA
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- NULL cuando el evento es anónimo (nadie logueado todavía). Sin FK a
  -- auth.users a propósito: si mañana se borra una cuenta, no queremos que el
  -- borrado falle ni que se lleve puesto el histórico de eventos. El día que
  -- haga falta anonimizar, es un UPDATE ... SET user_id = NULL.
  user_id    UUID,

  -- Identificador del navegador, persistente en localStorage. Es lo que permite
  -- unir lo que hizo alguien ANTES de registrarse con lo que hizo después: sin
  -- esto no hay forma de medir el embudo de registro, porque el user_id recién
  -- existe cuando el embudo ya terminó.
  anon_id    TEXT        NOT NULL,

  -- Una sesión = una pestaña, o 30 minutos de inactividad.
  session_id TEXT        NOT NULL,

  name       TEXT        NOT NULL,
  props      JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- 'web' | 'mobile'. La app nativa se instrumenta en la v5; por ahora entra
  -- todo como 'web', pero la columna ya está para no tener que migrar después.
  platform   TEXT        NOT NULL DEFAULT 'web',

  -- La ruta donde ocurrió, ya sin querystring (ver el sanitizador del cliente:
  -- un ?q= o un ?token= no tienen por qué quedar guardados).
  path       TEXT
);

-- Defensa de último recurso contra basura. El endpoint ya valida contra una
-- lista blanca, pero si alguien algún día inserta con la service role saltéandolo,
-- estos CHECK evitan que la tabla se ensucie igual.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analytics_events_platform_check'
  ) THEN
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_platform_check
      CHECK (platform IN ('web', 'mobile'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'analytics_events_name_check'
  ) THEN
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_name_check
      CHECK (name <> '' AND length(name) <= 64);
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. ÍNDICES
-- ----------------------------------------------------------------
-- Los tres están pensados para las consultas que vamos a hacer, y todos van
-- DESC en created_at porque siempre se mira hacia atrás desde hoy.

-- "cuántos signup_started hubo en los últimos 30 días"
CREATE INDEX IF NOT EXISTS analytics_events_name_created_idx
  ON public.analytics_events (name, created_at DESC);

-- "qué hizo este usuario, en orden" — retención D1/D3/D7
CREATE INDEX IF NOT EXISTS analytics_events_user_created_idx
  ON public.analytics_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;   -- parcial: los anónimos no se buscan por acá

-- "qué hizo este navegador" — el embudo de registro, que arranca sin user_id
CREATE INDEX IF NOT EXISTS analytics_events_anon_created_idx
  ON public.analytics_events (anon_id, created_at DESC);

-- ----------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Este Postgres no soporta CREATE POLICY IF NOT EXISTS, así que DROP + CREATE.
-- Es idempotente igual y no depende de la versión.
DROP POLICY IF EXISTS "analytics_insert_anon"          ON public.analytics_events;
DROP POLICY IF EXISTS "analytics_insert_authenticated" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics_no_select"            ON public.analytics_events;

-- INSERT: abierto a los dos roles del navegador.
-- El WITH CHECK (true) es intencional: el endpoint /api/track ya filtra por
-- lista blanca de nombres, corta props de más de 2KB y sanitiza. Duplicar esas
-- reglas en SQL sería mantener la misma validación en dos lugares.
CREATE POLICY "analytics_insert_anon"
  ON public.analytics_events FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "analytics_insert_authenticated"
  ON public.analytics_events FOR INSERT TO authenticated
  WITH CHECK (true);

-- SELECT: nadie.
--
-- No hay ninguna policy de SELECT, y con RLS activo eso ya significa "nadie
-- lee". La política de abajo es explícita para que quede escrito en el schema y
-- nadie la agregue "por las dudas" más adelante.
--
-- La service role NO pasa por RLS —la saltea por diseño—, así que el panel de
-- admin va a poder leer todo con normalidad. Este bloqueo es sólo contra la
-- anon key, que viaja en el bundle del navegador.
CREATE POLICY "analytics_no_select"
  ON public.analytics_events FOR SELECT
  USING (false);

-- Sin policies de UPDATE ni DELETE: los eventos son inmutables. Sólo la service
-- role puede tocarlos (para el borrado por retención, si algún día hace falta).

-- ----------------------------------------------------------------
-- 4. VERIFICAR
-- ----------------------------------------------------------------
-- Correr a mano después de aplicar:
--
--   SELECT policyname, cmd, roles FROM pg_policies
--    WHERE tablename = 'analytics_events';
--
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'analytics_events';
--
-- Y para confirmar que anon NO puede leer (tiene que devolver 0 filas o error):
--   curl "$SUPABASE_URL/rest/v1/analytics_events?select=*&limit=1" \
--        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
