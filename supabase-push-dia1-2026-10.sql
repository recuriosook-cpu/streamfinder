-- ================================================================
-- GLYNBOX — "Para esta noche", la push del día 1
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez. Requiere supabase-push-semanal-2026-10.sql.
-- ================================================================
--
-- La arma `lib/push-dia1.ts`: a cada cuenta nueva, el día siguiente de
-- registrarse, a las 20 de su país, una recomendación de algo que calificó
-- alto que esté en sus plataformas. Esto hace tres cosas:
--
--   1. Deja guardar `tipo = 'dia1'` en `push_envios` (una fila por corrida
--      que mandó algo, y una por cada prueba del panel).
--   2. Crea `push_dia1_enviados`: una fila por persona, única, que es lo que
--      impide que le llegue dos veces. También cuenta para el límite de 3
--      notificaciones por semana.
--   3. Programa la corrida cada hora con pg_cron. Hace falta porque el plan de
--      Vercel sólo deja crons diarios, y "a las 20 de cada país" necesita
--      mirar cada hora. pg_cron llama a /api/cron/push-dia1 con el mismo
--      CRON_SECRET que usan los crons de Vercel.
--
-- ANTES DE CORRERLO: reemplazá PEGAR_ACA_EL_CRON_SECRET (más abajo, en el
-- paso 3) por el valor de CRON_SECRET de Vercel (Project > Settings >
-- Environment Variables). Queda guardado cifrado en Supabase Vault, no en el
-- texto del cron.
-- ================================================================


-- ── 1 y 2. Las tablas ──────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.push_envios DROP CONSTRAINT IF EXISTS push_envios_tipo_check;
ALTER TABLE public.push_envios
  ADD CONSTRAINT push_envios_tipo_check CHECK (tipo IN ('recomendacion', 'semanal', 'dia1'));

CREATE TABLE IF NOT EXISTS public.push_dia1_enviados (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  envio_id    BIGINT REFERENCES public.push_envios(id) ON DELETE SET NULL,
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id     INTEGER NOT NULL,
  por_titulo  TEXT NOT NULL,      -- el que calificó alto ("Porque te gustó …")
  plataforma  TEXT NOT NULL,
  cuerpo      TEXT NOT NULL,      -- el texto que le llegó
  aparatos    INTEGER NOT NULL DEFAULT 0,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_dia1_enviados_creado_idx
  ON public.push_dia1_enviados (creado_en DESC);

-- Cerrada para todos menos la service role, como push_envios.
ALTER TABLE public.push_dia1_enviados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_dia1_enviados FROM anon, authenticated;

COMMIT;


-- ── 3. La corrida de cada hora ─────────────────────────────────────────────
-- En Supabase: Database > Extensions, pg_cron y pg_net quedan prendidas con
-- esto (si no se puede desde acá, prendelas desde esa pantalla y volvé a
-- correr).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- El secreto, en Vault. Si ya estaba, se actualiza.
DO $$
DECLARE
  secreto constant text := 'PEGAR_ACA_EL_CRON_SECRET';
  existente uuid;
BEGIN
  IF secreto = 'PEGAR_ACA_EL_CRON_SECRET' THEN
    RAISE EXCEPTION 'Falta reemplazar PEGAR_ACA_EL_CRON_SECRET por el CRON_SECRET de Vercel.';
  END IF;
  SELECT id INTO existente FROM vault.secrets WHERE name = 'glynbox_cron_secret';
  IF existente IS NULL THEN
    PERFORM vault.create_secret(secreto, 'glynbox_cron_secret', 'CRON_SECRET de Vercel, para los crons de pg_cron');
  ELSE
    PERFORM vault.update_secret(existente, secreto);
  END IF;
END
$$;

-- A los :00 de cada hora (UTC). Con el mismo nombre, reemplaza al anterior.
SELECT cron.schedule(
  'glynbox-push-dia1',
  '0 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://www.glynbox.com/api/cron/push-dia1',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'glynbox_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);


-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura)
-- ----------------------------------------------------------------
-- El cron programado:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'glynbox-push-dia1';
--
-- Las últimas corridas (después de la primera hora en punto):
--   SELECT start_time, status, return_message
--     FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'glynbox-push-dia1')
--    ORDER BY start_time DESC LIMIT 5;
--
-- Lo que contestó la web (200 = bien, 401 = el secreto no coincide):
--   SELECT created, status_code, left(content::text, 300)
--     FROM net._http_response ORDER BY created DESC LIMIT 5;
--
-- Para apagarla: SELECT cron.unschedule('glynbox-push-dia1');
