-- ── Reseñas de temporada: +5 puntos, una vez por temporada ─────────────────
--
-- Aprobado el 2026-09-24 (+5, sin bonus por reseña larga). Los puntos los da
-- la base, como todos desde supabase-puntos-etapa2-2026-09.sql: el trigger
-- anota la reseña en `puntos_otorgados` con clave serie:temporada, así borrarla
-- y volver a escribirla no suma otra vez. Editarla tampoco.
--
-- Correr entero, una vez; se puede volver a correr.

BEGIN;

-- El motivo nuevo en el CHECK de puntos_otorgados. Se busca la restricción
-- por definición (el nombre lo puso Postgres) y se reemplaza por la misma con
-- 'resena_temporada'.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.puntos_otorgados'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~ '\mmotivo\M'
  LOOP
    EXECUTE format('ALTER TABLE puntos_otorgados DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE puntos_otorgados ADD CONSTRAINT puntos_otorgados_motivo_check CHECK (motivo IN (
  'vista', 'watchlist', 'resena', 'resena_larga', 'sigue', 'seguido', 'like_recibido',
  'resena_temporada'
));

CREATE OR REPLACE FUNCTION puntos_por_resena_temporada()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM otorgar_puntos(NEW.user_id, 'resena_temporada',
                         NEW.series_id || ':' || NEW.season_number, 5);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'puntos_por_resena_temporada: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS puntos_por_resena_temporada ON season_reviews;
CREATE TRIGGER puntos_por_resena_temporada AFTER INSERT ON season_reviews
  FOR EACH ROW EXECUTE FUNCTION puntos_por_resena_temporada();

REVOKE EXECUTE ON FUNCTION puntos_por_resena_temporada() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ── Verificación (solo lectura) ───────────────────────────────────────────
SELECT 'trigger' AS que, tgname || ' en ' || tgrelid::regclass AS detalle
FROM pg_trigger WHERE tgname = 'puntos_por_resena_temporada'
UNION ALL
SELECT 'motivos', pg_get_constraintdef(oid)
FROM pg_constraint WHERE conname = 'puntos_otorgados_motivo_check';
