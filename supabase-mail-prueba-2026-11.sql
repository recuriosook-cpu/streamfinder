-- ════════════════════════════════════════════════════════════════════════════
-- Prueba "mail-1": ¿un mail trae de vuelta a quien dejó de entrar?
-- ════════════════════════════════════════════════════════════════════════════
--
-- Correr entero, una vez, en el SQL Editor de Supabase (proyecto de Glynbox).
-- Se puede volver a correr: todo es IF NOT EXISTS / OR REPLACE.
--
-- Qué crea:
--   1. profiles.mail_baja_at: la baja de los mails. La escribe /api/mail/baja
--      y la respeta cualquier envío (el script la mira antes de cada tanda).
--      Sin GRANT a anon ni authenticated: la lee y la escribe sólo el servidor.
--   2. mail_prueba: quién está en la prueba, en qué grupo y cuándo se le mandó.
--   3. mail_llegadas: cada visita web que entró por un link de un mail
--      (utm_source=mail). La llena un trigger sobre analytics_events, porque
--      los page_view se borran a los 7 días (analytics_limpiar) y la medición
--      necesita más que eso.
--   4. Funciones (sólo service_role): asignar los grupos, leer los
--      destinatarios con su mail, y el resultado para /admin/metricas.
--
-- El script que manda es scripts/mail-prueba.ts.

-- ── 1. La baja ──────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mail_baja_at timestamptz;

COMMENT ON COLUMN public.profiles.mail_baja_at IS
  'Cuándo se dio de baja de los mails de Glynbox. NULL = los recibe. Ningún envío le manda nada si no es NULL.';

-- ── 2. La prueba ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mail_prueba (
  prueba      text        NOT NULL,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grupo       text        NOT NULL CHECK (grupo IN ('mail', 'control')),
  -- Orden al azar dentro del grupo: las tandas de 100 salen en este orden.
  orden       integer     NOT NULL,
  -- Va en utm_content de los links: dice quién llegó aunque no esté logueado.
  codigo      text        NOT NULL UNIQUE,
  -- El del link "darme de baja".
  baja_token  text        NOT NULL UNIQUE,
  asignado_at timestamptz NOT NULL DEFAULT now(),
  -- Grupo mail: cuándo salió su mail. Grupo control: la hora de la tanda en la
  -- que "le tocó", para medir los dos grupos desde el mismo momento.
  enviado_at  timestamptz,
  resend_id   text,
  error       text,
  PRIMARY KEY (prueba, user_id)
);

CREATE INDEX IF NOT EXISTS mail_prueba_pendientes
  ON public.mail_prueba (prueba, grupo, orden) WHERE enviado_at IS NULL;

ALTER TABLE public.mail_prueba ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_prueba FROM anon, authenticated;

-- ── 3. Las llegadas desde un mail ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mail_llegadas (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prueba     text        NOT NULL,
  codigo     text,
  user_id    uuid,
  anon_id    text,
  session_id text,
  path       text,
  is_bot     boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mail_llegadas_prueba ON public.mail_llegadas (prueba);

ALTER TABLE public.mail_llegadas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_llegadas FROM anon, authenticated;

-- Nunca hace fallar el insert del evento: ante cualquier error, sigue.
CREATE OR REPLACE FUNCTION public.mail_llegada_registrar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.mail_llegadas (prueba, codigo, user_id, anon_id, session_id, path, is_bot, created_at)
    VALUES (
      left(NEW.props->>'utm_campaign', 60),
      left(NEW.props->>'utm_content', 60),
      NEW.user_id,
      NEW.anon_id,
      NEW.session_id,
      left(coalesce(NEW.path, NEW.props->>'path'), 200),
      NEW.is_bot,
      coalesce(NEW.created_at, now())
    );
  EXCEPTION WHEN others THEN
    NULL;
  END;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.mail_llegada_registrar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mail_llegadas_desde_eventos ON public.analytics_events;
-- El WHEN se evalúa antes de llamar a la función: los demás eventos no pagan nada.
CREATE TRIGGER mail_llegadas_desde_eventos
  AFTER INSERT ON public.analytics_events
  FOR EACH ROW
  WHEN (NEW.name = 'page_view'
        AND lower(NEW.props->>'utm_source') = 'mail'
        AND NEW.props ? 'utm_campaign')
  EXECUTE FUNCTION public.mail_llegada_registrar();

-- ── 4a. Asignar los grupos ──────────────────────────────────────────────────
--
-- Elegibles: cuenta con mail confirmado, sin bloquear, sin baja de mails, con
-- al menos una plataforma elegida (el mail es "3 para ver en tus plataformas"),
-- sin notificaciones activadas (ni push de la app ni push web) y sin entrar
-- hace p_dias o más. "Entrar" es lo mismo que "Últ. acceso" del panel: lo más
-- reciente entre last_active de la web, las sesiones de los eventos, el último
-- registro de un aparato, el último inicio de sesión y el alta.
--
-- Se dejan afuera los mails de "Ocultar mi correo" de Apple
-- (privaterelay.appleid.com): sin registrar el dominio en Apple, rebotan.
--
-- Se elige al azar 2 × p_por_grupo y se reparten mitad y mitad. Una prueba se
-- asigna una sola vez.

CREATE OR REPLACE FUNCTION public.mail_prueba_asignar(
  p_prueba    text,
  p_por_grupo integer DEFAULT 300,
  p_dias      integer DEFAULT 14
)
RETURNS TABLE (grupo text, cantidad bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.mail_prueba m WHERE m.prueba = p_prueba) THEN
    RAISE EXCEPTION 'La prueba % ya tiene grupos asignados', p_prueba;
  END IF;
  IF p_por_grupo < 1 OR p_por_grupo > 5000 OR p_dias < 1 THEN
    RAISE EXCEPTION 'Parámetros fuera de rango';
  END IF;

  INSERT INTO public.mail_prueba (prueba, user_id, grupo, orden, codigo, baja_token)
  SELECT p_prueba,
         e.id,
         CASE WHEN e.n % 2 = 1 THEN 'mail' ELSE 'control' END,
         (e.n + 1) / 2,
         left(replace(gen_random_uuid()::text, '-', ''), 12),
         replace(gen_random_uuid()::text, '-', '')
  FROM (
    SELECT u.id, row_number() OVER (ORDER BY random()) AS n
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE u.email IS NOT NULL
      AND u.email_confirmed_at IS NOT NULL
      AND u.email NOT ILIKE '%@privaterelay.appleid.com'
      AND u.deleted_at IS NULL
      AND NOT coalesce(p.blocked, false)
      AND p.mail_baja_at IS NULL
      AND coalesce(array_length(p.favorite_platforms, 1), 0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.user_devices d WHERE d.user_id = u.id AND d.push_token IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM public.push_subscriptions w WHERE w.user_id = u.id)
      AND greatest(
            p.last_active, u.last_sign_in_at, u.created_at,
            (SELECT max(s.fin) FROM public.analytics_sesion s WHERE s.user_id = u.id),
            (SELECT max(d.last_seen_at) FROM public.user_devices d WHERE d.user_id = u.id)
          ) < now() - make_interval(days => p_dias)
    ORDER BY random()
    LIMIT p_por_grupo * 2
  ) e;

  RETURN QUERY
    SELECT m.grupo, count(*) FROM public.mail_prueba m WHERE m.prueba = p_prueba GROUP BY m.grupo ORDER BY m.grupo;
END
$$;

-- ── 4b. Los próximos destinatarios, con su mail ─────────────────────────────

CREATE OR REPLACE FUNCTION public.mail_prueba_destinatarios(p_prueba text, p_limite integer DEFAULT 100)
RETURNS TABLE (
  user_id            uuid,
  email              text,
  nombre             text,
  idioma             text,
  country            text,
  favorite_platforms text[],
  codigo             text,
  baja_token         text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.user_id,
         u.email::text,
         coalesce(nullif(trim(p.display_name), ''), p.username),
         coalesce(p.idioma, u.raw_user_meta_data->>'idioma'),
         p.country,
         p.favorite_platforms::text[],
         m.codigo,
         m.baja_token
  FROM public.mail_prueba m
  JOIN auth.users u ON u.id = m.user_id
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.prueba = p_prueba
    AND m.grupo = 'mail'
    AND m.enviado_at IS NULL
    AND m.error IS NULL
    AND p.mail_baja_at IS NULL
    AND u.deleted_at IS NULL
  ORDER BY m.orden
  LIMIT greatest(0, least(p_limite, 100));
$$;

-- ── 4c. Una persona por id (el modo de prueba arma el mail con sus datos) ───

CREATE OR REPLACE FUNCTION public.mail_prueba_perfil(p_user_id uuid)
RETURNS TABLE (
  user_id            uuid,
  email              text,
  nombre             text,
  idioma             text,
  country            text,
  favorite_platforms text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.email::text,
         coalesce(nullif(trim(p.display_name), ''), p.username),
         coalesce(p.idioma, u.raw_user_meta_data->>'idioma'),
         p.country,
         p.favorite_platforms::text[]
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.id = p_user_id;
$$;

-- ── 4d. El resultado, para /admin/metricas ──────────────────────────────────
--
-- Por grupo:
--   asignados       los que quedaron en el grupo.
--   con_fecha       los que ya tienen enviado_at (mail: le salió; control: su
--                   tanda ya corrió). Es la base de los porcentajes.
--   ventana_cerrada de ésos, a los que ya les pasaron los 7 días.
--   volvieron       de los con_fecha, cuántos entraron en los 7 días siguientes
--                   a enviado_at: una sesión de los eventos (web o app), o
--                   last_active de la web, o un aparato visto, o un inicio de
--                   sesión, dentro de la ventana.
--   desde_mail      cuántas personas entraron por un link del mail (por
--                   utm_content o por su user_id). Sólo la web: la app todavía
--                   no registra los utm de los links que abre.
--   visitas_mail    visitas sin bots que entraron por un link de este mail.
--   bajas           cuántos se dieron de baja (de cualquier mail).
--   errores         mails que Resend rechazó.

CREATE OR REPLACE FUNCTION public.mail_prueba_resultado(p_prueba text)
RETURNS TABLE (
  grupo           text,
  asignados       bigint,
  con_fecha       bigint,
  ventana_cerrada bigint,
  volvieron       bigint,
  desde_mail      bigint,
  visitas_mail    bigint,
  bajas           bigint,
  errores         bigint,
  primer_envio    timestamptz,
  ultimo_envio    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH m AS (
    SELECT m.*, p.mail_baja_at, p.last_active, u.last_sign_in_at
    FROM public.mail_prueba m
    JOIN public.profiles p ON p.id = m.user_id
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.prueba = p_prueba
  ),
  llegadas AS (
    SELECT l.* FROM public.mail_llegadas l
    WHERE l.prueba = p_prueba AND NOT coalesce(l.is_bot, false)
  ),
  volvio AS (
    SELECT m.user_id,
      (m.enviado_at IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.analytics_sesion s
                WHERE s.user_id = m.user_id
                  AND s.fin >= m.enviado_at
                  AND s.inicio < m.enviado_at + interval '7 days')
        OR (m.last_active >= m.enviado_at AND m.last_active < m.enviado_at + interval '7 days')
        OR (m.last_sign_in_at >= m.enviado_at AND m.last_sign_in_at < m.enviado_at + interval '7 days')
        OR EXISTS (SELECT 1 FROM public.user_devices d
                   WHERE d.user_id = m.user_id
                     AND d.last_seen_at >= m.enviado_at
                     AND d.last_seen_at < m.enviado_at + interval '7 days')
      )) AS si,
      EXISTS (SELECT 1 FROM llegadas l WHERE l.codigo = m.codigo OR l.user_id = m.user_id) AS por_mail
    FROM m
  )
  SELECT m.grupo,
         count(*),
         count(*) FILTER (WHERE m.enviado_at IS NOT NULL),
         count(*) FILTER (WHERE m.enviado_at <= now() - interval '7 days'),
         count(*) FILTER (WHERE v.si),
         count(*) FILTER (WHERE v.por_mail),
         CASE WHEN m.grupo = 'mail'
              THEN (SELECT count(DISTINCT coalesce(l.session_id, l.id::text)) FROM llegadas l)
              ELSE 0 END,
         count(*) FILTER (WHERE m.mail_baja_at IS NOT NULL),
         count(*) FILTER (WHERE m.error IS NOT NULL),
         min(m.enviado_at),
         max(m.enviado_at)
  FROM m
  JOIN volvio v ON v.user_id = m.user_id
  GROUP BY m.grupo
  ORDER BY m.grupo DESC;
$$;

-- Todo esto, sólo para el servidor.
REVOKE ALL ON FUNCTION public.mail_prueba_asignar(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mail_prueba_destinatarios(text, integer)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mail_prueba_perfil(uuid)                    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mail_prueba_resultado(text)                 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_prueba_asignar(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mail_prueba_destinatarios(text, integer)    TO service_role;
GRANT EXECUTE ON FUNCTION public.mail_prueba_perfil(uuid)                    TO service_role;
GRANT EXECUTE ON FUNCTION public.mail_prueba_resultado(text)                 TO service_role;
GRANT ALL ON public.mail_prueba, public.mail_llegadas TO service_role;
