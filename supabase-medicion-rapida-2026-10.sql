-- ================================================================
-- GLYNBOX — "Desde cuándo se mide", sin recorrer la tabla
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez. No borra ni cambia datos.
-- ================================================================
--
-- El 23/10 el resumen del panel decía "Falta correr
-- supabase-analytics-resumen.sql" con todo creado: la vista
-- `analytics_medicion` recorre `analytics_events` entera y se cortaba por
-- tiempo. El panel ya no la usa para eso (`lib/analytics-medicion.ts`): pide
-- el primer evento humano, y este índice hace que esa consulta sea
-- instantánea en vez de leer la tabla.
--
-- CONCURRENTLY: se arma sin frenar los eventos que entran mientras tanto. Por
-- eso va solo en el archivo (no puede ir dentro de una transacción).
-- ================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS analytics_events_humano_created_idx
  ON public.analytics_events (created_at)
  WHERE is_bot = false;

-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura): tiene que decir true.
--   SELECT indisvalid FROM pg_index
--    WHERE indexrelid = 'public.analytics_events_humano_created_idx'::regclass;
-- Si dice false (el armado se cortó), borralo y volvé a correr este archivo:
--   DROP INDEX CONCURRENTLY public.analytics_events_humano_created_idx;
-- ----------------------------------------------------------------
