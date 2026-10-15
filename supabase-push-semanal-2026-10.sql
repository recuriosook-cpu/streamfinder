-- ================================================================
-- GLYNBOX — "Tu resumen semanal" (push de los viernes)
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez. Requiere supabase-push-envios-2026-10.sql.
-- ================================================================
--
-- La semanal la arma `lib/resumen-semanal.ts` para cada persona. Deja:
--
--   · Una fila en `push_envios` por corrida, con `tipo = 'semanal'`: cuántos
--     aparatos, cuántos aceptó Expo, cuántos fallaron. Como cada uno recibe un
--     título distinto, la fila de una corrida real no tiene `media_type` ni
--     `tmdb_id`. Las pruebas del panel sí (son de una sola persona).
--   · Una fila en `push_semanal_enviados` por persona y título, que es lo que
--     impide mandarle el mismo título dos veces. Las pruebas no dejan fila.
--
-- Los interruptores de la app ("Recomendaciones de Ferlage" y "Tu resumen
-- semanal") NO necesitan nada acá: son las claves `recomendaciones_ferlage` y
-- `resumen_semanal` de `profiles.notification_preferences`. La que falta vale
-- prendida.
--
-- ================================================================

BEGIN;

ALTER TABLE public.push_envios DROP CONSTRAINT IF EXISTS push_envios_tipo_check;
ALTER TABLE public.push_envios
  ADD CONSTRAINT push_envios_tipo_check CHECK (tipo IN ('recomendacion', 'semanal'));

ALTER TABLE public.push_envios ALTER COLUMN media_type DROP NOT NULL;
ALTER TABLE public.push_envios ALTER COLUMN tmdb_id    DROP NOT NULL;

CREATE INDEX IF NOT EXISTS push_envios_tipo_creado_idx
  ON public.push_envios (tipo, creado_en DESC);

CREATE TABLE IF NOT EXISTS public.push_semanal_enviados (
  id          BIGSERIAL PRIMARY KEY,
  envio_id    BIGINT REFERENCES public.push_envios(id) ON DELETE SET NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id     INTEGER NOT NULL,
  motivo      TEXT NOT NULL CHECK (motivo IN ('watchlist', 'estreno')),
  plataforma  TEXT NOT NULL,
  cuerpo      TEXT NOT NULL,      -- el texto que le llegó
  aparatos    INTEGER NOT NULL DEFAULT 0,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, media_type, tmdb_id)
);

CREATE INDEX IF NOT EXISTS push_semanal_enviados_envio_idx
  ON public.push_semanal_enviados (envio_id);

-- Cerrada para todos menos la service role, como push_envios.
ALTER TABLE public.push_semanal_enviados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_semanal_enviados FROM anon, authenticated;

COMMIT;

-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura)
-- ----------------------------------------------------------------

SELECT pg_get_constraintdef(oid) AS tipo_check
  FROM pg_constraint
 WHERE conname = 'push_envios_tipo_check';

SELECT count(*) AS filas_semanal FROM public.push_semanal_enviados;
