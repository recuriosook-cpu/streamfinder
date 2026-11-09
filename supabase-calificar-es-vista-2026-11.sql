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
-- No crea ninguna tabla (ni temporal): todo va con CTEs, así el SQL Editor no
-- pide activar RLS. Son dos sentencias en una transacción; si algo falla, no
-- queda nada aplicado.
--
-- ================================================================

BEGIN;

-- ── 1. Anotar los puntos y sumarlos al perfil ─────────────────────────────
-- Va ANTES de insertar las vistas: así el trigger puntos_por_vista, al
-- insertar cada vista en el paso 2, encuentra la clave ya anotada y no suma
-- por su cuenta (ni avisa "subiste de nivel"). Lo que ya estaba anotado
-- (la marcó y la desmarcó alguna vez) no vuelve a sumar: ON CONFLICT, y el
-- RETURNING sólo devuelve lo recién anotado.
-- Puntos y nivel van directo en `profiles`, sin sumar_puntos(): sin avisos.
WITH calificadas_sin_vista AS (
  SELECT r.user_id, r.media_type,
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
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = r.user_id)
),
anotadas AS (
  INSERT INTO puntos_otorgados (user_id, motivo, clave, puntos, created_at)
  SELECT user_id, 'vista', clave,
         CASE WHEN importada THEN 0 WHEN media_type = 'tv' THEN 5 ELSE 3 END,
         now()
  FROM calificadas_sin_vista
  ON CONFLICT DO NOTHING
  RETURNING user_id, puntos
),
por_usuario AS (
  SELECT user_id, sum(puntos)::int AS puntos FROM anotadas GROUP BY user_id
),
perfiles AS (
  UPDATE profiles p
  SET points = COALESCE(p.points, 0) + u.puntos,
      level  = get_level(COALESCE(p.points, 0) + u.puntos)
  FROM por_usuario u
  WHERE u.user_id = p.id
    AND u.puntos > 0
  RETURNING p.id
)
SELECT
  (SELECT count(*)                FROM calificadas_sin_vista)                 AS titulos_a_marcar,
  (SELECT count(DISTINCT user_id) FROM calificadas_sin_vista)                 AS usuarios,
  (SELECT count(*)                FROM calificadas_sin_vista WHERE importada) AS de_importacion,
  (SELECT count(*)                FROM perfiles)                              AS usuarios_que_suman,
  (SELECT coalesce(sum(puntos),0) FROM anotadas)                              AS puntos_sumados;

-- ── 2. Las vistas ─────────────────────────────────────────────────────────
-- Mismo criterio que el paso 1 (que no cambió `watched`, así que elige las
-- mismas filas). Fecha de la vista = fecha de la calificación.
INSERT INTO watched (user_id, media_id, media_type, title, poster_path, watched_at, origen)
SELECT r.user_id, r.media_id, r.media_type, coalesce(r.title, ''), r.poster_path,
       coalesce(r.rated_at, now()),
       CASE WHEN (SELECT count(*) FROM ratings r2
                   WHERE r2.user_id = r.user_id
                     AND r2.rated_at BETWEEN r.rated_at - interval '2 minutes'
                                         AND r.rated_at + interval '2 minutes') >= 50
            THEN 'letterboxd' END
FROM ratings r
WHERE NOT EXISTS (SELECT 1 FROM watched w
                  WHERE w.user_id = r.user_id
                    AND w.media_id = r.media_id
                    AND w.media_type = r.media_type)
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = r.user_id)
ON CONFLICT (user_id, media_id, media_type) DO NOTHING;

COMMIT;

-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura): tiene que dar 0.
-- ----------------------------------------------------------------
SELECT count(*) AS calificadas_sin_vista
FROM ratings r
WHERE NOT EXISTS (SELECT 1 FROM watched w
                  WHERE w.user_id = r.user_id AND w.media_id = r.media_id AND w.media_type = r.media_type)
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = r.user_id);
