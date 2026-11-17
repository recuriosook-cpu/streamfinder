-- Cada corrida de /api/cron/appstore-stats y qué contestó Apple, día por día.
--
-- Se corre en el proyecto de Supabase de GLYNBOX (ddoqsdgiggkhbsulxncs),
-- junto a appstore_descargas. Corrida el 2026-11-16.
--
-- Antes la copia terminaba "bien" sin dejar rastro, y una tabla de descargas
-- vacía no decía si Apple no tenía datos, si la copia no corría o si el
-- informe venía pero no se reconocía la app. Ahora cada corrida deja un
-- renglón y /admin/potion lo lee para avisar.
--
-- `dias` es un arreglo con un objeto por día pedido:
--   { fecha, estado: 'ok' | 'vacio' | 'sin_permiso' | 'error', http,
--     filas (renglones del informe), unidades (descargas de la app),
--     apps: [{ id, titulo, unidades }] (qué apps venían en el informe),
--     detalle (el texto de Apple cuando no es 'ok') }

CREATE TABLE IF NOT EXISTS public.appstore_corridas (
  id          BIGSERIAL PRIMARY KEY,
  corrida_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_id      TEXT NOT NULL,
  ok          BOOLEAN NOT NULL,
  motivo      TEXT,
  dias        JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS appstore_corridas_fecha_idx
  ON public.appstore_corridas (app_id, corrida_en DESC);

-- Sólo la lee y la escribe el servidor con la service role.
ALTER TABLE public.appstore_corridas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.appstore_corridas FROM anon, authenticated;
