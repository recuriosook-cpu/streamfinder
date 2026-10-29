-- ════════════════════════════════════════════════════════════════════════════
-- El contador de comentarios de reseñas y listas, también cuando comenta otro.
-- 29/10/2026.
--
-- `sync_review_comment_count` y `sync_list_comment_count` actualizan
-- `reviews.comment_count` y `lists.comment_count` con los permisos de quien
-- comenta. La RLS de `reviews` y `lists` sólo deja actualizar al dueño, así que
-- cuando comenta otra persona —casi siempre— el UPDATE no toca ninguna fila y
-- el número no se mueve. El 29/10 había 2 reseñas desfasadas de 6 con
-- comentarios. Con las respuestas va a pasar más seguido.
--
-- SECURITY DEFINER hace que la función actualice el contador con los permisos
-- de su dueño, sin abrirle `reviews` ni `lists` a nadie: sólo puede sumar o
-- restar uno al comentario que se acaba de escribir o borrar. Después se
-- recalculan los contadores que ya quedaron mal.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_review_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE reviews SET comment_count = comment_count + 1
      WHERE id = NEW.review_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE reviews SET comment_count = GREATEST(comment_count - 1, 0)
      WHERE id = OLD.review_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_list_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE lists SET comment_count = comment_count + 1
      WHERE id = NEW.list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE lists SET comment_count = GREATEST(comment_count - 1, 0)
      WHERE id = OLD.list_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Los que ya quedaron desfasados.
UPDATE public.reviews r
   SET comment_count = x.real
  FROM (SELECT r2.id, (SELECT count(*) FROM public.review_comments c WHERE c.review_id = r2.id) AS real
          FROM public.reviews r2) x
 WHERE x.id = r.id AND r.comment_count IS DISTINCT FROM x.real;

UPDATE public.lists l
   SET comment_count = x.real
  FROM (SELECT l2.id, (SELECT count(*) FROM public.list_comments c WHERE c.list_id = l2.id) AS real
          FROM public.lists l2) x
 WHERE x.id = l.id AND l.comment_count IS DISTINCT FROM x.real;

COMMIT;

-- Para comprobar (tiene que dar 0 y 0):
--
--   SELECT
--     (SELECT count(*) FROM public.reviews r WHERE r.comment_count <> (SELECT count(*) FROM public.review_comments c WHERE c.review_id = r.id)) AS resenas,
--     (SELECT count(*) FROM public.lists l   WHERE l.comment_count <> (SELECT count(*) FROM public.list_comments c   WHERE c.list_id = l.id))   AS listas;
