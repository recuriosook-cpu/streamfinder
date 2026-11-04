-- Descargas de App Store por día y por país, para /admin/potion.
--
-- La llena /api/cron/appstore-stats una vez por día con los informes de
-- ventas de App Store Connect (Sales and Trends, SALES / SUMMARY / DAILY).
-- Es el equivalente de play_install_stats_pais para iPhone, con una
-- diferencia: Apple no informa desinstalaciones ni cuántos aparatos tienen la
-- app, así que acá sólo hay descargas.
--
-- Se corre en el proyecto de Supabase de GLYNBOX (ddoqsdgiggkhbsulxncs),
-- donde viven las tablas de Play y AdMob. Corrida el 2026-11-04.

CREATE TABLE IF NOT EXISTS public.appstore_descargas (
  -- El Apple ID numérico de la app (Potion Bottle: 6827137001).
  app_id       TEXT NOT NULL,
  -- El día del informe de Apple. Apple arma los días en hora del Pacífico.
  fecha        DATE NOT NULL,
  -- Código ISO de dos letras, como lo manda Apple en "Country Code".
  pais         TEXT NOT NULL CHECK (pais ~ '^[A-Z]{2}$'),
  -- Primeras descargas (tipos de producto 1, 1F, 1T, 1E, 1EP, 1EU).
  descargas    INTEGER NOT NULL DEFAULT 0,
  -- Volver a bajarla con la misma cuenta de Apple (tipos 3, 3F, 3T).
  redescargas  INTEGER NOT NULL DEFAULT 0,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, fecha, pais)
);

CREATE INDEX IF NOT EXISTS appstore_descargas_fecha_idx
  ON public.appstore_descargas (app_id, fecha DESC);

-- Sólo la lee y la escribe el servidor con la service role.
ALTER TABLE public.appstore_descargas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.appstore_descargas FROM anon, authenticated;
