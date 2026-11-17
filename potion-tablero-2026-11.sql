-- El tablero de /admin/potion (noviembre 2026).
--
-- Se corre en el proyecto de Supabase DEL JUEGO (vzrflmiyvjjheqeirksk), no en
-- el de Glynbox. Corrida el 2026-11-16.
--
-- Cuatro cosas:
--
--   1. `potion_eventos.pais`: el país desde el que llegó cada tanda, que el
--      servidor saca del encabezado `cf-ipcountry` que pone Cloudflare delante
--      de Supabase. Sólo el código de dos letras: la IP no se guarda en ningún
--      lado. Lo declara la política de privacidad desde el 16/11.
--   2. `potion_registrar` lo completa al guardar. Igual que la versión
--      anterior en todo lo demás (misma lista de eventos, mismos topes).
--   3. `potion_aparatos_marca`: los aparatos que se marcaron a mano como de
--      prueba (los teléfonos propios y los testers) o como reales (para
--      corregir una clasificación automática equivocada). Una marca a mano
--      manda sobre la regla automática. Nunca se borra un evento.
--   4. `potion_versiones_tienda`: desde cuándo está cada versión de iPhone en
--      la App Store. Un iPhone es real si jugó con una versión de la tienda
--      después de que esa versión salió; lo de antes es de TestFlight o de la
--      revisión de Apple. La ruta del panel agrega sola las versiones nuevas
--      que ve en la API pública de iTunes.
--   5. `potion_aparatos()`: un renglón por aparato, para el listado. Sólo la
--      puede llamar la clave secreta (el panel); la clave pública del juego no.

-- ── 1. El país ─────────────────────────────────────────────────────────────

ALTER TABLE public.potion_eventos ADD COLUMN IF NOT EXISTS pais TEXT;

-- ── 2. potion_registrar con país ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.potion_registrar(instalacion text, version text, plataforma text, eventos jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  forma_uuid CONSTANT TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  guardados  INTEGER;
  -- El país de la conexión, de Cloudflare. Nunca la IP.
  pais_req   TEXT;
BEGIN
  IF instalacion IS NULL OR instalacion !~ forma_uuid THEN
    RETURN 0;
  END IF;
  IF eventos IS NULL OR jsonb_typeof(eventos) <> 'array' THEN
    RETURN 0;
  END IF;
  -- El juego manda como mucho 100 por pedido. Más que eso no es el juego.
  IF jsonb_array_length(eventos) > 200 THEN
    RETURN 0;
  END IF;

  -- Si el encabezado no está o no se puede leer, el evento se guarda igual,
  -- sin país. `XX` es "desconocido" y `T1` es Tor: tampoco son un país.
  BEGIN
    pais_req := upper(current_setting('request.headers', true)::json->>'cf-ipcountry');
  EXCEPTION WHEN others THEN
    pais_req := NULL;
  END;
  IF pais_req IS NULL OR pais_req !~ '^[A-Z]{2}$' OR pais_req IN ('XX', 'T1') THEN
    pais_req := NULL;
  END IF;

  INSERT INTO public.potion_eventos
    (id, cuando, instalacion, sesion, nombre, nivel, props, version, plataforma, pais)
  SELECT
    (e->>'id')::uuid,
    -- Nunca en el futuro: un reloj adelantado no puede inventar días.
    LEAST(to_timestamp((e->>'t')::double precision / 1000.0), now()),
    potion_registrar.instalacion::uuid,
    (e->>'s')::uuid,
    e->>'n',
    -- Dos CASE y no un AND: Postgres no promete el orden de un AND, y una
    -- conversión que falla tiraría la tanda entera.
    CASE WHEN jsonb_typeof(e->'p'->'nivel') = 'number' THEN
      CASE WHEN (e->'p'->>'nivel')::numeric BETWEEN 1 AND 99999
           THEN (e->'p'->>'nivel')::numeric::integer END
    END,
    e->'p',
    left(coalesce(potion_registrar.version, ''), 20),
    CASE WHEN potion_registrar.plataforma IN ('android', 'ios', 'web')
         THEN potion_registrar.plataforma ELSE '' END,
    pais_req
  FROM jsonb_array_elements(eventos) AS e
  WHERE jsonb_typeof(e) = 'object'
    AND (e->>'id') ~ forma_uuid
    AND (e->>'s')  ~ forma_uuid
    AND CASE WHEN jsonb_typeof(e->'t') = 'number'
             THEN (e->>'t')::double precision BETWEEN 1.5e12 AND 1e13
             ELSE false END
    AND jsonb_typeof(e->'p') = 'object'
    -- Los datos de un evento son media docena de números. Un tope bajo es lo
    -- que impide usar esta tabla para guardar otra cosa.
    AND length((e->'p')::text) <= 400
    AND (e->>'n') IN (
      'app_abre',
      'app_pausa',
      'nivel_empieza',
      'nivel_gana',
      'nivel_reinicia',
      'nivel_sin_salida',
      'comodin',
      'panel_sin_monedas',
      'panel_sin_vidas',
      -- Los duelos salieron del juego en la 1.2.0, pero los teléfonos con versiones
      -- viejas los siguen mandando. Quedan hasta que no quede ninguna.
      'duelo_empieza',
      'duelo_termina',
      'duelo_abandona',
      -- El encargo de Daisy, desde la 1.2.0.
      'mision_abre',
      'mision_empieza',
      'mision_gana',
      'mision_pierde',
      'mision_reintenta',
      'mision_cadena_rota',
      'mision_premio',
      -- La ruleta diaria, desde la 1.2.0.
      'ruleta_abre',
      'ruleta_gira',
      'ruleta_premio',
      -- Los cajones de la botica, desde la 1.2.0.
      'cajones_abre',
      'cajones_elige',
      'cajones_premio',
      'pase_abre',
      'pase_escalon',
      'pase_completo',
      'pase_cobra',
      'pase_proximamente',
      'pase_candado',
      'manana_muestra',
      'notificacion_abre',
      'calificacion_pide',
      'pista_regalo_ofrece',
      'pista_regalo_usa',
      -- El camino hasta el primer vertido, y los errores que tiran la app.
      'intro_fin',
      'inicio_visto',
      'nivel_mostrado',
      'error',
      -- Desde la 1.3.0: los anuncios, el formulario de consentimiento y los
      -- tropiezos del nivel 1. Dónde estaba al cerrar y la marca de robot van
      -- adentro de `app_pausa` y `app_abre`, que ya estaban.
      'anuncio_muestra',
      'anuncio_cierra',
      'consentimiento',
      'guia_error'
    )
  -- Una tanda que llega dos veces no se guarda dos veces. Ver la columna `id`.
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS guardados = ROW_COUNT;
  RETURN guardados;
END;
$function$;

-- ── 3. Marcas a mano ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.potion_aparatos_marca (
  instalacion    UUID PRIMARY KEY,
  -- 'prueba': va a la pestaña de prueba. 'real': cuenta como jugador aunque
  -- la regla automática diga otra cosa.
  clase          TEXT NOT NULL CHECK (clase IN ('prueba', 'real')),
  motivo         TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.potion_aparatos_marca ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.potion_aparatos_marca FROM anon, authenticated;

-- Los confirmados el 16/11.
INSERT INTO public.potion_aparatos_marca (instalacion, clase, motivo) VALUES
  ('fa0efeb2-1649-4a8f-91f6-a4071f471232', 'prueba', 'Tester desde antes del lanzamiento (ganó el nivel 1000)'),
  ('256e8b64-d78d-4bc8-8ac4-fb67922d26a5', 'prueba', 'iPhone propio (TestFlight)'),
  ('53b3a649-cc64-4f3c-9d69-3649e4667de2', 'prueba', 'Tester desde antes del lanzamiento'),
  ('00de1a9a-9afa-4591-96b1-8d236215ef92', 'prueba', 'Tester desde antes del lanzamiento'),
  ('f7370b89-c7e4-4f76-aa45-41a49c489724', 'prueba', 'Tester desde antes del lanzamiento'),
  ('7dda3f3d-45ec-420b-8621-70053061533b', 'prueba', 'Teléfono de prueba (recibe cada versión)')
ON CONFLICT (instalacion) DO NOTHING;

-- ── 4. Versiones de la App Store ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.potion_versiones_tienda (
  plataforma TEXT NOT NULL CHECK (plataforma IN ('ios', 'android')),
  -- Sin el número de build: '1.1.2', como la informa la tienda.
  version    TEXT NOT NULL,
  desde      TIMESTAMPTZ NOT NULL,
  visto_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plataforma, version)
);
ALTER TABLE public.potion_versiones_tienda ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.potion_versiones_tienda FROM anon, authenticated;

-- La primera: `releaseDate` de https://itunes.apple.com/lookup?id=6827137001.
INSERT INTO public.potion_versiones_tienda (plataforma, version, desde)
VALUES ('ios', '1.1.2', '2026-11-10T08:00:00Z')
ON CONFLICT DO NOTHING;

-- ── 5. Un renglón por aparato ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.potion_aparatos(p_zona text DEFAULT 'America/Argentina/Buenos_Aires')
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
WITH
e AS (
  SELECT instalacion, plataforma, recibido, nombre, nivel, version, pais, props,
         (recibido AT TIME ZONE p_zona)::date AS dia
    FROM public.potion_eventos
   WHERE instalacion IS NOT NULL
),
-- La versión y la plataforma con las que jugó por última vez.
ultimo_ev AS (
  SELECT DISTINCT ON (instalacion) instalacion, version, plataforma
    FROM e ORDER BY instalacion, recibido DESC
),
-- El último país conocido. Los eventos de antes del 16/11 no lo tienen.
ultimo_pais AS (
  SELECT DISTINCT ON (instalacion) instalacion, pais
    FROM e WHERE pais IS NOT NULL ORDER BY instalacion, recibido DESC
),
-- El nivel más alto ganado, cuándo y con qué versión (la primera vez).
mejor AS (
  SELECT DISTINCT ON (instalacion) instalacion, nivel, recibido, version
    FROM e WHERE nombre = 'nivel_gana' AND nivel IS NOT NULL
   ORDER BY instalacion, nivel DESC, recibido ASC
),
-- Cada versión con la que jugó: primer y último evento, en milisegundos.
versiones AS (
  SELECT instalacion,
         jsonb_object_agg(v, jsonb_build_array(mn, mx)) AS versiones
    FROM (SELECT instalacion, coalesce(version, '') AS v,
                 floor(extract(epoch FROM min(recibido)) * 1000) AS mn,
                 floor(extract(epoch FROM max(recibido)) * 1000) AS mx
            FROM e GROUP BY 1, 2) x
   GROUP BY instalacion
),
resumen AS (
  SELECT instalacion,
         min(recibido) AS primero,
         max(recibido) AS ultimo,
         count(*) AS eventos,
         count(DISTINCT dia) AS dias,
         -- Hasta dónde llegó: `app_abre` trae el nivel alcanzado (pasado el
         -- último, uno más), y los inicios que no son repeticiones.
         max(nivel) FILTER (WHERE nombre = 'app_abre'
                               OR (nombre IN ('nivel_empieza', 'nivel_mostrado')
                                   AND props->>'repite' IS DISTINCT FROM 'true')) AS nivel_actual,
         bool_or(nombre = 'app_abre' AND props->>'robot' = 'true') AS robot
    FROM e GROUP BY instalacion
)
SELECT coalesce(jsonb_agg(jsonb_build_object(
         'id', r.instalacion,
         'plataforma', u.plataforma,
         'version', u.version,
         'pais', p.pais,
         'primero', r.primero,
         'ultimo', r.ultimo,
         'eventos', r.eventos,
         'dias', r.dias,
         'nivelActual', r.nivel_actual,
         'maxGanado', m.nivel,
         'ganadoEn', m.recibido,
         'ganadoVersion', m.version,
         'robot', r.robot,
         'versiones', v.versiones,
         'marca', k.clase,
         'marcaMotivo', k.motivo
       )), '[]'::jsonb)
  FROM resumen r
  JOIN ultimo_ev u USING (instalacion)
  LEFT JOIN ultimo_pais p USING (instalacion)
  LEFT JOIN mejor m USING (instalacion)
  LEFT JOIN versiones v USING (instalacion)
  LEFT JOIN public.potion_aparatos_marca k USING (instalacion);
$function$;

-- Supabase le da EXECUTE a anon y authenticated en cada función nueva de
-- `public`, y la clave pública viaja dentro del juego. Sólo el panel.
REVOKE ALL ON FUNCTION public.potion_aparatos(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.potion_aparatos(text) TO service_role;
