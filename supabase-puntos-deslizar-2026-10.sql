-- ================================================================
-- GLYNBOX — Las vistas del modo deslizar no suman puntos
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez.
-- ================================================================
--
-- El modo deslizar de la app marca "la vi" con cada "Me gustó" y cada "No me
-- gustó", y anota `watched.origen = 'deslizar'`. Sin esto, pasar tarjetas
-- daba 3 puntos por película y 5 por serie: cientos de puntos en minutos.
--
-- Esas vistas ni suman ni se anotan en `puntos_otorgados`. Que no se anoten
-- importa: si después la desmarca y la vuelve a marcar a mano desde la ficha,
-- suma como cualquier vista, una vez. El "ya vi" del onboarding sigue
-- sumando (no lleva origen). La watchlist desde el modo deslizar también
-- sigue sumando su punto, como en cualquier otro lado.
--
-- Es la misma función de supabase-puntos-etapa2-2026-09.sql con una línea
-- más al principio. El trigger no cambia.
--
-- ================================================================

CREATE OR REPLACE FUNCTION puntos_por_vista()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.origen = 'deslizar' THEN
    RETURN NEW;
  END IF;

  PERFORM otorgar_puntos(
    NEW.user_id, 'vista', NEW.media_type || ':' || NEW.media_id,
    CASE WHEN NEW.origen = 'letterboxd' THEN 0 WHEN NEW.media_type = 'tv' THEN 5 ELSE 3 END);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'puntos_por_vista: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura): la función tiene que mostrar el IF de 'deslizar'.
-- ----------------------------------------------------------------

SELECT pg_get_functiondef('puntos_por_vista()'::regprocedure) LIKE '%deslizar%' AS deslizar_sin_puntos;
