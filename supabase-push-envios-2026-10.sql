-- ================================================================
-- GLYNBOX — Envíos masivos de push ("Ferlage te recomienda ver")
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez.
-- ================================================================
--
-- Una fila por envío desde `/admin/recomendaciones`: a todos los aparatos de
-- `user_devices`, o de prueba sólo a los de Ferlageok. La escribe y la lee
-- `/api/admin/recomendaciones/notificar` con la service role.
--
--   · El límite de 3 por semana cuenta las filas con `prueba = false` de los
--     últimos 7 días. Las de prueba no cuentan.
--   · `tickets` guarda el id que Expo devolvió por cada token aceptado. Expo
--     confirma la entrega recién en el "recibo", minutos después, y ahí es
--     donde suele decir que un token es de alguien que desinstaló. El panel
--     pide los recibos al cargar el historial (`recibos_revisados_en`), borra
--     esos tokens de `user_devices` y suma los fallos.
--
-- ================================================================

CREATE TABLE IF NOT EXISTS public.push_envios (
  id               BIGSERIAL PRIMARY KEY,
  tipo             TEXT NOT NULL DEFAULT 'recomendacion' CHECK (tipo IN ('recomendacion')),
  prueba           BOOLEAN NOT NULL DEFAULT false,

  -- Qué se recomendó. La recomendación puede borrarse después; el envío queda.
  recomendacion_id BIGINT REFERENCES public.creator_recommendations(id) ON DELETE SET NULL,
  media_type       TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id          INTEGER NOT NULL,

  titulo           TEXT NOT NULL,   -- el de la notificación
  cuerpo           TEXT NOT NULL,   -- el nombre de la película o serie
  url              TEXT NOT NULL,   -- la ruta que abre la app: /movie/{id} o /tv/{id}

  destinatarios    INTEGER NOT NULL DEFAULT 0,  -- tokens a los que se intentó mandar
  enviados         INTEGER,                     -- aceptados por Expo
  fallidos         INTEGER,                     -- rechazados, en el envío o en el recibo
  tokens_borrados  INTEGER NOT NULL DEFAULT 0,  -- de gente que desinstaló

  tickets              JSONB,          -- [{ "id": "...", "token": "ExponentPushToken[...]" }]
  recibos_revisados_en TIMESTAMPTZ,

  enviado_por      UUID,
  creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_envios_creado_idx
  ON public.push_envios (creado_en DESC);

-- Cerrada para todos menos la service role, como las tablas de analytics: la
-- anon key viaja en el bundle.
ALTER TABLE public.push_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_envios FROM anon, authenticated;

-- ----------------------------------------------------------------
-- VERIFICAR
-- ----------------------------------------------------------------
--
--   SELECT id, prueba, cuerpo, destinatarios, enviados, fallidos,
--          tokens_borrados, creado_en
--     FROM public.push_envios
--    ORDER BY creado_en DESC;
