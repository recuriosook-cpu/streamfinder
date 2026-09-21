-- ================================================================
-- GLYNBOX — Estadísticas de Google Play
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez.
-- ================================================================
--
-- Una fila por día y por paquete, con lo que Play publica en su bucket de
-- Cloud Storage. La llena `/api/cron/play-stats` una vez por día; la lee
-- `/api/admin/play` para el panel.
--
-- ── Por qué se copia en vez de consultarse al vuelo ───────────────────────
--
-- Porque los informes de Play son archivos CSV mensuales en UTF-16 dentro de
-- un bucket ajeno. Leerlos en cada carga del panel serían cuatro descargas y
-- un parseo por visita, con una latencia que no controlamos, para datos que
-- cambian una vez por día. Además así queda histórico: Google mantiene los
-- archivos, pero el día que se corte el acceso o cambien el formato, lo que ya
-- se copió sigue estando.
--
-- ── Por qué todas las métricas son NULL-ables ─────────────────────────────
--
-- Un día sin dato y un día con cero instalaciones son cosas distintas, y el
-- gráfico las dibuja distinto: un hueco no es una caída a cero. Play publica
-- los informes de instalaciones y los de la ficha por separado y no siempre
-- con los mismos días, así que una fila con instalaciones y sin visitantes es
-- normal, sobre todo en el día más reciente.
--
-- ================================================================

-- ----------------------------------------------------------------
-- 1. LA TABLA
-- ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.play_install_stats (
  -- El paquete va en la clave aunque hoy haya una sola app: el día que exista
  -- una segunda, agregarla es insertar filas y no migrar la tabla.
  package_name TEXT NOT NULL,
  fecha        DATE NOT NULL,

  -- "Daily Device Installs": instalaciones en dispositivos ese día. Incluye
  -- reinstalaciones, así que no es lo mismo que usuarios nuevos.
  instalaciones   INTEGER,

  -- "Daily Device Uninstalls".
  desinstalaciones INTEGER,

  -- "Active Device Installs": dispositivos con la app instalada que la usaron
  -- al menos una vez en los últimos 30 días. Es un stock, no un flujo: no se
  -- suma entre días, se mira el último.
  base_instalada  INTEGER,

  -- "Store Listing Visitors": gente que vio la ficha en Play sin tener ya la
  -- app instalada. Es el denominador de la conversión.
  visitantes_ficha INTEGER,

  -- "Store Listing Acquisitions": de esos visitantes, los que instalaron.
  adquisiciones   INTEGER,

  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (package_name, fecha)
);

-- El panel siempre pide "los últimos N días de esta app", en orden.
CREATE INDEX IF NOT EXISTS play_install_stats_fecha_idx
  ON public.play_install_stats (package_name, fecha DESC);

-- ----------------------------------------------------------------
-- 2. PERMISOS
-- ----------------------------------------------------------------
--
-- Mismo criterio que las tablas de analytics: esto es información de negocio y
-- no tiene por qué poder leerla cualquiera con la anon key, que viaja en el
-- bundle del navegador. El panel la lee por `/api/admin/play`, con service
-- role y detrás del chequeo de admin.
--
-- RLS habilitado y sin políticas = nadie pasa salvo la service role, que
-- saltea RLS por diseño. El REVOKE es la segunda capa, porque Supabase otorga
-- permisos por default sobre lo que se crea en `public`.

ALTER TABLE public.play_install_stats ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.play_install_stats FROM anon, authenticated;

-- ----------------------------------------------------------------
-- 3. VERIFICAR
-- ----------------------------------------------------------------
--
-- Después de la primera corrida del cron:
--
--   SELECT fecha, instalaciones, desinstalaciones, base_instalada,
--          visitantes_ficha, adquisiciones
--     FROM public.play_install_stats
--    ORDER BY fecha DESC
--    LIMIT 30;
--
-- Cuántos días hay cargados y hasta cuándo:
--
--   SELECT package_name, count(*) AS dias, min(fecha), max(fecha),
--          max(actualizado_en)
--     FROM public.play_install_stats
--    GROUP BY package_name;
--
-- El cron se puede disparar a mano sin esperar al horario:
--
--   curl -H "Authorization: Bearer $CRON_SECRET" \
--        https://glynbox.com/api/cron/play-stats
