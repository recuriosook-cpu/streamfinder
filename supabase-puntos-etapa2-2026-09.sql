-- ── Puntos, etapa 2: que los dé la base, una sola vez por acción ───────────
--
-- Aprobado el 2026-09-24. Correr entero, una vez; se puede volver a correr
-- sin duplicar nada.
--
-- QUÉ CAMBIA
--
--   Los puntos dejan de decidirse en el cliente. Los da la base con triggers
--   sobre la acción real, y cada acción queda anotada en `puntos_otorgados`
--   con una clave única: poner y sacar algo de la watchlist, seguir y dejar de
--   seguir, borrar y rehacer una reseña, suma UNA vez en la vida. Deshacer no
--   resta (hoy tampoco).
--
--     vista            3 película / 5 serie      clave: tipo:id
--     watchlist        1                         clave: tipo:id
--     resena           10                        clave: tipo:id
--     resena_larga     +5 (cuerpo ≥ 200)         clave: tipo:id  (también al editar, una vez)
--     sigue            1  (al que sigue)         clave: id del seguido
--     seguido          3  (al seguido)           clave: id de quien sigue
--     like_recibido    2  (al autor)             clave: reseña:quien   (los propios no)
--
--   Lo importado de Letterboxd no suma (columna `origen` = 'letterboxd'): se
--   anota con 0 puntos, así desmarcar y volver a marcar tampoco suma.
--   El "ya vi" del onboarding suma como cualquier vista (decidido).
--
--   add_points pasa a no hacer nada. Las apps instaladas la siguen llamando:
--   ni error ni puntos dobles; sus acciones suman por los triggers.
--
-- RECÁLCULO DE LO QUE YA EXISTE (una vez, acá mismo)
--
--   1. Todas las acciones existentes se anotan en `puntos_otorgados`, así los
--      triggers nunca las vuelven a premiar.
--   2. Las vistas importadas (50 o más del mismo usuario en ±2 minutos;
--      verificado: sólo las 1234 de la importación de Ferlageok) se anotan
--      con 0 puntos.
--   3. puntos = el MAYOR entre los de hoy y el total anotado. Nadie queda con
--      menos (36 usuarios tienen hoy más que el recálculo, por acciones que
--      después deshicieron: se los quedan).
--   4. El nivel se actualiza directo en la tabla, sin pasar por
--      sumar_puntos(): no sale ningún aviso de "subiste de nivel". Cambian de
--      nivel 2 cuentas.
--
-- ORDEN: correr esto ANTES de desplegar la web que deja de llamar a add_points.

BEGIN;

-- ── 1. De dónde vino una fila ─────────────────────────────────────────────
-- NULL = la cargó el usuario. 'letterboxd' = el importador. Agregar una
-- columna no afecta a nadie que ya lee estas tablas.
ALTER TABLE watched   ADD COLUMN IF NOT EXISTS origen TEXT;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS origen TEXT;
ALTER TABLE reviews   ADD COLUMN IF NOT EXISTS origen TEXT;

-- ── 2. El registro ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS puntos_otorgados (
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  motivo     TEXT        NOT NULL CHECK (motivo IN ('vista', 'watchlist', 'resena', 'resena_larga',
                                                    'sigue', 'seguido', 'like_recibido')),
  clave      TEXT        NOT NULL,
  puntos     INTEGER     NOT NULL CHECK (puntos >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, motivo, clave)
);

-- Sin políticas: ningún cliente lo lee ni lo escribe. Sólo las funciones de
-- abajo (SECURITY DEFINER) y la service role.
ALTER TABLE puntos_otorgados ENABLE ROW LEVEL SECURITY;

-- Anota y, si es nuevo, suma (sumar_puntos avisa si sube de nivel).
CREATE OR REPLACE FUNCTION otorgar_puntos(p_user UUID, p_motivo TEXT, p_clave TEXT, p_puntos INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  INSERT INTO puntos_otorgados (user_id, motivo, clave, puntos)
  VALUES (p_user, p_motivo, p_clave, p_puntos)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;

  IF n > 0 AND p_puntos > 0 THEN
    PERFORM sumar_puntos(p_user, p_puntos);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION otorgar_puntos(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

-- Largo de una reseña sin espacios en los bordes (btrim sólo saca espacios,
-- no saltos de línea).
CREATE OR REPLACE FUNCTION largo_resena(p_body TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT length(regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g'))
$$;

-- ── 3. Los triggers ───────────────────────────────────────────────────────
-- Un fallo sumando puntos nunca puede impedir la acción: EXCEPTION → WARNING.

CREATE OR REPLACE FUNCTION puntos_por_vista()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM otorgar_puntos(
    NEW.user_id, 'vista', NEW.media_type || ':' || NEW.media_id,
    CASE WHEN NEW.origen = 'letterboxd' THEN 0 WHEN NEW.media_type = 'tv' THEN 5 ELSE 3 END);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'puntos_por_vista: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION puntos_por_watchlist()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM otorgar_puntos(
    NEW.user_id, 'watchlist', NEW.media_type || ':' || NEW.media_id,
    CASE WHEN NEW.origen = 'letterboxd' THEN 0 ELSE 1 END);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'puntos_por_watchlist: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Sirve para INSERT y para UPDATE: la reseña suma al crearse, y los +5 de
-- "larga" cuando el cuerpo llega a 200, sea al crearla o al editarla. La
-- clave evita que editar vuelva a sumar (hoy la web daba +10 en cada edición).
CREATE OR REPLACE FUNCTION puntos_por_resena()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clave  TEXT := NEW.media_type || ':' || NEW.media_id;
  v_import BOOLEAN := NEW.origen = 'letterboxd';
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM otorgar_puntos(NEW.user_id, 'resena', v_clave, CASE WHEN v_import THEN 0 ELSE 10 END);
  END IF;
  IF largo_resena(NEW.body) >= 200 THEN
    PERFORM otorgar_puntos(NEW.user_id, 'resena_larga', v_clave, CASE WHEN v_import THEN 0 ELSE 5 END);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'puntos_por_resena: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Reemplaza al de la etapa 1: ahora también el +1 de quien sigue, y una vez.
CREATE OR REPLACE FUNCTION puntos_por_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.following_id IS DISTINCT FROM NEW.follower_id THEN
    PERFORM otorgar_puntos(NEW.follower_id, 'sigue', NEW.following_id::text, 1);
    PERFORM otorgar_puntos(NEW.following_id, 'seguido', NEW.follower_id::text, 3);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'puntos_por_follow: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Reemplaza al de la etapa 1: una vez por reseña y por quien da el like.
CREATE OR REPLACE FUNCTION puntos_por_like_resena()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_autor UUID;
BEGIN
  SELECT user_id INTO v_autor FROM reviews WHERE id = NEW.review_id;
  IF v_autor IS NOT NULL AND v_autor IS DISTINCT FROM NEW.user_id THEN
    PERFORM otorgar_puntos(v_autor, 'like_recibido', NEW.review_id || ':' || NEW.user_id, 2);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'puntos_por_like_resena: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS puntos_por_vista ON watched;
CREATE TRIGGER puntos_por_vista AFTER INSERT ON watched
  FOR EACH ROW EXECUTE FUNCTION puntos_por_vista();

DROP TRIGGER IF EXISTS puntos_por_watchlist ON watchlist;
CREATE TRIGGER puntos_por_watchlist AFTER INSERT ON watchlist
  FOR EACH ROW EXECUTE FUNCTION puntos_por_watchlist();

DROP TRIGGER IF EXISTS puntos_por_resena ON reviews;
CREATE TRIGGER puntos_por_resena AFTER INSERT OR UPDATE OF body ON reviews
  FOR EACH ROW EXECUTE FUNCTION puntos_por_resena();

-- Los de follows y review_likes ya existen (etapa 1) y apuntan a las mismas
-- funciones, que se acaban de reemplazar. Se recrean igual por si acaso.
DROP TRIGGER IF EXISTS puntos_por_follow ON follows;
CREATE TRIGGER puntos_por_follow AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION puntos_por_follow();

DROP TRIGGER IF EXISTS puntos_por_like_resena ON review_likes;
CREATE TRIGGER puntos_por_like_resena AFTER INSERT ON review_likes
  FOR EACH ROW EXECUTE FUNCTION puntos_por_like_resena();

REVOKE EXECUTE ON FUNCTION puntos_por_vista()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION puntos_por_watchlist()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION puntos_por_resena()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION puntos_por_follow()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION puntos_por_like_resena() FROM PUBLIC, anon, authenticated;

-- ── 4. add_points ya no hace nada ─────────────────────────────────────────
-- Misma firma: las apps instaladas la siguen llamando sin error.
CREATE OR REPLACE FUNCTION add_points(p_user_id UUID, p_amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Los puntos los dan los triggers (puntos_otorgados). Ver el encabezado de
  -- supabase-puntos-etapa2-2026-09.sql.
  RETURN;
END;
$$;

-- ── 5. Anotar lo que ya existe ────────────────────────────────────────────
-- Sólo usuarios con perfil (la FK de puntos_otorgados); ON CONFLICT hace que
-- volver a correrlo no cambie nada.

INSERT INTO puntos_otorgados (user_id, motivo, clave, puntos, created_at)
SELECT w.user_id, 'vista', w.media_type || ':' || w.media_id,
       CASE
         WHEN (SELECT count(*) FROM watched w2
               WHERE w2.user_id = w.user_id
                 AND w2.watched_at BETWEEN w.watched_at - interval '2 minutes'
                                       AND w.watched_at + interval '2 minutes') >= 50 THEN 0
         WHEN w.media_type = 'tv' THEN 5
         ELSE 3
       END,
       coalesce(w.watched_at, now())
FROM watched w
WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.id = w.user_id)
ON CONFLICT DO NOTHING;

INSERT INTO puntos_otorgados (user_id, motivo, clave, puntos, created_at)
SELECT wl.user_id, 'watchlist', wl.media_type || ':' || wl.media_id, 1, coalesce(wl.added_at, now())
FROM watchlist wl
WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.id = wl.user_id)
ON CONFLICT DO NOTHING;

INSERT INTO puntos_otorgados (user_id, motivo, clave, puntos, created_at)
SELECT r.user_id, 'resena', r.media_type || ':' || r.media_id, 10, r.created_at
FROM reviews r
WHERE EXISTS (SELECT 1 FROM profiles p WHERE p.id = r.user_id)
ON CONFLICT DO NOTHING;

INSERT INTO puntos_otorgados (user_id, motivo, clave, puntos, created_at)
SELECT r.user_id, 'resena_larga', r.media_type || ':' || r.media_id, 5, r.created_at
FROM reviews r
WHERE largo_resena(r.body) >= 200
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = r.user_id)
ON CONFLICT DO NOTHING;

INSERT INTO puntos_otorgados (user_id, motivo, clave, puntos, created_at)
SELECT f.follower_id, 'sigue', f.following_id::text, 1, f.created_at
FROM follows f
WHERE f.follower_id <> f.following_id
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = f.follower_id)
ON CONFLICT DO NOTHING;

INSERT INTO puntos_otorgados (user_id, motivo, clave, puntos, created_at)
SELECT f.following_id, 'seguido', f.follower_id::text, 3, f.created_at
FROM follows f
WHERE f.follower_id <> f.following_id
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = f.following_id)
ON CONFLICT DO NOTHING;

INSERT INTO puntos_otorgados (user_id, motivo, clave, puntos, created_at)
SELECT r.user_id, 'like_recibido', rl.review_id || ':' || rl.user_id, 2, rl.created_at
FROM review_likes rl
JOIN reviews r ON r.id = rl.review_id
WHERE r.user_id <> rl.user_id
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = r.user_id)
ON CONFLICT DO NOTHING;

-- ── 6. Puntos y nivel, sin avisos ─────────────────────────────────────────
-- El mayor entre los de hoy y el total anotado. Directo en la tabla, no por
-- sumar_puntos(): así no sale ningún "subiste de nivel".
UPDATE profiles p
SET points = GREATEST(COALESCE(p.points, 0), s.total),
    level  = get_level(GREATEST(COALESCE(p.points, 0), s.total))
FROM (SELECT user_id, sum(puntos)::int AS total FROM puntos_otorgados GROUP BY user_id) s
WHERE s.user_id = p.id
  AND (s.total > COALESCE(p.points, 0) OR p.level IS DISTINCT FROM get_level(GREATEST(COALESCE(p.points, 0), s.total)));

-- Y cualquier nivel que no corresponda a sus puntos (por el bug de item_title).
UPDATE profiles
SET level = get_level(COALESCE(points, 0))
WHERE level IS DISTINCT FROM get_level(COALESCE(points, 0));

COMMIT;

-- ── Verificación (solo lectura) ───────────────────────────────────────────
SELECT 'anotado: ' || motivo AS que, count(*) || ' acciones, ' || sum(puntos) || ' puntos' AS detalle
FROM puntos_otorgados GROUP BY motivo
UNION ALL
SELECT 'nivel ' || level, count(*) || ' perfiles' FROM profiles GROUP BY level
UNION ALL
SELECT 'Ferlageok', points || ' puntos, nivel ' || level FROM profiles WHERE username = 'Ferlageok'
UNION ALL
SELECT 'avisos level_up creados hoy', count(*)::text FROM notifications
WHERE type = 'level_up' AND created_at > now() - interval '1 hour'
ORDER BY 1;
