-- ================================================================
-- GLYNBOX — Retención y embudo de registro
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez.
--
-- REQUIERE haber corrido antes:
--   · supabase-analytics-events.sql  (la tabla)
--   · supabase-analytics-bots.sql    (is_bot y sus índices)
-- ================================================================
--
-- ADVERTENCIA SOBRE EL ALCANCE, antes que cualquier otra cosa.
--
-- Todo lo que hay acá mide la WEB. La app de Android no manda un solo evento:
-- no tiene analytics instrumentado, ni siquiera `app_open`. Así que estos
-- números NO explican las desinstalaciones de la app — de la app sólo sabemos
-- el conteo agregado que publica Play, sin usuario y sin motivo.
--
-- Lo que sí contestan es qué pasa con la gente que se registra en el sitio:
-- dónde abandona el alta, cuántos vuelven y qué hicieron distinto los que
-- volvieron. Es una pregunta vecina, no la misma.
--
-- ── Dos cosas que hay que tener presentes al leer ─────────────────────────
--
--   1. **La medición arranca cuando se desplegó el tracking.** Un usuario que
--      se registró antes no tiene eventos, y su retención daría 0% siendo que
--      en realidad no se sabe. Por eso las cohortes anteriores a la primera
--      fila de `analytics_events` se excluyen en vez de mostrarse en cero.
--   2. **Una cohorte joven no tiene D7 ni D30 todavía.** Se devuelven banderas
--      de madurez para que el panel muestre "—" y no un cero que parece una
--      catástrofe.
--
-- ================================================================

-- ----------------------------------------------------------------
-- 1. LA FECHA DE ALTA
-- ----------------------------------------------------------------
--
-- `profiles` no tiene `created_at` — lo dice la nota de `/api/admin/overview`,
-- que ya se comió el bug de usar `updated_at` y ver los registros corridos
-- hacia el presente. La fecha real vive en `auth.users`, que está en otro
-- esquema y no se puede leer desde una función normal.
--
-- Esta vista es el puente, y expone lo mínimo: el id y la fecha de alta. Nada
-- de emails ni de metadata.
--
-- Va SIN `security_invoker`, al revés que el resto de las vistas del proyecto,
-- y es a propósito: se evalúa con los permisos de su dueño (postgres), que es
-- justamente lo que le permite leer `auth.users`. Con `security_invoker = true`
-- fallaría para `service_role`. Por eso el REVOKE de abajo no es opcional: es
-- la única barrera que tiene.

CREATE OR REPLACE VIEW public.usuarios_alta AS
SELECT id, created_at
  FROM auth.users;

REVOKE ALL ON public.usuarios_alta FROM anon, authenticated;
-- Explícito y no confiado al default de Supabase: es el rol con el que el
-- endpoint del panel consulta, y si el GRANT implícito no estuviera, el error
-- sería un "permission denied" a mitad de una función y no acá.
GRANT SELECT ON public.usuarios_alta TO service_role;

-- ----------------------------------------------------------------
-- 2. DÍAS CON ACTIVIDAD, POR USUARIO
-- ----------------------------------------------------------------
--
-- La base de todo lo de abajo. Un día por usuario en el que hizo algo, sin
-- importar cuánto: para retención lo único que importa es si volvió o no.

CREATE OR REPLACE VIEW public.actividad_diaria_usuario
WITH (security_invoker = true) AS
SELECT DISTINCT
  user_id,
  date_trunc('day', created_at) AS dia
FROM public.analytics_events
WHERE is_bot = false
  AND user_id IS NOT NULL;

REVOKE ALL ON public.actividad_diaria_usuario FROM anon, authenticated;
GRANT SELECT ON public.actividad_diaria_usuario TO service_role;

-- ----------------------------------------------------------------
-- 3. RETENCIÓN POR SEMANA DE ALTA
-- ----------------------------------------------------------------
--
-- "Volvió el día N" = tuvo actividad EN el día calendario N contado desde el
-- alta. No "en algún momento antes del día N": son definiciones distintas y
-- esta es la clásica de retención Día-N. La otra siempre da más alto y hace
-- parecer que la cosa va mejor de lo que va.
--
-- La madurez se calcula con el alta MÁS NUEVA de la cohorte, no con la más
-- vieja: si el domingo de esa semana todavía no cumplió 30 días, la cohorte
-- entera no tiene D30 y mostrarlo sería promediar gente que tuvo 30 días con
-- gente que tuvo 25.

CREATE OR REPLACE FUNCTION public.retencion_cohortes(p_semanas int DEFAULT 12)
RETURNS TABLE (
  semana      date,
  usuarios    bigint,
  d1          bigint,
  d7          bigint,
  d30         bigint,
  d1_maduro   boolean,
  d7_maduro   boolean,
  d30_maduro  boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH medicion AS (
    SELECT date_trunc('week', min(created_at)) AS desde
      FROM public.analytics_events
     WHERE is_bot = false
  ),
  altas AS (
    SELECT u.id, u.created_at, date_trunc('week', u.created_at) AS semana
      FROM public.usuarios_alta u, medicion m
     WHERE u.created_at >= date_trunc('week', now()) - make_interval(weeks => GREATEST(p_semanas, 1))
       -- Antes de que existiera el tracking no hay eventos, y sin eventos la
       -- retención daría 0% cuando lo cierto es que no se sabe.
       AND date_trunc('week', u.created_at) >= m.desde
  ),
  por_usuario AS (
    SELECT
      a.semana,
      a.created_at,
      bool_or(act.dia = date_trunc('day', a.created_at) + interval '1 day')  AS v1,
      bool_or(act.dia = date_trunc('day', a.created_at) + interval '7 day')  AS v7,
      bool_or(act.dia = date_trunc('day', a.created_at) + interval '30 day') AS v30
    FROM altas a
    LEFT JOIN public.actividad_diaria_usuario act ON act.user_id = a.id
    GROUP BY a.id, a.semana, a.created_at
  )
  SELECT
    p.semana::date,
    count(*)::bigint,
    -- `bool_or` sobre cero filas del LEFT JOIN da NULL, no false: el COALESCE
    -- evita que un usuario sin ninguna actividad quede fuera del conteo.
    count(*) FILTER (WHERE COALESCE(p.v1,  false))::bigint,
    count(*) FILTER (WHERE COALESCE(p.v7,  false))::bigint,
    count(*) FILTER (WHERE COALESCE(p.v30, false))::bigint,
    (max(p.created_at) + interval '2 day'  <= now()) AS d1_maduro,
    (max(p.created_at) + interval '8 day'  <= now()) AS d7_maduro,
    (max(p.created_at) + interval '31 day' <= now()) AS d30_maduro
  FROM por_usuario p
  GROUP BY p.semana
  ORDER BY p.semana DESC;
$$;

-- ----------------------------------------------------------------
-- 4. EMBUDO DEL REGISTRO
-- ----------------------------------------------------------------
--
-- La unidad es el `anon_id` y no el `user_id`, y no hay alternativa: los dos
-- primeros pasos ocurren ANTES de que exista una cuenta. El `anon_id` vive en
-- localStorage y sobrevive al alta, así que es lo único que une "vio la
-- pantalla" con "completó el onboarding".
--
-- El paso 5 del onboarding se dispara desde otra pantalla (ver el comentario
-- en `app/onboarding/page.tsx`), pero el evento es el mismo, así que entra acá
-- sin nada especial.

CREATE OR REPLACE FUNCTION public.retencion_embudo_registro(p_dias int DEFAULT 90)
RETURNS TABLE (
  orden    int,
  clave    text,
  etiqueta text,
  usuarios bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH ev AS (
    SELECT e.name, e.path, e.props, e.anon_id
      FROM public.analytics_events e
     WHERE e.is_bot = false
       AND e.created_at >= now() - make_interval(days => GREATEST(p_dias, 1))
  )
  SELECT 1, 'vio_registro'::text, 'Vio la pantalla de registro'::text,
         count(DISTINCT e.anon_id)::bigint
    FROM ev e WHERE e.name = 'page_view' AND e.path = '/auth'

  UNION ALL
  SELECT 2, 'empezo', 'Empezó el registro',
         count(DISTINCT e.anon_id)::bigint
    FROM ev e WHERE e.name = 'signup_started'

  UNION ALL
  SELECT 3, 'completo', 'Completó el registro',
         count(DISTINCT e.anon_id)::bigint
    FROM ev e WHERE e.name = 'signup_completed'

  -- Los cinco pasos del onboarding, visto y completado alternados, para que la
  -- caída dentro de cada paso se vea al lado de la caída entre pasos.
  UNION ALL
  SELECT 3 + (s.paso * 2 - 1),
         'ob_' || s.paso || '_visto',
         'Onboarding ' || s.paso || ': lo vio',
         (SELECT count(DISTINCT e.anon_id)
            FROM ev e
           WHERE e.name = 'onboarding_step_viewed'
             -- El regex antes del cast no es paranoia: un `::int` sobre un
             -- valor no numérico aborta la consulta entera, y `props` es JSONB
             -- sin esquema.
             AND e.props->>'paso' ~ '^[0-9]+$'
             AND (e.props->>'paso')::int = s.paso)::bigint
    FROM generate_series(1, 5) AS s(paso)

  UNION ALL
  SELECT 3 + (s.paso * 2),
         'ob_' || s.paso || '_hecho',
         'Onboarding ' || s.paso || ': lo completó',
         (SELECT count(DISTINCT e.anon_id)
            FROM ev e
           WHERE e.name = 'onboarding_step_completed'
             AND e.props->>'paso' ~ '^[0-9]+$'
             AND (e.props->>'paso')::int = s.paso)::bigint
    FROM generate_series(1, 5) AS s(paso)

  -- Fuera de la escalera: saltear no es un paso más, es una salida lateral.
  UNION ALL
  SELECT 99, 'salteo', 'Salteó el onboarding',
         count(DISTINCT e.anon_id)::bigint
    FROM ev e WHERE e.name = 'onboarding_skipped'

  ORDER BY 1;
$$;

-- ----------------------------------------------------------------
-- 5. SESIONES DE LA PRIMERA SEMANA
-- ----------------------------------------------------------------
--
-- Sólo entran usuarios cuya primera semana ya terminó. Contar las sesiones de
-- alguien que se registró anteayer lo mete en el promedio con dos días de
-- oportunidad contra los siete de todos los demás, y tira el número para
-- abajo sin que nada haya empeorado.

CREATE OR REPLACE FUNCTION public.retencion_sesiones_primera_semana(p_dias int DEFAULT 90)
RETURNS TABLE (
  usuarios              bigint,
  sesiones_promedio     numeric,
  sesiones_mediana      numeric,
  sin_actividad         bigint,
  una_sola              bigint,
  una_sola_y_no_volvio  bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH medicion AS (
    SELECT min(created_at) AS desde FROM public.analytics_events WHERE is_bot = false
  ),
  altas AS (
    SELECT u.id, u.created_at
      FROM public.usuarios_alta u, medicion m
     WHERE u.created_at >= now() - make_interval(days => GREATEST(p_dias, 1))
       AND u.created_at <= now() - interval '7 day'   -- la semana ya cerró
       AND u.created_at >= m.desde
  ),
  por_usuario AS (
    SELECT
      a.id,
      count(DISTINCT e.session_id) FILTER (
        WHERE e.created_at >= a.created_at
          AND e.created_at <  a.created_at + interval '7 day'
      )::int AS sesiones,
      -- ¿Apareció alguna vez después de esa primera semana?
      bool_or(e.created_at >= a.created_at + interval '7 day') AS volvio_despues
    FROM altas a
    LEFT JOIN public.analytics_events e
           ON e.user_id = a.id AND e.is_bot = false
    GROUP BY a.id
  )
  SELECT
    count(*)::bigint,
    round(avg(p.sesiones)::numeric, 2),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY p.sesiones)::numeric,
    count(*) FILTER (WHERE p.sesiones = 0)::bigint,
    count(*) FILTER (WHERE p.sesiones = 1)::bigint,
    count(*) FILTER (WHERE p.sesiones = 1 AND NOT COALESCE(p.volvio_despues, false))::bigint
  FROM por_usuario p;
$$;

-- ----------------------------------------------------------------
-- 6. QUÉ HICIERON LOS QUE VOLVIERON, CONTRA LOS QUE NO
-- ----------------------------------------------------------------
--
-- La decisión que hace que esta comparación signifique algo: **todo se mide
-- sólo en los primeros 7 días**, que es el tiempo que los dos grupos tuvieron.
--
-- Contando el histórico completo, el que volvió siempre gana por definición —
-- tuvo más días para hacer cosas— y la tabla no diría nada más que "los que
-- vuelven usan más la app". Acotado a la primera semana, la pregunta pasa a
-- ser la interesante: qué hizo distinto, cuando todavía eran iguales, el que
-- después volvió.
--
-- "Volvió" = tuvo actividad en un día posterior al de su alta.

CREATE OR REPLACE FUNCTION public.retencion_comportamiento(p_dias int DEFAULT 90)
RETURNS TABLE (
  grupo                   text,
  usuarios                bigint,
  paginas_promedio        numeric,
  sesiones_promedio       numeric,
  calificaciones_promedio numeric,
  watchlist_promedio      numeric,
  resenas_promedio        numeric,
  favoritos_promedio      numeric,
  onboarding_completo_pct numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH medicion AS (
    SELECT min(created_at) AS desde FROM public.analytics_events WHERE is_bot = false
  ),
  altas AS (
    SELECT u.id, u.created_at, u.created_at + interval '7 day' AS corte
      FROM public.usuarios_alta u, medicion m
     WHERE u.created_at >= now() - make_interval(days => GREATEST(p_dias, 1))
       AND u.created_at <= now() - interval '7 day'
       AND u.created_at >= m.desde
  ),
  eventos AS (
    SELECT
      a.id,
      count(*) FILTER (
        WHERE e.name = 'page_view' AND e.created_at < a.corte
      )::int AS paginas,
      count(DISTINCT e.session_id) FILTER (WHERE e.created_at < a.corte)::int AS sesiones,
      bool_or(date_trunc('day', e.created_at) > date_trunc('day', a.created_at)) AS volvio
    FROM altas a
    LEFT JOIN public.analytics_events e
           ON e.user_id = a.id AND e.is_bot = false
    GROUP BY a.id
  ),
  -- Cada acción de dominio en subconsulta propia: son tablas distintas con
  -- nombres de fecha distintos (`rated_at`, `added_at`, `created_at`) y
  -- juntarlas en un solo JOIN multiplicaría las filas entre sí.
  acciones AS (
    SELECT
      a.id,
      (SELECT count(*) FROM public.ratings r
        WHERE r.user_id = a.id AND r.rated_at >= a.created_at AND r.rated_at < a.corte)::int AS calificaciones,
      (SELECT count(*) FROM public.watchlist w
        WHERE w.user_id = a.id AND w.added_at >= a.created_at AND w.added_at < a.corte)::int AS watchlist,
      (SELECT count(*) FROM public.reviews rv
        WHERE rv.user_id = a.id AND rv.created_at >= a.created_at AND rv.created_at < a.corte)::int AS resenas,
      (SELECT count(*) FROM public.favorites f
        WHERE f.user_id = a.id AND f.created_at >= a.created_at AND f.created_at < a.corte)::int AS favoritos,
      (SELECT (p.onboarding_completed_at IS NOT NULL) FROM public.profiles p WHERE p.id = a.id) AS onboarding_ok
    FROM altas a
  )
  SELECT
    CASE WHEN COALESCE(e.volvio, false) THEN 'volvio' ELSE 'no_volvio' END::text,
    count(*)::bigint,
    round(avg(e.paginas)::numeric, 1),
    round(avg(e.sesiones)::numeric, 2),
    round(avg(ac.calificaciones)::numeric, 2),
    round(avg(ac.watchlist)::numeric, 2),
    round(avg(ac.resenas)::numeric, 2),
    round(avg(ac.favoritos)::numeric, 2),
    round(100.0 * count(*) FILTER (WHERE ac.onboarding_ok) / NULLIF(count(*), 0), 1)
  FROM eventos e
  JOIN acciones ac ON ac.id = e.id
  GROUP BY 1;
$$;

-- ----------------------------------------------------------------
-- 7. PERMISOS
-- ----------------------------------------------------------------
--
-- Mismo criterio que el resto: nada de esto puede leerse con la anon key, que
-- viaja en el bundle. Las funciones además necesitan el REVOKE a PUBLIC —en
-- Postgres una función nueva nace con EXECUTE para todo el mundo— y devolverle
-- el permiso a `service_role`, que es con quien consulta el endpoint.

REVOKE EXECUTE ON FUNCTION public.retencion_cohortes(int)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.retencion_embudo_registro(int)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.retencion_sesiones_primera_semana(int)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.retencion_comportamiento(int)            FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.retencion_cohortes(int)                   TO service_role;
GRANT EXECUTE ON FUNCTION public.retencion_embudo_registro(int)            TO service_role;
GRANT EXECUTE ON FUNCTION public.retencion_sesiones_primera_semana(int)    TO service_role;
GRANT EXECUTE ON FUNCTION public.retencion_comportamiento(int)             TO service_role;

-- ----------------------------------------------------------------
-- 8. VERIFICAR
-- ----------------------------------------------------------------
--
-- Desde cuándo hay medición (define qué cohortes son legibles):
--
--   SELECT * FROM public.analytics_medicion;
--
-- Las cuatro consultas del panel:
--
--   SELECT * FROM public.retencion_cohortes(12);
--   SELECT * FROM public.retencion_embudo_registro(90);
--   SELECT * FROM public.retencion_sesiones_primera_semana(90);
--   SELECT * FROM public.retencion_comportamiento(90);
--
-- Si `retencion_cohortes` devuelve cero filas, no está rota: significa que
-- todavía no hay ninguna semana de altas posterior al primer evento medido.
