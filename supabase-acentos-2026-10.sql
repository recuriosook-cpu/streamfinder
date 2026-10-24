-- ================================================================
-- GLYNBOX — Acentos rotos al copiar los SQL (23/10)
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez.
-- ================================================================
--
-- Copiar un archivo con `cat archivo | clip` en Git Bash rompe los acentos:
-- `clip` lee los bytes UTF-8 como si fueran de la página de códigos de la
-- consola (CP850), y "ó" llega como "├│", "é" como "├®", "ñ" como "├▒".
-- Revisado en la base (solo lectura) el 23/10. Quedó roto:
--
--   · 6 funciones. Todas eran, salvo la codificación, idénticas a los
--     archivos del repo; acá van tal cual las tenía la base, con los acentos
--     de vuelta:
--       retencion_embudo_registro_v2   los nombres de los pasos del panel
--       glynbox_sin_links              las expresiones regulares ("…",
--                                      espacio duro, "aquí", "acá")
--       glynbox_usuario_base           la tabla que saca los acentos del @:
--                                      "Joaquín" daba @joaquan
--       retencion_cohortes, admin_app_uso, glynbox_usuario_desde_nombre
--                                      sólo comentarios
--   · 2 triggers con el mensaje "No se permiten links en las rese├▒as"
--     (reviews y season_reviews).
--   · 11 cuentas de Apple que recibieron el @ con la función rota (del 21
--     al 23/10). Ninguna lo cambió después. Se renombran con el @ bien
--     armado y el roto queda en `usuarios_anteriores`, así los links viejos
--     siguen llevando al perfil (app/usuario/[username]/page.tsx).
--   · La caché del panel (`admin_panel_precalculado`): se recalcula al final.
--
-- En los datos de las tablas no había nada más: ni perfiles, ni reseñas, ni
-- notificaciones, ni metadatos de auth.users.
--
-- Para copiar sin romper nada, ver "Cómo copiar un SQL" en el final.
-- ================================================================

BEGIN;

-- ── 0. ¿Llegó bien este archivo? ───────────────────────────────────────────
-- Si los acentos se rompieron al copiarlo, 'ñ' son dos caracteres y esto
-- frena todo antes de tocar nada. U&'\00F1' es la ñ escrita sin acentos.
DO $$
BEGIN
  IF 'ñ' <> U&'\00F1' THEN
    RAISE EXCEPTION 'Los acentos se rompieron al copiar este archivo. No se cambio nada. Copialo desde el editor (Ctrl+A, Ctrl+C) y volve a pegarlo.';
  END IF;
END
$$;


-- ── 1. Funciones ───────────────────────────────────────────────────────────
-- CREATE OR REPLACE conserva los permisos que ya tienen.

-- Los nombres de los pasos del embudo ("Llegó", "Géneros", "Completó"…).
CREATE OR REPLACE FUNCTION public.retencion_embudo_registro_v2(p_dias integer DEFAULT 90)
 RETURNS TABLE(plataforma text, flujo text, orden integer, clave text, etiqueta text, usuarios bigint, ultimo timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  WITH ev AS (
    SELECT CASE WHEN e.platform = 'mobile' THEN 'app' ELSE 'web' END AS plataforma,
           e.name, e.path, e.props, e.anon_id, e.user_id, e.created_at,
           CASE WHEN e.props->>'flujo' = 'corto' THEN 'corto' ELSE 'viejo' END AS flujo,
           CASE WHEN e.props->>'paso' ~ '^[0-9]+$' THEN (e.props->>'paso')::int END AS paso
      FROM public.analytics_events e
     WHERE e.is_bot = false
       AND e.created_at >= now() - make_interval(days => GREATEST(p_dias, 1))
       -- La web, desde que manda `signup_completed` (17/10). Es el arreglo de
       -- supabase-embudo-web-2026-10.sql: está acá también para que volver a
       -- correr este archivo no lo deshaga.
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
$function$;

-- Sólo comentarios.
CREATE OR REPLACE FUNCTION public.retencion_cohortes(p_semanas integer DEFAULT 12)
 RETURNS TABLE(semana date, usuarios bigint, d1 bigint, d7 bigint, d30 bigint, d1_maduro boolean, d7_maduro boolean, d30_maduro boolean)
 LANGUAGE sql
 STABLE
AS $function$
  WITH zona AS (SELECT 'America/Argentina/Buenos_Aires'::text AS tz),
  medicion AS (
    SELECT date_trunc('week', min(e.created_at AT TIME ZONE z.tz)) AS desde
      FROM public.analytics_events e, zona z
     WHERE e.is_bot = false
     GROUP BY z.tz
  ),
  altas AS (
    SELECT u.id,
           (u.created_at AT TIME ZONE z.tz) AS alta,
           date_trunc('week', u.created_at AT TIME ZONE z.tz) AS semana
      FROM public.usuarios_alta u, medicion m, zona z
     WHERE (u.created_at AT TIME ZONE z.tz)
             >= date_trunc('week', now() AT TIME ZONE z.tz) - make_interval(weeks => GREATEST(p_semanas, 1))
       AND date_trunc('week', u.created_at AT TIME ZONE z.tz) >= m.desde
  ),
  actividad AS (
    SELECT DISTINCT e.user_id, date_trunc('day', e.created_at AT TIME ZONE z.tz) AS dia
      FROM public.analytics_events e, zona z
     WHERE e.is_bot = false
       AND e.user_id IN (SELECT id FROM altas)
  ),
  por_usuario AS (
    SELECT
      a.semana,
      a.alta,
      bool_or(act.dia = date_trunc('day', a.alta) + interval '1 day')  AS v1,
      bool_or(act.dia = date_trunc('day', a.alta) + interval '7 day')  AS v7,
      bool_or(act.dia = date_trunc('day', a.alta) + interval '30 day') AS v30
    FROM altas a
    LEFT JOIN actividad act ON act.user_id = a.id
    GROUP BY a.id, a.semana, a.alta
  )
  SELECT
    p.semana::date,
    count(*)::bigint,
    count(*) FILTER (WHERE COALESCE(p.v1,  false))::bigint,
    count(*) FILTER (WHERE COALESCE(p.v7,  false))::bigint,
    count(*) FILTER (WHERE COALESCE(p.v30, false))::bigint,
    -- Maduro = el día N del alta más nueva de la cohorte ya terminó, en
    -- Argentina.
    (date_trunc('day', max(p.alta)) + interval '2 day'  <= (SELECT now() AT TIME ZONE tz FROM zona)),
    (date_trunc('day', max(p.alta)) + interval '8 day'  <= (SELECT now() AT TIME ZONE tz FROM zona)),
    (date_trunc('day', max(p.alta)) + interval '31 day' <= (SELECT now() AT TIME ZONE tz FROM zona))
  FROM por_usuario p
  GROUP BY p.semana
  ORDER BY p.semana DESC;
$function$;

-- Sólo comentarios.
CREATE OR REPLACE FUNCTION public.admin_app_uso()
 RETURNS TABLE(activas bigint, con_sesion bigint, sin_sesion bigint, android bigint, ios bigint, sin_sistema bigint, activas_prev bigint, desde timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  WITH ev AS (
    SELECT
      e.anon_id,
      e.user_id,
      e.created_at,
      COALESCE(e.props->>'os', e.props->>'plataforma') AS sistema
    FROM public.analytics_events e
    WHERE e.is_bot = false
      AND e.platform = 'mobile'
      AND e.created_at >= now() - interval '37 days'
  ),
  por_instalacion AS (
    SELECT
      ev.anon_id,
      bool_or(ev.created_at >= now() - interval '30 days') AS activa,
      bool_or(ev.user_id IS NOT NULL AND ev.created_at >= now() - interval '30 days') AS con_sesion,
      bool_or(ev.created_at < now() - interval '7 days') AS activa_prev,
      (array_agg(ev.sistema ORDER BY ev.created_at DESC)
         FILTER (WHERE ev.sistema IN ('android', 'ios')))[1] AS sistema,
      array_agg(DISTINCT ev.user_id) FILTER (WHERE ev.user_id IS NOT NULL) AS usuarios
    FROM ev
    GROUP BY ev.anon_id
  ),
  -- Los sistemas conocidos de cada usuario, de toda la historia.
  sistema_usuario AS (
    SELECT s.user_id, array_agg(DISTINCT s.sistema) AS sistemas
    FROM (
      SELECT x.user_id, x.props->>'os' AS sistema
        FROM public.analytics_events x
       WHERE x.is_bot = false AND x.platform = 'mobile' AND x.user_id IS NOT NULL
         AND x.props->>'os' IN ('android', 'ios')
      UNION
      SELECT d.user_id, d.platform
        FROM public.user_devices d
       WHERE d.platform IN ('android', 'ios')
    ) s
    GROUP BY s.user_id
  ),
  resuelto AS (
    SELECT
      p.*,
      COALESCE(p.sistema, (
        -- Sólo si entre todos los usuarios de la instalación hay un único sistema.
        SELECT CASE WHEN count(DISTINCT x.s) = 1 THEN min(x.s) END
          FROM sistema_usuario su
          CROSS JOIN LATERAL unnest(su.sistemas) AS x(s)
         WHERE su.user_id = ANY (p.usuarios)
      )) AS sistema_final
    FROM por_instalacion p
  )
  SELECT
    count(*) FILTER (WHERE r.activa)::bigint,
    count(*) FILTER (WHERE r.activa AND r.con_sesion)::bigint,
    count(*) FILTER (WHERE r.activa AND NOT r.con_sesion)::bigint,
    count(*) FILTER (WHERE r.activa AND r.sistema_final = 'android')::bigint,
    count(*) FILTER (WHERE r.activa AND r.sistema_final = 'ios')::bigint,
    count(*) FILTER (WHERE r.activa AND r.sistema_final IS NULL)::bigint,
    count(*) FILTER (WHERE r.activa_prev)::bigint,
    (SELECT min(x.created_at)
       FROM public.analytics_events x
      WHERE x.is_bot = false AND x.platform = 'mobile')
  FROM resuelto r;
$function$;

-- Las expresiones que limpian el texto: "…", el espacio duro y "aquí/acá".
CREATE OR REPLACE FUNCTION public.glynbox_sin_links(texto text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  t text := texto;
  linea text;
  lineas text[] := '{}';
  i int;
  url constant text :=
    'https?://[^\s<>"]*|www\.[^\s<>"]*'
    || '|[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.(com|net|org|ru|io|xyz|info|biz|site|online|top|club|live|stream|tv|to|cc|ly|gg|su|ws|link|app|watch|movie|movies|film|cam|vip|icu|lol|fun|pw|sx|nu|li|vc|ink|space|store|website|click|download|cyou|lat|bio|page|dev|ai|es|me|ar|mx|co|cl|uy|pe|br|la|de|fr|it|uk|us|eu|ve|ec|bo|py|is|in|ac|tk|ml|ga|cf|gq|cx|nz|au|ca|ch|jp|be|gl|gd|im|ms|so|sh|fm|am)/[^\s<>"]*'
    || '|[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.(com|net|org|ru|io|xyz|info|biz|site|online|top|club|live|stream|tv|to|cc|ly|gg|su|ws|link|app|watch|movie|movies|film|cam|vip|icu|lol|fun|pw|sx|nu|li|vc|ink|space|store|website|click|download|cyou|lat|bio|page|dev|ai)(?![a-z0-9-])';
BEGIN
  IF t IS NULL THEN
    RETURN NULL;
  END IF;

  -- <a ...>...</a>, de adentro hacia afuera: hay anidados.
  FOR i IN 1..4 LOOP
    t := regexp_replace(t, '<a(\s[^>]*)?>[^<]*</a\s*>', '', 'gi');
  END LOOP;
  t := regexp_replace(t, '</?a(\s[^>]*)?>', '', 'gi');

  FOREACH linea IN ARRAY regexp_split_to_array(t, '\r?\n') LOOP
    linea := regexp_replace(linea, url, '', 'gi');
    -- Etiquetas que quedaron vacías: <i> </i>, <b></b>.
    FOR i IN 1..2 LOOP
      linea := regexp_replace(linea, '<([a-z]+)[^>]*>\s*</\1>', '', 'gi');
    END LOOP;
    linea := regexp_replace(linea, '(^|[.!?…]\s*)[^.!?…]*\m(link|links|enlace)\M[^.!?…]*$', '\1', 'i');
    -- Con el espacio duro (U+00A0) también, que llega pegado desde el celular.
    linea := btrim(linea, E' \t ');
    IF length(linea) <= 60
       AND (linea ~ '(:|->|-)$' OR linea ~* '^(ver|link|links|enlace|aqu[ií]|ac[aá])($|[^a-záéíóúñ])') THEN
      linea := '';
    END IF;
    lineas := lineas || linea;
  END LOOP;

  t := array_to_string(lineas, E'\n');
  t := regexp_replace(t, '\n{3,}', E'\n\n', 'g');
  t := btrim(t, E' \t\n ');
  RETURN NULLIF(t, '');
END
$function$;

-- La tabla de translate() que saca los acentos del @.
CREATE OR REPLACE FUNCTION public.glynbox_usuario_base(nombre text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN length(b) >= 3 THEN left(b, 20) END
    FROM (
      SELECT regexp_replace(
               translate(lower(coalesce(nombre, '')),
                         'áàäâãåéèëêíìïîóòöôõúùüûñçý',
                         'aaaaaaeeeeiiiiooooouuuuncy'),
               '[^a-z0-9]', '', 'g') AS b
    ) x
$function$;

-- Sólo un comentario.
CREATE OR REPLACE FUNCTION public.glynbox_usuario_desde_nombre(nombre text, p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  base text := public.glynbox_usuario_base(nombre);
  candidato text;
  n int := 1;
BEGIN
  IF base IS NULL THEN
    LOOP
      candidato := 'cinefilo' || (1000 + floor(random() * 9000))::int;
      EXIT WHEN public.glynbox_usuario_libre(candidato, p_id);
    END LOOP;
    RETURN candidato;
  END IF;

  candidato := base;
  WHILE NOT public.glynbox_usuario_libre(candidato, p_id) LOOP
    n := n + 1;
    -- Que el número entre en los 20 caracteres.
    candidato := left(base, 20 - length(n::text)) || n::text;
  END LOOP;
  RETURN candidato;
END
$function$;


-- ── 2. Mensajes de los triggers de links ───────────────────────────────────

DROP TRIGGER IF EXISTS reviews_sin_links ON public.reviews;
CREATE TRIGGER reviews_sin_links BEFORE INSERT OR UPDATE OF body ON public.reviews FOR EACH ROW EXECUTE FUNCTION glynbox_rechazar_links('body', 'No se permiten links en las reseñas');

DROP TRIGGER IF EXISTS season_reviews_sin_links ON public.season_reviews;
CREATE TRIGGER season_reviews_sin_links BEFORE INSERT OR UPDATE OF body ON public.season_reviews FOR EACH ROW EXECUTE FUNCTION glynbox_rechazar_links('body', 'No se permiten links en las reseñas');


-- ── 3. Los @ armados con la función rota ───────────────────────────────────
-- Sólo si la cuenta sigue con ese @ y la persona nunca eligió uno
-- (`username_changed_at` vacío). El @ nuevo lo arma la función ya arreglada,
-- que además se fija que esté libre. `username_changed_at` no se toca: no
-- cuenta como el cambio mensual de la persona.

DO $$
DECLARE
  r record;
  nombre text;
  nuevo text;
BEGIN
  FOR r IN
    SELECT p.id, p.username, p.display_name, u.raw_user_meta_data
      FROM (VALUES
        ('04101afd-b84a-443c-b446-bcecb9b5cf0c'::uuid, 'juanmiguelramarezsen'),
        ('7067cddb-c823-401d-8de3-c9d46dcdeebf'::uuid, 'joaquanbottino'),
        ('aed84c8f-a117-4002-995d-7f8e05c5828a'::uuid, 'matiassantibaaez'),
        ('35679794-0d8a-4955-8762-988686dbfd89'::uuid, 'javierbarcelecastro'),
        ('df732693-7356-4106-9b67-7f0bb86b37a6'::uuid, 'eduarjeinerdaazaldaz'),
        ('04dacd44-4224-417f-a402-4e881407d984'::uuid, 'yeigarcaa'),
        ('91e2b8a4-e63d-4bd7-afff-7849236b2e92'::uuid, 'andrschiriboga'),
        ('e5444297-196b-4fe4-a072-23baae7d2dd9'::uuid, 'estebanenriqueramare'),
        ('0249a0fa-1679-4ed2-9dab-5a66f5ed0c44'::uuid, 'carolingemez'),
        ('8590b7d0-f576-4a8a-a4e5-fbafbc0bb938'::uuid, 'bienaisshammael'),
        ('9848343f-c65a-4c7b-bc4f-7a846f4491ec'::uuid, 'alejandrofloresmaaen')
      ) AS roto(id, username)
      JOIN public.profiles p ON p.id = roto.id AND p.username = roto.username
      JOIN auth.users u ON u.id = p.id
     WHERE p.username_changed_at IS NULL
  LOOP
    nombre := coalesce(nullif(btrim(r.display_name), ''), public.glynbox_nombre_de_metadatos(r.raw_user_meta_data));
    nuevo := public.glynbox_usuario_desde_nombre(nombre, r.id);
    IF nuevo IS DISTINCT FROM r.username THEN
      INSERT INTO public.usuarios_anteriores (user_id, username_viejo, username_nuevo, motivo)
      VALUES (r.id, r.username, nuevo, 'acentos');
      UPDATE public.profiles SET username = nuevo WHERE id = r.id;
      UPDATE public.notifications SET actor_username = nuevo WHERE actor_username = r.username;
    END IF;
  END LOOP;
END
$$;

COMMIT;

-- ── 4. La caché del panel, con los nombres bien ────────────────────────────
-- Fuera de la transacción: si falla una consulta, la función lo avisa y sigue.
SELECT public.admin_panel_precalcular('rapido');
SELECT public.admin_panel_precalcular('lento');

NOTIFY pgrst, 'reload schema';


-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura)
-- ----------------------------------------------------------------
-- Nada roto en funciones ni triggers (tiene que dar 0 y 0):
--   SELECT count(*) FROM pg_proc WHERE prosrc ~ '[├┬]|Ô[ÇÄ]';
--   SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND pg_get_triggerdef(oid) ~ '[├┬]|Ô[ÇÄ]';
--
-- Los @ corregidos:
--   SELECT username_viejo, username_nuevo FROM public.usuarios_anteriores
--    WHERE motivo = 'acentos' ORDER BY id;
--
-- Volver atrás los @ (sólo si hace falta):
--   UPDATE public.profiles p SET username = a.username_viejo
--     FROM public.usuarios_anteriores a
--    WHERE a.user_id = p.id AND p.username = a.username_nuevo AND a.motivo = 'acentos';


-- ----------------------------------------------------------------
-- CÓMO COPIAR UN SQL SIN ROMPER LOS ACENTOS
-- ----------------------------------------------------------------
-- No usar `cat archivo | clip`. Cualquiera de estas sirve:
--
--   · Abrir el archivo en VS Code, Ctrl+A, Ctrl+C y pegar.
--   · Desde Git Bash, por PowerShell (lee el archivo como UTF-8):
--       powershell -NoProfile -Command "Get-Content -Raw -Encoding UTF8 'supabase-acentos-2026-10.sql' | Set-Clipboard"
--   · Sin portapapeles, con la CLI de Supabase (ya tiene sesión en esta PC):
--       npx supabase db query --linked --project-ref ddoqsdgiggkhbsulxncs -f supabase-acentos-2026-10.sql
--
-- El bloque 0 de este archivo frena todo si igual llegara roto.
