-- ================================================================
-- GLYNBOX — Puntajes de OMDb guardados (IMDb, Rotten Tomatoes, Metacritic)
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez. No borra ni cambia datos existentes.
-- ================================================================
--
-- La clave de OMDb es la gratuita: 1.000 pedidos por día. Cada ficha que se
-- generaba (web y app) le pedía a OMDb, el cupo se terminaba durante el día y
-- desde ahí ninguna ficha nueva traía puntajes hasta el día siguiente.
--
-- Con esto, `lib/omdb-cache.ts` guarda lo que trae y lo vuelve a pedir a los
-- 7 días: un título visitado mil veces es un pedido por semana.
--
-- El código tolera que esto todavía no se haya corrido: sin la tabla sigue
-- yendo directo a OMDb, como antes.
-- ================================================================

-- ----------------------------------------------------------------
-- 1. LOS PUNTAJES, UNA FILA POR TÍTULO
-- ----------------------------------------------------------------
--
-- `encontrado = false`: OMDb no tiene el título (no está, o es muy nuevo).
-- Se guarda igual, para no preguntar por él en cada visita, y se vuelve a
-- preguntar a los 7 días como cualquier otro.
--
-- Lo que falló (cupo agotado, clave, caída) NO se guarda: se reintenta.

CREATE TABLE IF NOT EXISTS public.omdb_ratings (
  imdb_id         text PRIMARY KEY CHECK (imdb_id ~ '^tt[0-9]{7,10}$'),
  encontrado      boolean NOT NULL,
  imdb_rating     numeric(3,1),
  imdb_votes      integer,
  tomato_meter    smallint,
  metacritic      smallint,
  awards          text,
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

-- Sólo el servidor (service role). Nadie la lee desde el navegador ni la app:
-- la app pasa por /api/omdb-ratings.
ALTER TABLE public.omdb_ratings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.omdb_ratings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.omdb_ratings TO service_role;

-- ----------------------------------------------------------------
-- 2. PEDIDOS A OMDb POR DÍA Y RESULTADO
-- ----------------------------------------------------------------
--
-- Los logs de Vercel no muestran las llamadas que el servidor hace a OMDb (y
-- guardan un día), así que no había forma de saber cuántas se hacían ni
-- cuándo se acababa el cupo. Esto lo cuenta.
--
--   resultado: 'ok' | 'no_encontrado' | 'limite' | 'clave_invalida' |
--              'error_http' | 'timeout' | 'error'
--
-- `primero` y `ultimo` dicen a qué hora pasó cada cosa: el `primero` de
-- 'limite' es la hora en que se acabó el cupo ese día. El día es en UTC.

CREATE TABLE IF NOT EXISTS public.omdb_pedidos (
  dia        date NOT NULL,
  resultado  text NOT NULL,
  n          integer NOT NULL DEFAULT 0,
  primero    timestamptz NOT NULL DEFAULT now(),
  ultimo     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, resultado)
);

ALTER TABLE public.omdb_pedidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.omdb_pedidos FROM anon, authenticated;
GRANT SELECT ON public.omdb_pedidos TO service_role;

CREATE OR REPLACE FUNCTION public.omdb_contar(p_resultado text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.omdb_pedidos AS p (dia, resultado, n)
  VALUES ((now() AT TIME ZONE 'UTC')::date, left(p_resultado, 32), 1)
  ON CONFLICT (dia, resultado)
  DO UPDATE SET n = p.n + 1, ultimo = now();
$$;

REVOKE EXECUTE ON FUNCTION public.omdb_contar(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.omdb_contar(text) TO service_role;

-- PostgREST cachea el esquema: sin esto las tablas nuevas pueden tardar en
-- verse desde la API.
NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------------
-- VERIFICAR (después del deploy, con algunas fichas abiertas):
-- ----------------------------------------------------------------
--
--   SELECT count(*), count(*) FILTER (WHERE encontrado) FROM public.omdb_ratings;
--
--   SELECT dia, resultado, n,
--          to_char(primero AT TIME ZONE 'America/Argentina/Buenos_Aires', 'HH24:MI') AS primero_ar
--   FROM public.omdb_pedidos ORDER BY dia DESC, n DESC;
