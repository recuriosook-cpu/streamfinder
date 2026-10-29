-- ════════════════════════════════════════════════════════════════════════════
-- Comentarios en las guías, y respuestas, me gusta y reportes en todos los
-- comentarios (reseñas, listas y guías). 29/10/2026.
--
-- Se corre una vez en Supabase → SQL Editor. Se puede volver a correr: todo es
-- IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE.
--
-- Qué hace:
--   1. `guide_comments`: los comentarios de las guías. Las guías no están en la
--      base (son archivos de la web), así que se cuelgan del slug.
--   2. `list_comments.parent_id`: respuestas en las listas. `review_comments` ya
--      lo tenía.
--   3. Una respuesta siempre cuelga del comentario de arriba de todo y es de la
--      misma reseña, lista o guía (un solo nivel, como en la web).
--   4. `comment_likes`: me gusta en comentarios, de los tres tipos.
--   5. `content_reports` acepta `list_comment` y `guide_comment` (el `comment`
--      que ya había es el de reseña).
--   6. `notifications` acepta `comment_reply` y `entity_type = 'guide'`, si
--      tenían un CHECK que los dejara afuera.
--   7. El filtro de links, el mismo de siempre, en `guide_comments`.
--
-- Las notificaciones de respuesta las mandan la app y la web desde el cliente,
-- como las demás (`lib/notify.ts`); las preferencias las aplica la base con el
-- trigger que ya existe. Acá no hay un trigger que notifique: duplicaría las
-- que ya manda la web para las respuestas en reseñas.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. guide_comments ──────────────────────────────────────────────────────
-- Misma forma que `review_comments` y `list_comments`, con `guide_slug` en vez
-- de la reseña o la lista. El FK a `profiles` es el que deja traer el autor en
-- la misma consulta (`profiles(...)` de PostgREST).

CREATE TABLE IF NOT EXISTS public.guide_comments (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_slug text        NOT NULL CHECK (guide_slug ~ '^[a-z0-9-]{1,80}$'),
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id  uuid        REFERENCES public.guide_comments(id) ON DELETE CASCADE,
  content    text        NOT NULL CHECK (length(content) > 0 AND length(content) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guide_comments_guia_idx   ON public.guide_comments (guide_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS guide_comments_parent_idx ON public.guide_comments (parent_id);

ALTER TABLE public.guide_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comentarios de guías visibles" ON public.guide_comments;
CREATE POLICY "Comentarios de guías visibles"
  ON public.guide_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Comentar guías con la cuenta propia" ON public.guide_comments;
CREATE POLICY "Comentar guías con la cuenta propia"
  ON public.guide_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Borrar los comentarios propios de guías" ON public.guide_comments;
CREATE POLICY "Borrar los comentarios propios de guías"
  ON public.guide_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ── 2. Respuestas en listas ────────────────────────────────────────────────

ALTER TABLE public.list_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.list_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS list_comments_parent_idx ON public.list_comments (parent_id);


-- ── 3. Una respuesta cuelga del comentario de arriba, del mismo lugar ──────
-- Responderle a una respuesta la cuelga del comentario original (un solo
-- nivel, como dibujan la web y la app). Y no se puede colgar una respuesta de
-- un comentario de otra reseña, lista o guía. `TG_ARGV[0]` es la columna del
-- padre de cada tabla (review_id, list_id, guide_slug).

CREATE OR REPLACE FUNCTION public.glynbox_respuesta_valida()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  padre jsonb;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT to_jsonb(c) FROM %I.%I c WHERE c.id = $1', TG_TABLE_SCHEMA, TG_TABLE_NAME)
    INTO padre USING NEW.parent_id;

  IF padre IS NULL OR padre ->> TG_ARGV[0] IS DISTINCT FROM to_jsonb(NEW) ->> TG_ARGV[0] THEN
    RAISE EXCEPTION USING ERRCODE = 'foreign_key_violation', MESSAGE = 'La respuesta no corresponde a ese comentario';
  END IF;

  IF padre ->> 'parent_id' IS NOT NULL THEN
    NEW.parent_id := (padre ->> 'parent_id')::uuid;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS review_comments_respuesta ON public.review_comments;
CREATE TRIGGER review_comments_respuesta
  BEFORE INSERT ON public.review_comments
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_respuesta_valida('review_id');

DROP TRIGGER IF EXISTS list_comments_respuesta ON public.list_comments;
CREATE TRIGGER list_comments_respuesta
  BEFORE INSERT ON public.list_comments
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_respuesta_valida('list_id');

DROP TRIGGER IF EXISTS guide_comments_respuesta ON public.guide_comments;
CREATE TRIGGER guide_comments_respuesta
  BEFORE INSERT ON public.guide_comments
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_respuesta_valida('guide_slug');


-- ── 4. Me gusta en comentarios ─────────────────────────────────────────────
-- Una sola tabla para los tres tipos de comentario. Como `comment_id` apunta a
-- tres tablas distintas no puede tener FK: al borrar un comentario, el trigger
-- de abajo se lleva sus me gusta.

CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_type text        NOT NULL CHECK (comment_type IN ('review', 'list', 'guide')),
  comment_id   uuid        NOT NULL,
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_type, comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS comment_likes_usuario_idx ON public.comment_likes (user_id);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Me gusta de comentarios visibles" ON public.comment_likes;
CREATE POLICY "Me gusta de comentarios visibles"
  ON public.comment_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Dar me gusta con la cuenta propia" ON public.comment_likes;
CREATE POLICY "Dar me gusta con la cuenta propia"
  ON public.comment_likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Sacar el me gusta propio" ON public.comment_likes;
CREATE POLICY "Sacar el me gusta propio"
  ON public.comment_likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Al borrar un comentario (o una respuesta, en cascada) se van sus me gusta.
-- SECURITY DEFINER porque los me gusta son de otras personas y la RLS no dejaría
-- borrarlos a quien borra su comentario.
CREATE OR REPLACE FUNCTION public.glynbox_borrar_me_gusta_de_comentario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.comment_likes WHERE comment_type = TG_ARGV[0] AND comment_id = OLD.id;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS review_comments_borrar_me_gusta ON public.review_comments;
CREATE TRIGGER review_comments_borrar_me_gusta
  AFTER DELETE ON public.review_comments
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_borrar_me_gusta_de_comentario('review');

DROP TRIGGER IF EXISTS list_comments_borrar_me_gusta ON public.list_comments;
CREATE TRIGGER list_comments_borrar_me_gusta
  AFTER DELETE ON public.list_comments
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_borrar_me_gusta_de_comentario('list');

DROP TRIGGER IF EXISTS guide_comments_borrar_me_gusta ON public.guide_comments;
CREATE TRIGGER guide_comments_borrar_me_gusta
  AFTER DELETE ON public.guide_comments
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_borrar_me_gusta_de_comentario('guide');


-- ── 5 y 6. Tipos nuevos en los CHECK que ya existen ─────────────────────────
-- No se reescriben a mano: si se olvida un tipo que ya se usa, se rompe lo que
-- lo manda. Se lee cada CHECK como está y se le suman los valores nuevos sólo
-- si no los tiene. Si la columna no tiene CHECK, no se toca.

CREATE OR REPLACE FUNCTION pg_temp.sumar_al_check(tabla text, columna text, valores text[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  c record;
  def text;
  v text;
BEGIN
  FOR c IN
    SELECT con.conname, pg_get_constraintdef(con.oid) AS definicion
      FROM pg_constraint con
     WHERE con.conrelid = ('public.' || tabla)::regclass
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ~ ('\m' || columna || '\M')
       AND pg_get_constraintdef(con.oid) LIKE '%ARRAY[%'
  LOOP
    def := c.definicion;
    FOREACH v IN ARRAY valores LOOP
      IF position(quote_literal(v) IN def) = 0 THEN
        def := regexp_replace(def, 'ARRAY\[', 'ARRAY[' || quote_literal(v) || '::text, ');
      END IF;
    END LOOP;
    IF def <> c.definicion THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', tabla, c.conname);
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', tabla, c.conname, def);
      RAISE NOTICE '%.%: % → %', tabla, c.conname, c.definicion, def;
    END IF;
  END LOOP;
END
$$;

SELECT pg_temp.sumar_al_check('content_reports', 'content_type', ARRAY['list_comment', 'guide_comment']);
SELECT pg_temp.sumar_al_check('notifications', 'type', ARRAY['comment_reply']);
SELECT pg_temp.sumar_al_check('notifications', 'entity_type', ARRAY['guide', 'list']);


-- ── 7. Sin links en los comentarios de guías ───────────────────────────────
-- La misma función y el mismo mensaje que `review_comments` y `list_comments`
-- (supabase-sin-links-2026-10.sql).

DROP TRIGGER IF EXISTS guide_comments_sin_links ON public.guide_comments;
CREATE TRIGGER guide_comments_sin_links
  BEFORE INSERT OR UPDATE OF content ON public.guide_comments
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_rechazar_links('content', 'No se permiten links en los comentarios');

COMMIT;


-- ── Para comprobar ──────────────────────────────────────────────────────────
-- Tiene que dar las tres tablas, `parent_id` en las listas, y los CHECK con
-- los valores nuevos (o sin CHECK).

SELECT 'guide_comments' AS que, to_regclass('public.guide_comments') IS NOT NULL AS ok
UNION ALL
SELECT 'comment_likes', to_regclass('public.comment_likes') IS NOT NULL
UNION ALL
SELECT 'list_comments.parent_id', EXISTS (
  SELECT 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'list_comments' AND column_name = 'parent_id'
)
UNION ALL
SELECT 'triggers de comentarios', (
  SELECT count(*) = 7 FROM pg_trigger
   WHERE NOT tgisinternal
     AND tgname IN ('review_comments_respuesta', 'list_comments_respuesta', 'guide_comments_respuesta',
                    'review_comments_borrar_me_gusta', 'list_comments_borrar_me_gusta',
                    'guide_comments_borrar_me_gusta', 'guide_comments_sin_links')
);

SELECT conrelid::regclass AS tabla, conname, pg_get_constraintdef(oid) AS definicion
  FROM pg_constraint
 WHERE conrelid IN ('public.notifications'::regclass, 'public.content_reports'::regclass)
   AND contype = 'c';


-- ── Volver atrás (sólo si hace falta) ──────────────────────────────────────
-- Borra los comentarios de guías y los me gusta de comentarios. Las respuestas
-- de listas se quedan sin padre (quedan como comentarios sueltos).
--
--   BEGIN;
--   DROP TABLE IF EXISTS public.guide_comments;
--   DROP TABLE IF EXISTS public.comment_likes;
--   DROP TRIGGER IF EXISTS review_comments_respuesta ON public.review_comments;
--   DROP TRIGGER IF EXISTS list_comments_respuesta ON public.list_comments;
--   DROP TRIGGER IF EXISTS review_comments_borrar_me_gusta ON public.review_comments;
--   DROP TRIGGER IF EXISTS list_comments_borrar_me_gusta ON public.list_comments;
--   DROP FUNCTION IF EXISTS public.glynbox_respuesta_valida();
--   DROP FUNCTION IF EXISTS public.glynbox_borrar_me_gusta_de_comentario();
--   ALTER TABLE public.list_comments DROP COLUMN IF EXISTS parent_id;
--   COMMIT;
