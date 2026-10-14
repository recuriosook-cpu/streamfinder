-- ================================================================
-- GLYNBOX — Estadísticas de Google Play por país
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez.
-- ================================================================
--
-- La misma idea que `supabase-play-stats.sql`, con un país más en la clave. La
-- llena `/api/cron/play-stats` desde los `installs_<paquete>_<mes>_country.csv`
-- del bucket de Play, en la misma corrida que la tabla por día. La lee
-- `/api/admin/play` para la tabla de países de `/admin/potion`.
--
-- Va en otra tabla y no como columna de `play_install_stats` porque las dos
-- tienen claves distintas: allá una fila es un día de una app, acá un día de
-- una app en un país. Mezclarlas obligaría a cada consulta del total a
-- acordarse de filtrar `pais IS NULL`.
--
-- ================================================================

CREATE TABLE IF NOT EXISTS public.play_install_stats_pais (
  package_name TEXT NOT NULL,
  fecha        DATE NOT NULL,

  -- Código ISO de dos letras. `ZZ` = Play no supo de dónde era: se guarda
  -- para que la suma de los países siga dando el total del día.
  pais         TEXT NOT NULL CHECK (pais ~ '^[A-Z]{2}$'),

  -- Mismas métricas y mismo significado que en `play_install_stats`. NULL es
  -- "sin dato", no cero.
  instalaciones    INTEGER,
  desinstalaciones INTEGER,
  -- Stock, no flujo: no se suma entre días.
  base_instalada   INTEGER,

  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (package_name, fecha, pais)
);

-- El panel pide "esta app, desde tal día".
CREATE INDEX IF NOT EXISTS play_install_stats_pais_fecha_idx
  ON public.play_install_stats_pais (package_name, fecha DESC);

-- Mismo criterio que `play_install_stats`: cerrada para todos menos la
-- service role, que el panel usa detrás del chequeo de admin.
ALTER TABLE public.play_install_stats_pais ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.play_install_stats_pais FROM anon, authenticated;

-- ----------------------------------------------------------------
-- VERIFICAR, después de la próxima corrida del cron:
-- ----------------------------------------------------------------
--
--   SELECT pais, sum(instalaciones) AS instalaciones,
--          sum(desinstalaciones) AS desinstalaciones
--     FROM public.play_install_stats_pais
--    WHERE package_name = 'com.potionbottle.watersort'
--      AND fecha >= current_date - 29
--    GROUP BY pais
--    ORDER BY 2 DESC NULLS LAST;
