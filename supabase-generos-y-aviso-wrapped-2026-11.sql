-- ================================================================
-- GLYNBOX — Géneros de `watched` y aviso del Wrapped
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez. No toca datos (lo llena el script).
-- ================================================================
--
-- 1. Géneros. `watched.genre_ids` estaba vacío ('{}') en casi todas las filas
--    (169.681 de 169.689 al 2026-11-21: 11.080 títulos distintos). Los
--    completa lib/generos-watched.ts, una vez con
--    `npx -y tsx scripts/completar-generos.ts` y después todos los días con
--    /api/cron/generos. Dos funciones, sólo para la service role:
--
--      watched_titulos_sin_genero(p_limite)  los títulos distintos que faltan
--      watched_completar_generos(p_filas)    los guarda: una sola UPDATE por
--                                            tanda, para todas las filas de
--                                            cada título que sigan vacías.
--
--    `watched` no tiene índice por título (el único empieza por user_id): una
--    UPDATE por título recorrería la tabla entera 11.000 veces. Por tanda es
--    un recorrido por tanda.
--
-- 2. Aviso del Wrapped (lib/wrapped-aviso.ts): el 1 de diciembre a las 19 de
--    Argentina, una push a cada uno que tenga Wrapped.
--
--      push_envios.tipo        suma 'wrapped'.
--      push_wrapped_enviados   una fila por persona y año: es lo que hace que
--                              salga una sola vez aunque el cron corra de nuevo.
--      wrapped_destinatarios   quiénes tienen Wrapped ese año: 5 o más vistas
--                              (la misma regla que wrapped_anual), sin
--                              "Ocultar actividad", sin bloquear, con @.
--
-- ================================================================

-- ── 1. Géneros ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.watched_titulos_sin_genero(p_limite integer DEFAULT NULL)
RETURNS TABLE (media_type text, media_id integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT w.media_type, w.media_id
    FROM watched w
   WHERE w.genre_ids IS NULL OR cardinality(w.genre_ids) = 0
   ORDER BY w.media_type, w.media_id
   LIMIT p_limite
$$;

-- p_filas: [{"media_type": "movie", "media_id": 603, "genre_ids": [28, 878]}, …]
-- Devuelve cuántas filas de `watched` cambió.
CREATE OR REPLACE FUNCTION public.watched_completar_generos(p_filas jsonb)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_filas integer;
BEGIN
  UPDATE watched w
     SET genre_ids = v.genre_ids
    FROM jsonb_to_recordset(p_filas) AS v(media_type text, media_id integer, genre_ids integer[])
   WHERE w.media_type = v.media_type
     AND w.media_id = v.media_id
     AND (w.genre_ids IS NULL OR cardinality(w.genre_ids) = 0)
     AND cardinality(v.genre_ids) > 0;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas;
END;
$$;

REVOKE ALL ON FUNCTION public.watched_titulos_sin_genero(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.watched_completar_generos(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.watched_titulos_sin_genero(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.watched_completar_generos(jsonb) TO service_role;

-- ── 2. Aviso del Wrapped ──────────────────────────────────────────────────

ALTER TABLE public.push_envios DROP CONSTRAINT IF EXISTS push_envios_tipo_check;
ALTER TABLE public.push_envios ADD CONSTRAINT push_envios_tipo_check
  CHECK (tipo = ANY (ARRAY['recomendacion', 'semanal', 'dia1', 'wrapped']));

CREATE TABLE IF NOT EXISTS public.push_wrapped_enviados (
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anio      integer     NOT NULL,
  envio_id  bigint      REFERENCES public.push_envios(id) ON DELETE SET NULL,
  aparatos  integer     NOT NULL DEFAULT 0,
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, anio)
);
-- Sólo la service role (RLS sin políticas).
ALTER TABLE public.push_wrapped_enviados ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.wrapped_destinatarios(p_anio integer)
RETURNS TABLE (user_id uuid, username text, total integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, count(*)::integer
    FROM watched w
    JOIN profiles p ON p.id = w.user_id
   WHERE w.watched_at >= make_timestamptz(p_anio,     1, 1, 0, 0, 0, 'America/Argentina/Buenos_Aires')
     AND w.watched_at <  make_timestamptz(p_anio + 1, 1, 1, 0, 0, 0, 'America/Argentina/Buenos_Aires')
     AND wrapped_vista_cuenta(w.origen, w.watched_at, p.onboarding_completed_at)
     AND p.blocked IS NOT TRUE
     AND p.hide_activity IS NOT TRUE
     AND p.username IS NOT NULL
   GROUP BY p.id, p.username
  HAVING count(*) >= 5
$$;

REVOKE ALL ON FUNCTION public.wrapped_destinatarios(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wrapped_destinatarios(integer) TO service_role;

-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura):
--   SELECT count(*) FROM wrapped_destinatarios(2026);
--   SELECT count(*) FILTER (WHERE cardinality(genre_ids) > 0), count(*) FROM watched;
-- ----------------------------------------------------------------
