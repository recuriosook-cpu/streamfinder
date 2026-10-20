-- ================================================================
-- GLYNBOX — Ganancias de AdMob de Potion Bottle
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez.
-- ================================================================
--
-- Una fila por día, formato de anuncio y país, con lo que devuelve el informe
-- de red de AdMob. La llena `/api/cron/admob-stats` una vez por día; la lee
-- `/api/admin/admob` para la sección de AdMob de `/admin/potion`.
--
-- Va en el proyecto de Glynbox y no en el del juego por lo mismo que
-- `play_install_stats`: son datos del panel, no del juego, y el juego no tiene
-- por qué poder leerlos.
--
-- ── Por qué día × formato × país en una sola tabla ────────────────────────
--
-- Porque todo lo que muestra el panel es una suma de esto: la ganancia por día
-- suma formatos y países, la tabla de formatos suma días y países, la de
-- países suma días y formatos. Con una tabla por vista, los totales de cada
-- una podrían no coincidir.
--
-- ── Por qué en micros ─────────────────────────────────────────────────────
--
-- Así lo da la API (millonésimas de dólar), y un entero no acumula errores de
-- redondeo al sumar miles de filas. El eCPM se calcula al leer, nunca se
-- guarda: el promedio de los eCPM no es el eCPM del total.
--
-- ================================================================

CREATE TABLE IF NOT EXISTS public.admob_stats (
  -- El ID de la app en AdMob (`ca-app-pub-…~…`). En la clave aunque hoy haya
  -- una sola, igual que el paquete en `play_install_stats`.
  app_id   TEXT NOT NULL,
  -- Día en la zona horaria de la cuenta de AdMob, no de Argentina.
  fecha    DATE NOT NULL,
  -- Como lo nombra AdMob: REWARDED, INTERSTITIAL, BANNER, ...
  formato  TEXT NOT NULL,
  -- ISO de dos letras. `ZZ` = AdMob no supo de dónde.
  pais     TEXT NOT NULL CHECK (pais ~ '^[A-Z]{2}$'),

  -- Ganancia estimada, en millonésimas de dólar.
  ganancia_micros          BIGINT  NOT NULL DEFAULT 0,
  impresiones              INTEGER NOT NULL DEFAULT 0,
  solicitudes              INTEGER NOT NULL DEFAULT 0,
  solicitudes_con_anuncio  INTEGER NOT NULL DEFAULT 0,
  clics                    INTEGER NOT NULL DEFAULT 0,

  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (app_id, fecha, formato, pais)
);

-- El panel pide "esta app, desde tal día".
CREATE INDEX IF NOT EXISTS admob_stats_fecha_idx
  ON public.admob_stats (app_id, fecha DESC);

-- Cerrada para todos menos la service role, como `play_install_stats`: el
-- panel la lee por `/api/admin/admob`, detrás del chequeo de admin.
ALTER TABLE public.admob_stats ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admob_stats FROM anon, authenticated;

-- ----------------------------------------------------------------
-- VERIFICAR, después de la primera corrida del cron:
-- ----------------------------------------------------------------
--
--   SELECT fecha, sum(ganancia_micros) / 1e6 AS ganancia_usd, sum(impresiones)
--     FROM public.admob_stats
--    GROUP BY fecha
--    ORDER BY fecha DESC
--    LIMIT 30;
--
-- El cron se puede disparar a mano sin esperar al horario:
--
--   curl -H "Authorization: Bearer $CRON_SECRET" \
--        https://www.glynbox.com/api/cron/admob-stats
