-- ================================================================
-- GLYNBOX — Rendimiento con el crecimiento de octubre
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez. No borra ni cambia datos de nadie.
-- ================================================================
--
-- 1.090 usuarios esta semana contra 69 la anterior: `analytics_events` pasó
-- las 220.000 filas y el panel de admin, que la recorre en cada consulta,
-- se cortaba por tiempo en los picos (23/10, 9:05–9:10).
--
--   1. Un índice para "desde cuándo se mide" (lo usa `lib/analytics-medicion.ts`).
--   2. `admin_panel_precalculado`: el resultado de cada consulta pesada del
--      panel, calculado por pg_cron cada 10 minutos (las de hoy) o cada hora
--      (retención). El panel lee esa tabla (`lib/admin-precalculado.ts`) y, si
--      la fila falta o es vieja, consulta en vivo como antes.
--
-- Reemplaza a supabase-medicion-rapida-2026-10.sql (el índice está acá).
-- ================================================================


-- ── 1. "Desde cuándo se mide" sin recorrer la tabla ────────────────────────
-- Sin CONCURRENTLY porque el SQL Editor corre todo el archivo en una
-- transacción. Arma el índice en unos segundos; mientras tanto los eventos
-- nuevos esperan, no se pierden.

CREATE INDEX IF NOT EXISTS analytics_events_humano_created_idx
  ON public.analytics_events (created_at)
  WHERE is_bot = false;


-- ── 2. Las consultas del panel, precalculadas ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_panel_precalculado (
  -- El nombre de la vista o función, con sus argumentos: 'retencion_cohortes:12'.
  -- Las mismas claves que piden las rutas de /api/admin.
  clave         TEXT PRIMARY KEY,
  -- Lo que devolvería PostgREST: un objeto para una vista de una fila, un
  -- arreglo de filas para una función.
  datos         JSONB NOT NULL,
  calculado_en  TIMESTAMPTZ NOT NULL,
  milisegundos  INTEGER NOT NULL
);

-- Sólo la service role (el panel) la lee.
ALTER TABLE public.admin_panel_precalculado ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_panel_precalculado FROM anon, authenticated;

-- 'rapido': lo de hoy, cada 10 minutos. 'lento': retención, cada hora.
-- Cada consulta va en su propio bloque: si una falla (por ejemplo, porque
-- todavía no se corrió su SQL), las demás se guardan igual y el panel cae a
-- la consulta en vivo sólo para ésa.
CREATE OR REPLACE FUNCTION public.admin_panel_precalcular(p_grupo text)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  c        record;
  inicio   timestamptz;
  resultado jsonb;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('rapido', 'admin_resumen_actividad',
         'SELECT to_jsonb(x) FROM public.admin_resumen_actividad x'),
      ('rapido', 'admin_app_uso',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.admin_app_uso() x'),
      ('rapido', 'admin_actividad_por_hora:30',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.admin_actividad_por_hora(30) x'),
      ('lento',  'retencion_cohortes:12',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.retencion_cohortes(12) x'),
      ('lento',  'retencion_app_instalaciones_v2:12',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.retencion_app_instalaciones_v2(12) x'),
      ('lento',  'retencion_embudo_registro_v2:90',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.retencion_embudo_registro_v2(90) x'),
      ('lento',  'retencion_sesiones_primera_semana:90',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.retencion_sesiones_primera_semana(90) x'),
      ('lento',  'retencion_comportamiento:90',
         'SELECT coalesce(jsonb_agg(to_jsonb(x)), ''[]'') FROM public.retencion_comportamiento(90) x'),
      ('lento',  'analytics_medicion',
         'SELECT to_jsonb(x) FROM public.analytics_medicion x')
    ) AS v(grupo, clave, consulta)
    WHERE v.grupo = p_grupo
  LOOP
    BEGIN
      inicio := clock_timestamp();
      EXECUTE c.consulta INTO resultado;
      IF resultado IS NOT NULL THEN
        INSERT INTO public.admin_panel_precalculado (clave, datos, calculado_en, milisegundos)
        VALUES (c.clave, resultado, clock_timestamp(),
                (extract(epoch FROM clock_timestamp() - inicio) * 1000)::int)
        ON CONFLICT (clave) DO UPDATE
          SET datos = EXCLUDED.datos,
              calculado_en = EXCLUDED.calculado_en,
              milisegundos = EXCLUDED.milisegundos;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'admin_panel_precalcular %: %', c.clave, SQLERRM;
    END;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.admin_panel_precalcular(text) FROM PUBLIC, anon, authenticated;

-- Las corridas. Con el mismo nombre, reemplazan a las anteriores.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('glynbox-panel-rapido', '*/10 * * * *',
  $$SELECT public.admin_panel_precalcular('rapido')$$);
SELECT cron.schedule('glynbox-panel-lento', '7 * * * *',
  $$SELECT public.admin_panel_precalcular('lento')$$);

-- La primera vez, ya mismo, así el panel no espera al cron. Tarda unos
-- segundos.
SELECT public.admin_panel_precalcular('rapido');
SELECT public.admin_panel_precalcular('lento');

NOTIFY pgrst, 'reload schema';


-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura)
-- ----------------------------------------------------------------
-- Lo calculado, cuándo y cuánto tardó (tienen que estar las 9 claves):
--   SELECT clave, calculado_en, milisegundos FROM public.admin_panel_precalculado ORDER BY clave;
--
-- Las corridas del cron:
--   SELECT j.jobname, d.start_time, d.status, d.return_message
--     FROM cron.job_run_details d JOIN cron.job j USING (jobid)
--    WHERE j.jobname LIKE 'glynbox-panel-%'
--    ORDER BY d.start_time DESC LIMIT 10;
--
-- Para apagarlo (el panel vuelve a consultar en vivo solo):
--   SELECT cron.unschedule('glynbox-panel-rapido');
--   SELECT cron.unschedule('glynbox-panel-lento');
