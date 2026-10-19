-- ================================================================
-- GLYNBOX — Novedades de famosos y aviso de disponibilidad
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez. No borra datos.
-- CORRER ANTES DEL DEPLOY del código que lo usa (cron daily-notifications).
-- ================================================================
--
-- Lo usa `/api/cron/daily-notifications` desde la 1.0.16 (el código vive en
-- `lib/avisos-famosos.ts` y `lib/disponibilidad.ts`). Todos los días:
--
--   · Cumpleaños de los famosos que cada uno sigue (ya existía).
--   · Proyecto nuevo: un crédito que no estaba la vez anterior, todavía sin
--     estrenar. Para saber qué es nuevo se guarda lo ya visto de cada famoso.
--   · Estreno: llega la fecha de algo de esa lista (cine o serie nueva).
--   · Disponibilidad: algo de un famoso que sigue, o de su "Ver después",
--     aparece en una de sus plataformas en su país. Para saber qué es nuevo
--     se guarda dónde estaba cada título la vez anterior.
--
-- Con un tope: como mucho UNA push por día y CUATRO por semana entre todos
-- esos avisos. Si hay varias novedades el mismo día, una sola push las
-- resume; todas quedan en la bandeja de notificaciones.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. NOTIFICATIONS: tres columnas nuevas
-- ----------------------------------------------------------------

-- Los datos para redactar en cada idioma (nombre del famoso, título en
-- castellano y en inglés, plataforma). Las filas viejas no lo tienen.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS datos JSONB;

-- `true` en las que inserta el cron: la push no la manda el webhook por
-- fila sino el cron, con el tope. El webhook las deja pasar sin mandar.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sin_push BOOLEAN NOT NULL DEFAULT false;

-- Cuándo salió la push que representa a esa fila. Es lo que cuenta el tope
-- (1 por día, 4 por semana): una fila marcada por push mandada.
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS push_enviado_en TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notifications_push_enviado_idx
  ON public.notifications (user_id, push_enviado_en)
  WHERE push_enviado_en IS NOT NULL;

-- ----------------------------------------------------------------
-- 2. LOS TIPOS NUEVOS
-- ----------------------------------------------------------------
--   famoso_proyecto      nuevo proyecto anunciado de un famoso que sigue
--   famoso_disponible    algo de un famoso que sigue llegó a su plataforma
--   watchlist_disponible algo de su "Ver después" llegó a su plataforma
-- `new_release` y `actor_birthday` siguen siendo los mismos.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'Follow', 'follow', 'level_up', 'new_release', 'actor_birthday', 'like', 'reply',
  'comment', 'mention', 'review_comment', 'review_like', 'comment_reply',
  'list_like', 'list_comment', 'list_duplicate',
  'famoso_proyecto', 'famoso_disponible', 'watchlist_disponible'
]));

-- La misma función que ya estaba en producción, con las tres claves nuevas:
--   famoso_proyecto                         -> famosos_proyectos
--   famoso_disponible, watchlist_disponible -> disponibilidad
CREATE OR REPLACE FUNCTION public.notificaciones_respetan_preferencias()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clave TEXT;
BEGIN
  v_clave := CASE lower(NEW.type)
    WHEN 'follow'               THEN 'follows'
    WHEN 'review_like'          THEN 'likes'
    WHEN 'like'                 THEN 'likes'
    WHEN 'list_like'            THEN 'likes'
    WHEN 'list_duplicate'       THEN 'likes'
    WHEN 'review_comment'       THEN 'comments'
    WHEN 'comment'              THEN 'comments'
    WHEN 'list_comment'         THEN 'comments'
    WHEN 'comment_reply'        THEN 'replies'
    WHEN 'reply'                THEN 'replies'
    WHEN 'mention'              THEN 'mentions'
    WHEN 'level_up'             THEN 'level_up'
    WHEN 'actor_birthday'       THEN 'actor_birthday'
    WHEN 'new_release'          THEN 'new_release'
    WHEN 'famoso_proyecto'      THEN 'famosos_proyectos'
    WHEN 'famoso_disponible'    THEN 'disponibilidad'
    WHEN 'watchlist_disponible' THEN 'disponibilidad'
    ELSE NULL
  END;

  IF v_clave IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = NEW.user_id
      AND notification_preferences ->> v_clave = 'false'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------
-- 3. LO YA VISTO DE CADA FAMOSO
-- ----------------------------------------------------------------

-- Un famoso que alguien sigue. `sembrado_en` NULL = todavía no se leyeron
-- sus créditos: la primera vez se guardan sin avisar nada, para no anunciar
-- como "nuevo" todo lo que ya tenía.
CREATE TABLE IF NOT EXISTS public.famosos (
  person_id    INTEGER PRIMARY KEY,
  nombre       TEXT NOT NULL,
  departamento TEXT,
  sembrado_en  TIMESTAMPTZ,
  revisado_en  TIMESTAMPTZ
);

-- Sus créditos que importan (filtrados: sin programas de entrevistas, sin
-- "sí mismo", y para directores sólo dirección, guion o creación).
CREATE TABLE IF NOT EXISTS public.famosos_creditos (
  person_id       INTEGER NOT NULL REFERENCES public.famosos (person_id) ON DELETE CASCADE,
  media_type      TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  media_id        INTEGER NOT NULL,
  rol             TEXT NOT NULL CHECK (rol IN ('cast', 'crew')),
  titulo_es       TEXT NOT NULL,
  titulo_en       TEXT,
  poster_path     TEXT,
  -- Estreno de la película o primera emisión de la serie. NULL = sin fecha.
  fecha           DATE,
  visto_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
  estreno_avisado BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (person_id, media_type, media_id)
);

CREATE INDEX IF NOT EXISTS famosos_creditos_fecha_idx ON public.famosos_creditos (fecha);

-- ----------------------------------------------------------------
-- 4. DÓNDE ESTABA CADA TÍTULO LA VEZ ANTERIOR
-- ----------------------------------------------------------------

-- Un renglón por título y país: los proveedores por suscripción, gratis o con
-- anuncios (alquiler y compra no cuentan). La primera vez que se ve un título
-- en un país se guarda sin avisar.
CREATE TABLE IF NOT EXISTS public.disponibilidad (
  media_type  TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  media_id    INTEGER NOT NULL,
  pais        TEXT NOT NULL CHECK (pais ~ '^[A-Z]{2}$'),
  proveedores INTEGER[] NOT NULL DEFAULT '{}',
  revisado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (media_type, media_id, pais)
);

-- A quién ya se le avisó de qué título: una vez por persona y título, aunque
-- después aparezca en otra plataforma. El resumen semanal tampoco repite lo
-- que esté acá.
CREATE TABLE IF NOT EXISTS public.avisos_disponibilidad (
  user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  media_id   INTEGER NOT NULL,
  proveedor  INTEGER NOT NULL,
  motivo     TEXT NOT NULL CHECK (motivo IN ('watchlist', 'famoso')),
  enviado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, media_type, media_id)
);

-- ----------------------------------------------------------------
-- 5. PERMISOS: sólo el servidor
-- ----------------------------------------------------------------
-- Las lee y escribe el cron con la service role, que saltea RLS. Con RLS
-- prendido y sin políticas, nadie más puede.
ALTER TABLE public.famosos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.famosos_creditos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disponibilidad        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos_disponibilidad ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.famosos, public.famosos_creditos, public.disponibilidad, public.avisos_disponibilidad
  FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- VERIFICAR, después de la primera corrida del cron:
-- ----------------------------------------------------------------
--
--   SELECT count(*) AS famosos, count(sembrado_en) AS sembrados FROM public.famosos;
--   SELECT media_type, rol, count(*) FROM public.famosos_creditos GROUP BY 1, 2;
--   SELECT pais, count(*) FROM public.disponibilidad GROUP BY 1;
--   SELECT type, count(*), count(push_enviado_en) AS con_push
--     FROM public.notifications
--    WHERE created_at > now() - interval '1 day' GROUP BY 1;
