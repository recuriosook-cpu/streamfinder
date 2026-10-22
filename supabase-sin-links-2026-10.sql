-- ================================================================
-- GLYNBOX — Sin links en reseñas, comentarios, listas y perfiles
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez.
-- ================================================================
--
-- Había reseñas con links a sitios piratas ("Ver online:
-- https://streamimdb.ru/embed/movie/...") y a subtítulos descargados: un
-- riesgo para AdMob, Google Play y App Store. Al 22/10/2026 eran 57 reseñas,
-- todas de @p4tuzo, y una bio.
--
-- Esto hace cuatro cosas, en orden:
--
--   1. Dos funciones: `glynbox_tiene_link` (¿el texto tiene un link?) y
--      `glynbox_sin_links` (el texto sin los links ni lo que los presentaba).
--   2. Guarda una copia de cada texto con links en `textos_con_links_respaldo`,
--      ANTES de tocar nada.
--   3. Saca los links de esos textos. Lo demás de la reseña y la calificación
--      quedan igual; si no queda texto, la reseña queda sólo con la
--      calificación (body NULL).
--   4. Triggers que rechazan cualquier texto nuevo o editado con links, venga
--      de la web, de la app (también las versiones viejas) o de donde sea.
--
-- 2 a 4 van en una transacción: si algo falla, no queda nada a medias.
--
-- Qué cuenta como link (la misma regla que `lib/sin-links.ts` de la web y
-- `src/lib/sinLinks.ts` de la app, que avisan antes de enviar):
--   · http:// o https://, www., o una etiqueta <a>.
--   · Un dominio con una terminación de las que usan los sitios (.com, .net,
--     .org, .ru, .to, .app, .tv…), aunque no tenga http.
--   · Un dominio de país o de acortador (.es, .ar, .me, .co, el .be de
--     youtu.be…) seguido de "/". Sin la barra no cuenta: "bueno.es una joya"
--     es una errata común y no un link.
-- ================================================================


-- ── 1. Las funciones ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.glynbox_tiene_link(texto text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT texto IS NOT NULL AND texto ~* (
    'https?://|www\.|<\s*a[\s>]'
    || '|(^|[^a-z0-9.@_-])[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)*\.('
    ||   '(com|net|org|ru|io|xyz|info|biz|site|online|top|club|live|stream|tv|to|cc|ly|gg|su|ws|link|app|watch|movie|movies|film|cam|vip|icu|lol|fun|pw|sx|nu|li|vc|ink|space|store|website|click|download|cyou|lat|bio|page|dev|ai)([^a-z0-9-]|$)'
    ||   '|(es|me|ar|mx|co|cl|uy|pe|br|la|de|fr|it|uk|us|eu|ve|ec|bo|py|is|in|ac|tk|ml|ga|cf|gq|cx|nz|au|ca|ch|jp|be|gl|gd|im|ms|so|sh|fm|am)/'
    || ')'
  )
$$;

-- El texto sin los links. Saca:
--   · Las etiquetas <a> enteras, con el texto que muestran ("Aquí", "link",
--     la URL), y las que quedaron sueltas.
--   · Las URL y los dominios sueltos.
--   · La frase que presentaba el link al final de una línea ("les dejo el link
--     por si quieren verla", "aquí está el link").
--   · Las líneas cortas que sólo presentaban el link: "Ver online:", "Link",
--     "Aquí", "Subtítulos descargados de:", "subtitulada al español ->".
-- Si no queda nada, devuelve NULL.
--
-- Es para textos que ya tienen links: aplicada a uno sin links también sacaría
-- las líneas cortas que terminan en ":". Por eso la limpieza de abajo sólo
-- toca lo que `glynbox_tiene_link` marca.
CREATE OR REPLACE FUNCTION public.glynbox_sin_links(texto text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
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
$$;


-- ── Para mirar antes (opcional, no cambia nada) ────────────────────────────
-- Cuántos textos tienen links y cómo quedarían:
--
--   SELECT r.id, p.username, r.body AS antes, public.glynbox_sin_links(r.body) AS despues
--     FROM public.reviews r LEFT JOIN public.profiles p ON p.id = r.user_id
--    WHERE public.glynbox_tiene_link(r.body);


BEGIN;

-- ── 2. El respaldo ─────────────────────────────────────────────────────────
-- Una fila por texto cambiado, con el original y cómo quedó. Sólo la lee el
-- service role (RLS prendida y sin políticas). Si se corre de nuevo, no
-- duplica: lo ya respaldado se saltea.

CREATE TABLE IF NOT EXISTS public.textos_con_links_respaldo (
  id              bigserial   PRIMARY KEY,
  tabla           text        NOT NULL,
  columna         text        NOT NULL,
  fila_id         text        NOT NULL,
  user_id         uuid,
  texto_original  text        NOT NULL,
  texto_nuevo     text,
  guardado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tabla, columna, fila_id)
);

ALTER TABLE public.textos_con_links_respaldo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.textos_con_links_respaldo FROM anon, authenticated;

INSERT INTO public.textos_con_links_respaldo (tabla, columna, fila_id, user_id, texto_original, texto_nuevo)
SELECT 'reviews', 'body', id::text, user_id, body, public.glynbox_sin_links(body)
  FROM public.reviews WHERE public.glynbox_tiene_link(body)
UNION ALL
SELECT 'season_reviews', 'body', id::text, user_id, body, public.glynbox_sin_links(body)
  FROM public.season_reviews WHERE public.glynbox_tiene_link(body)
UNION ALL
SELECT 'review_comments', 'content', id::text, user_id, content, public.glynbox_sin_links(content)
  FROM public.review_comments WHERE public.glynbox_tiene_link(content)
UNION ALL
SELECT 'list_comments', 'content', id::text, user_id, content, public.glynbox_sin_links(content)
  FROM public.list_comments WHERE public.glynbox_tiene_link(content)
UNION ALL
SELECT 'lists', 'title', id::text, user_id, title, public.glynbox_sin_links(title)
  FROM public.lists WHERE public.glynbox_tiene_link(title)
UNION ALL
SELECT 'lists', 'description', id::text, user_id, description, public.glynbox_sin_links(description)
  FROM public.lists WHERE public.glynbox_tiene_link(description)
UNION ALL
SELECT 'profiles', 'bio', id::text, id, bio, public.glynbox_sin_links(bio)
  FROM public.profiles WHERE public.glynbox_tiene_link(bio)
ON CONFLICT (tabla, columna, fila_id) DO NOTHING;


-- ── 3. La limpieza ─────────────────────────────────────────────────────────
-- Sólo `body`, `content`, `title`, `description` y `bio`: la calificación y
-- el resto de cada fila no se tocan.
--
-- Los comentarios (review_comments, list_comments) no pueden quedar vacíos
-- (`content` es NOT NULL): si sólo eran un link, se borra el comentario; queda
-- en el respaldo. Al 22/10 no había ninguno con links. El título de una lista
-- tampoco puede quedar vacío: queda "Lista".

UPDATE public.reviews
   SET body = public.glynbox_sin_links(body)
 WHERE public.glynbox_tiene_link(body);

UPDATE public.season_reviews
   SET body = public.glynbox_sin_links(body)
 WHERE public.glynbox_tiene_link(body);

DELETE FROM public.review_comments
 WHERE public.glynbox_tiene_link(content) AND public.glynbox_sin_links(content) IS NULL;
UPDATE public.review_comments
   SET content = public.glynbox_sin_links(content)
 WHERE public.glynbox_tiene_link(content);

DELETE FROM public.list_comments
 WHERE public.glynbox_tiene_link(content) AND public.glynbox_sin_links(content) IS NULL;
UPDATE public.list_comments
   SET content = public.glynbox_sin_links(content)
 WHERE public.glynbox_tiene_link(content);

UPDATE public.lists
   SET title = COALESCE(public.glynbox_sin_links(title), 'Lista')
 WHERE public.glynbox_tiene_link(title);

UPDATE public.lists
   SET description = public.glynbox_sin_links(description)
 WHERE public.glynbox_tiene_link(description);

UPDATE public.profiles
   SET bio = public.glynbox_sin_links(bio)
 WHERE public.glynbox_tiene_link(bio);


-- ── 4. Los triggers ────────────────────────────────────────────────────────
-- Rechazan el INSERT o UPDATE con un error en castellano. El código
-- `check_violation` (23514) y la pista `sin_links` son los que reconocen la
-- web y la app para mostrar el aviso tal cual.
--
-- Argumentos: la columna a revisar y el mensaje.

CREATE OR REPLACE FUNCTION public.glynbox_rechazar_links()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.glynbox_tiene_link(to_jsonb(NEW) ->> TG_ARGV[0]) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = TG_ARGV[1],
      HINT    = 'sin_links';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS reviews_sin_links ON public.reviews;
CREATE TRIGGER reviews_sin_links
  BEFORE INSERT OR UPDATE OF body ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_rechazar_links('body', 'No se permiten links en las reseñas');

DROP TRIGGER IF EXISTS season_reviews_sin_links ON public.season_reviews;
CREATE TRIGGER season_reviews_sin_links
  BEFORE INSERT OR UPDATE OF body ON public.season_reviews
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_rechazar_links('body', 'No se permiten links en las reseñas');

DROP TRIGGER IF EXISTS review_comments_sin_links ON public.review_comments;
CREATE TRIGGER review_comments_sin_links
  BEFORE INSERT OR UPDATE OF content ON public.review_comments
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_rechazar_links('content', 'No se permiten links en los comentarios');

DROP TRIGGER IF EXISTS list_comments_sin_links ON public.list_comments;
CREATE TRIGGER list_comments_sin_links
  BEFORE INSERT OR UPDATE OF content ON public.list_comments
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_rechazar_links('content', 'No se permiten links en los comentarios');

DROP TRIGGER IF EXISTS lists_titulo_sin_links ON public.lists;
CREATE TRIGGER lists_titulo_sin_links
  BEFORE INSERT OR UPDATE OF title ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_rechazar_links('title', 'No se permiten links en las listas');

DROP TRIGGER IF EXISTS lists_descripcion_sin_links ON public.lists;
CREATE TRIGGER lists_descripcion_sin_links
  BEFORE INSERT OR UPDATE OF description ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_rechazar_links('description', 'No se permiten links en las listas');

DROP TRIGGER IF EXISTS profiles_bio_sin_links ON public.profiles;
CREATE TRIGGER profiles_bio_sin_links
  BEFORE INSERT OR UPDATE OF bio ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_rechazar_links('bio', 'No se permiten links en la bio');

COMMIT;

-- Para comprobar (tiene que dar 0 en todo):
--
--   SELECT
--     (SELECT count(*) FROM public.reviews        WHERE public.glynbox_tiene_link(body))        AS resenas,
--     (SELECT count(*) FROM public.season_reviews WHERE public.glynbox_tiene_link(body))        AS temporadas,
--     (SELECT count(*) FROM public.review_comments WHERE public.glynbox_tiene_link(content))    AS comentarios,
--     (SELECT count(*) FROM public.lists          WHERE public.glynbox_tiene_link(description)) AS listas,
--     (SELECT count(*) FROM public.profiles       WHERE public.glynbox_tiene_link(bio))         AS bios;
--
-- Y el respaldo:
--
--   SELECT tabla, columna, count(*) FROM public.textos_con_links_respaldo GROUP BY 1, 2;


-- ── Volver atrás (sólo si hace falta) ──────────────────────────────────────
-- Devuelve los textos originales. Los triggers los rechazarían, así que se
-- apagan durante la vuelta. Los comentarios borrados no vuelven solos: están
-- en el respaldo.
--
--   BEGIN;
--   ALTER TABLE public.reviews  DISABLE TRIGGER reviews_sin_links;
--   ALTER TABLE public.profiles DISABLE TRIGGER profiles_bio_sin_links;
--   UPDATE public.reviews r SET body = b.texto_original
--     FROM public.textos_con_links_respaldo b
--    WHERE b.tabla = 'reviews' AND b.columna = 'body' AND b.fila_id = r.id::text;
--   UPDATE public.profiles p SET bio = b.texto_original
--     FROM public.textos_con_links_respaldo b
--    WHERE b.tabla = 'profiles' AND b.columna = 'bio' AND b.fila_id = p.id::text;
--   ALTER TABLE public.reviews  ENABLE TRIGGER reviews_sin_links;
--   ALTER TABLE public.profiles ENABLE TRIGGER profiles_bio_sin_links;
--   COMMIT;
