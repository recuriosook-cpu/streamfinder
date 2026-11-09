-- ================================================================
-- GLYNBOX — Calificar = vista: arreglo de lo que ya existe
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Correr entero, una vez. Volver a correrlo no duplica nada.
-- ================================================================
--
-- Desde 2026-11 calificar marca el título como visto (la ficha de la app y
-- de la web; ¿Qué veo hoy? y el onboarding ya lo hacían). Esto arregla lo de
-- antes: cada nota en `ratings` sin su fila en `watched` pasa a estar vista,
-- y suma los puntos de una vista (3 película / 5 serie).
--
--   · La vista queda con la fecha de la calificación (`rated_at`).
--   · Puntos una vez en la vida, como siempre: si ese título ya había sumado
--     como vista (la marcó, la desmarcó), no vuelve a sumar.
--   · Lo que vino de una importación de Letterboxd (50 o más notas del mismo
--     usuario en ±2 minutos, la misma regla de supabase-puntos-etapa2) se
--     marca visto con origen 'letterboxd' y 0 puntos, como las importaciones.
--   · Las vistas del modo deslizar que ya existen no se tocan ni suman: ya
--     estaban marcadas como vistas (decidido).
--   · Puntos y nivel se actualizan directo en `profiles`, sin pasar por
--     sumar_puntos(): no sale ningún aviso de "subiste de nivel" (igual que
--     en la etapa 2).
--
-- Conteo al 2026-11-09 (solo lectura): 1.979 títulos de 567 usuarios; 59 de
-- importación; suman 506 usuarios, 5.962 puntos; 16 cambian de nivel.
--
-- ================================================================

BEGIN;

-- ── 1. Las notas sin vista ────────────────────────────────────────────────
CREATE TEMP TABLE calificadas_sin_vista ON COMMIT DROP AS
SELECT r.user_id, r.media_id, r.media_type, r.title, r.poster_path, r.rated_at,
       r.media_type || ':' || r.media_id AS clave,
       (SELECT count(*) FROM ratings r2
         WHERE r2.user_id = r.user_id
           AND r2.rated_at BETWEEN r.rated_at - interval '2 minutes'
                               AND r.rated_at + interval '2 minutes') >= 50 AS importada
FROM ratings r
WHERE NOT EXISTS (SELECT 1 FROM watched w
                  WHERE w.user_id = r.user_id
                    AND w.media_id = r.media_id
                    AND w.media_type = r.media_type)
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = r.user_id);

-- ── 2. Anotar los puntos ANTES de insertar las vistas ─────────────────────
-- Así el trigger puntos_por_vista, al insertar la vista, encuentra la clave
-- ya anotada y no suma por su cuenta (ni avisa "subiste de nivel"). Lo que
-- ya estaba anotado queda como estaba (ON CONFLICT): no vuelve a sumar.
CREATE TEMP TABLE vistas_a_anotar ON COMMIT DROP AS
SELECT c.user_id, c.clave,
       CASE WHEN c.importada THEN 0 WHEN c.media_type = 'tv' THEN 5 ELSE 3 END AS puntos
FROM calificadas_sin_vista c
WHERE NOT EXISTS (SELECT 1 FROM puntos_otorgados po
                  WHERE po.user_id = c.user_id AND po.motivo = 'vista' AND po.clave = c.clave);

INSERT INTO puntos_otorgados (user_id, motivo, clave, puntos, created_at)
SELECT user_id, 'vista', clave, puntos, now()
FROM vistas_a_anotar
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE puntos_nuevos ON COMMIT DROP AS
SELECT user_id, sum(puntos)::int AS puntos FROM vistas_a_anotar GROUP BY user_id;

-- ── 3. Las vistas ─────────────────────────────────────────────────────────
INSERT INTO watched (user_id, media_id, media_type, title, poster_path, watched_at, origen)
SELECT user_id, media_id, media_type, coalesce(title, ''), poster_path,
       coalesce(rated_at, now()),
       CASE WHEN importada THEN 'letterboxd' END
FROM calificadas_sin_vista
ON CONFLICT (user_id, media_id, media_type) DO NOTHING;

-- ── 4. Puntos y nivel, sin avisos ─────────────────────────────────────────
UPDATE profiles p
SET points = COALESCE(p.points, 0) + n.puntos,
    level  = get_level(COALESCE(p.points, 0) + n.puntos)
FROM puntos_nuevos n
WHERE n.user_id = p.id
  AND n.puntos > 0;

-- ── Resumen (antes del COMMIT, mientras existen las tablas temporales) ────
SELECT
  (SELECT count(*)                FROM calificadas_sin_vista)             AS titulos_marcados,
  (SELECT count(DISTINCT user_id) FROM calificadas_sin_vista)             AS usuarios,
  (SELECT count(*)                FROM calificadas_sin_vista WHERE importada) AS de_importacion,
  (SELECT count(*)                FROM puntos_nuevos WHERE puntos > 0)    AS usuarios_que_suman,
  (SELECT coalesce(sum(puntos),0) FROM puntos_nuevos)                     AS puntos_sumados;

COMMIT;

-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura): tiene que dar 0.
-- ----------------------------------------------------------------
SELECT count(*) AS calificadas_sin_vista
FROM ratings r
WHERE NOT EXISTS (SELECT 1 FROM watched w
                  WHERE w.user_id = r.user_id AND w.media_id = r.media_id AND w.media_type = r.media_type)
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = r.user_id);
