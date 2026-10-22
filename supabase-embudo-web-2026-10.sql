-- ================================================================
-- GLYNBOX — Embudo del registro web, desde que se mide entero
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez. No cambia datos: reemplaza una función
-- de lectura del panel.
-- ================================================================
--
-- El embudo web daba 196 llegaron, 153 empezaron y 22 completaron (14 %), y
-- el 14 % no era real:
--
--   · "Completó" (`signup_completed`) empezó a salir en la web recién el 17/10
--     (ver `registrarAlta` en lib/analytics.ts). Los 90 días de "Llegó" y
--     "Empezó" se comparaban con 5 días de "Completó". Entre el 23/9 y el
--     22/10 se crearon 55 cuentas desde la web, no 22.
--   · Hasta el 22/10 el alta con email que llegaba a /onboarding con la
--     navegación de la página (sin recargar) mandaba el `signup_completed` sin
--     `user_id`, y acá no se podía cruzar con la cuenta.
--
-- Esto deja afuera los eventos web anteriores al 17/10, así las tres etapas
-- cubren el mismo período. La app no cambia. Ojo: hasta el 22/10 "Empezó" en la
-- web contaba con sólo abrir la pestaña "Crear cuenta"; desde entonces cuenta
-- al tocar "Crear cuenta" o un botón de Google, Apple o Facebook.
-- ================================================================

CREATE OR REPLACE FUNCTION public.retencion_embudo_registro_v2(p_dias int DEFAULT 90)
RETURNS TABLE (
  plataforma text,
  flujo      text,
  orden      int,
  clave      text,
  etiqueta   text,
  usuarios   bigint,
  ultimo     timestamptz
)
LANGUAGE sql
STABLE
AS $$
  WITH ev AS (
    SELECT CASE WHEN e.platform = 'mobile' THEN 'app' ELSE 'web' END AS plataforma,
           e.name, e.path, e.props, e.anon_id, e.user_id, e.created_at,
           CASE WHEN e.props->>'flujo' = 'corto' THEN 'corto' ELSE 'viejo' END AS flujo,
           CASE WHEN e.props->>'paso' ~ '^[0-9]+$' THEN (e.props->>'paso')::int END AS paso
      FROM public.analytics_events e
     WHERE e.is_bot = false
       AND e.created_at >= now() - make_interval(days => GREATEST(p_dias, 1))
       -- La web, desde que manda `signup_completed` (ver arriba).
       AND (e.platform = 'mobile' OR e.created_at >= timestamptz '2026-10-17 00:00-03')
  ),
  -- Un alta real: el evento llega dentro de las 48 h de creada la cuenta. El
  -- margen de 10 minutos hacia atrás cubre la diferencia entre el reloj de
  -- Auth y el de la base.
  completo AS (
    SELECT DISTINCT ev.plataforma, ev.anon_id
      FROM ev
      JOIN public.usuarios_alta u ON u.id = ev.user_id
     WHERE ev.name = 'signup_completed'
       AND ev.created_at BETWEEN u.created_at - interval '10 minutes'
                             AND u.created_at + interval '48 hours'
  ),
  empezo AS (
    SELECT ev.plataforma, ev.anon_id FROM ev WHERE ev.name = 'signup_started'
    UNION
    SELECT plataforma, anon_id FROM completo
  ),
  plataformas AS (SELECT unnest(ARRAY['web', 'app']) AS plataforma),
  -- Los nombres de cada paso, por flujo y plataforma.
  pasos AS (
    SELECT * FROM (VALUES
      ('web', 'corto', 1, 'Plataformas'), ('web', 'corto', 2, 'Géneros'), ('web', 'corto', 3, 'Gusto'),
      ('app', 'corto', 1, 'Plataformas'), ('app', 'corto', 2, 'Géneros'), ('app', 'corto', 3, 'Gusto'),
      ('web', 'viejo', 1, 'Nombre'), ('web', 'viejo', 2, 'Géneros'), ('web', 'viejo', 3, 'Plataformas'),
      ('web', 'viejo', 4, 'Seguir usuarios'), ('web', 'viejo', 5, 'Calificar'),
      ('app', 'viejo', 1, 'Nombre'), ('app', 'viejo', 2, 'Géneros'), ('app', 'viejo', 3, 'Plataformas'),
      ('app', 'viejo', 4, 'Seguir usuarios'), ('app', 'viejo', 5, 'Calificar'), ('app', 'viejo', 6, 'Notificaciones')
    ) AS t(plataforma, flujo, paso, nombre)
  ),
  ultimo_flujo AS (
    SELECT ev.plataforma, ev.flujo, max(ev.created_at) AS ultimo
      FROM ev
     WHERE ev.name IN ('onboarding_step_viewed', 'onboarding_step_completed', 'onboarding_skipped')
     GROUP BY ev.plataforma, ev.flujo
  )

  -- Las tres etapas del alta. "Llegó" suma a los que empezaron: en la app se
  -- puede entrar con Google, Apple o Facebook desde la bienvenida, que no es
  -- `/auth`, y sin esto el primer escalón daba menos que el segundo.
  SELECT p.plataforma, 'registro'::text, 1, 'vio_registro'::text,
         'Llegó a una pantalla de ingreso o registro'::text,
         (SELECT count(*) FROM (
            SELECT ev.anon_id FROM ev
             WHERE ev.plataforma = p.plataforma AND ev.name = 'page_view' AND ev.path = '/auth'
            UNION
            SELECT e.anon_id FROM empezo e WHERE e.plataforma = p.plataforma
          ) llego)::bigint,
         NULL::timestamptz
    FROM plataformas p
  UNION ALL
  SELECT p.plataforma, 'registro', 2, 'empezo', 'Empezó el registro',
         (SELECT count(DISTINCT e.anon_id) FROM empezo e WHERE e.plataforma = p.plataforma)::bigint,
         NULL
    FROM plataformas p
  UNION ALL
  SELECT p.plataforma, 'registro', 3, 'completo', 'Completó el registro',
         (SELECT count(DISTINCT c.anon_id) FROM completo c WHERE c.plataforma = p.plataforma)::bigint,
         NULL
    FROM plataformas p

  -- El onboarding: visto y completado alternados, por flujo.
  UNION ALL
  SELECT s.plataforma, s.flujo, s.paso * 2 - 1,
         'ob_' || s.paso || '_visto', s.nombre || ': lo vio',
         (SELECT count(DISTINCT ev.anon_id) FROM ev
           WHERE ev.plataforma = s.plataforma AND ev.flujo = s.flujo
             AND ev.name = 'onboarding_step_viewed' AND ev.paso = s.paso)::bigint,
         u.ultimo
    FROM pasos s
    LEFT JOIN ultimo_flujo u ON u.plataforma = s.plataforma AND u.flujo = s.flujo
  UNION ALL
  SELECT s.plataforma, s.flujo, s.paso * 2,
         'ob_' || s.paso || '_hecho', s.nombre || ': lo completó',
         (SELECT count(DISTINCT ev.anon_id) FROM ev
           WHERE ev.plataforma = s.plataforma AND ev.flujo = s.flujo
             AND ev.name = 'onboarding_step_completed' AND ev.paso = s.paso)::bigint,
         u.ultimo
    FROM pasos s
    LEFT JOIN ultimo_flujo u ON u.plataforma = s.plataforma AND u.flujo = s.flujo

  -- Fuera de la escalera: saltear es una salida lateral.
  UNION ALL
  SELECT f.plataforma, f.flujo, 99, 'salteo', 'Salteó el onboarding',
         (SELECT count(DISTINCT ev.anon_id) FROM ev
           WHERE ev.plataforma = f.plataforma AND ev.flujo = f.flujo
             AND ev.name = 'onboarding_skipped')::bigint,
         u.ultimo
    FROM (SELECT DISTINCT plataforma, flujo FROM pasos) f
    LEFT JOIN ultimo_flujo u ON u.plataforma = f.plataforma AND u.flujo = f.flujo

  ORDER BY 1, 2, 3;
$$;

REVOKE EXECUTE ON FUNCTION public.retencion_embudo_registro_v2(int)   FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.retencion_embudo_registro_v2(int)   TO service_role;
