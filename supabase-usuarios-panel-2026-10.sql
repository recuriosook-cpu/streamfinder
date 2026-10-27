-- ================================================================
-- GLYNBOX — Actividad por usuario precalculada para /admin/usuarios
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez. No borra ni cambia datos de nadie.
-- ================================================================
--
-- El 27/10 /admin/usuarios mostraba a casi todos los registrados del día con
-- "sin app", tiempo y sesiones "sin datos", aunque sus eventos estaban en la
-- base. Los logs de Vercel:
--
--   [admin/users] user_app_usage: canceling statement due to statement timeout
--   [admin/users] user_activity_time: canceling statement due to statement timeout
--
-- `user_activity_time` sale de `analytics_sessions`, que agrupa TODOS los
-- eventos (325.000) por sesión antes de poder filtrar por usuario: la vista se
-- recorre entera aunque se pidan 50 usuarios.
--
-- La página normal del panel ya no las usa: calcula lo de sus 50 usuarios
-- directo de los eventos (`lib/admin-actividad.ts`). Pero ordenar por "Últ.
-- acceso", "App", "Tiempo" o "Sesiones" necesita el dato de TODOS, y eso es
-- lo que deja calculado esto cada 10 minutos en `admin_panel_precalculado`
-- (la tabla de `supabase-rendimiento-2026-10.sql`, que tiene que estar corrido).
--
-- Si esto no se corre, esos órdenes consultan la vista en vivo como antes y
-- pueden quedar vacíos en los picos. El resto del panel anda igual.
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_usuarios_precalcular()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
-- Recorre la tabla de eventos entera: sin el límite que tiene la API.
SET statement_timeout = '120s'
AS $$
DECLARE
  c         record;
  inicio    timestamptz;
  resultado jsonb;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('user_activity_time',
         'SELECT coalesce(jsonb_agg(jsonb_build_object(
             ''user_id'', user_id, ''segundos_totales'', segundos_totales,
             ''sesiones'', sesiones, ''ultima_actividad'', ultima_actividad)), ''[]'')
          FROM public.user_activity_time'),
      ('user_app_usage',
         'SELECT coalesce(jsonb_agg(jsonb_build_object(
             ''user_id'', user_id, ''sistemas'', sistemas, ''ultima_app'', ultima_app)), ''[]'')
          FROM public.user_app_usage')
    ) AS v(clave, consulta)
  LOOP
    BEGIN
      inicio := clock_timestamp();
      EXECUTE c.consulta INTO resultado;
      INSERT INTO public.admin_panel_precalculado (clave, datos, calculado_en, milisegundos)
      VALUES (c.clave, resultado, clock_timestamp(),
              (extract(epoch FROM clock_timestamp() - inicio) * 1000)::int)
      ON CONFLICT (clave) DO UPDATE
        SET datos = EXCLUDED.datos,
            calculado_en = EXCLUDED.calculado_en,
            milisegundos = EXCLUDED.milisegundos;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'admin_usuarios_precalcular %: %', c.clave, SQLERRM;
    END;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.admin_usuarios_precalcular() FROM PUBLIC, anon, authenticated;

-- Cada 10 minutos, corrido 3 minutos del de 'rapido' para no pisarse.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('glynbox-panel-usuarios', '3-59/10 * * * *',
  $$SELECT public.admin_usuarios_precalcular()$$);

-- La primera vez, ya mismo.
SELECT public.admin_usuarios_precalcular();

-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura)
-- ----------------------------------------------------------------
--   SELECT clave, calculado_en, milisegundos, jsonb_array_length(datos) AS usuarios
--     FROM public.admin_panel_precalculado
--    WHERE clave IN ('user_activity_time', 'user_app_usage');
--
-- Para apagarlo (esos órdenes vuelven a consultar en vivo):
--   SELECT cron.unschedule('glynbox-panel-usuarios');
