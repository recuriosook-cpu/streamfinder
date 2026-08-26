-- =========================================================
-- client_errors — dónde van a parar los errores que el usuario no ve
-- Correr en Supabase Dashboard → SQL Editor
-- =========================================================
--
-- Por qué existe
-- --------------
-- Tres veces se perdió un bug adentro de un `catch` que sólo hacía
-- `console.warn`. En un build de producción de la app nativa eso no va a
-- ningún lado: no hay consola que mirar. El caso que la motivó es el de
-- `user_devices`, que estuvo vacía sin que nadie se enterara.
--
-- La regla que resuelve esto no es "no tragarse errores" —hay lugares donde
-- tragárselos es exactamente lo correcto, porque el usuario no puede hacer nada
-- con el error y avisarle sólo empeora su día—. La regla es: **tragárselo para
-- el usuario, no para nosotros**. Esta tabla es el "para nosotros".
--
-- Qué NO es
-- ---------
-- No es analytics: eso ya existe y vive en `/api/track` con su lista blanca.
-- Acá no van eventos de producto, van fallas. Si algo se puede contar, va allá.
--
-- Tampoco es un reemplazo de un Sentry. Es lo mínimo para que un `catch` deje
-- rastro consultable, sin sumar un servicio ni un SDK.

CREATE TABLE IF NOT EXISTS client_errors (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,

  -- NOT NULL a propósito: la policy de INSERT compara contra `auth.uid()`, así
  -- que sin sesión no se puede escribir igual. Todos los `catch` que reportan
  -- hoy tienen el userId a mano.
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Quién reporta: 'push.sync', 'push.register', 'onboarding.status'…
  -- Con punto, de lo general a lo particular, para poder filtrar por prefijo.
  scope       text        NOT NULL,

  -- El mensaje del error, ya recortado por el cliente.
  message     text        NOT NULL,

  -- Lo que haga falta para entenderlo sin adivinar: el `reason` que devolvió
  -- una función, el código de Postgres, el permiso que había en ese momento.
  -- Nunca datos personales: el cliente sólo manda lo que arma a mano.
  context     jsonb,

  platform    text        NOT NULL CHECK (platform IN ('android', 'ios', 'web')),

  -- La versión de la app. Sin esto no se puede saber si un error sigue vivo o
  -- es de un build viejo que ya nadie tiene.
  app_version text,

  created_at  timestamptz NOT NULL DEFAULT now()
);

-- El acceso real es "los errores de tal cosa, los más nuevos primero".
CREATE INDEX IF NOT EXISTS client_errors_scope_idx
  ON client_errors (scope, created_at DESC);

CREATE INDEX IF NOT EXISTS client_errors_created_idx
  ON client_errors (created_at DESC);

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own errors" ON client_errors;

-- Sólo INSERT, y sólo el propio. Es todo lo que necesita el cliente.
CREATE POLICY "Users insert own errors"
  ON client_errors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Sin policy de SELECT a propósito.
--
-- Estos son mensajes de error crudos, escritos para nosotros y no redactados
-- para nadie. Se leen desde el dashboard o con la service role, que saltean
-- RLS. Un usuario no tiene por qué poder leer ni los suyos.

-- ── Cómo se lee ────────────────────────────────────────────────────────────
--
--   -- ¿Qué está fallando y cuánto?
--   SELECT scope, message, count(*), max(created_at) AS ultimo
--   FROM client_errors
--   WHERE created_at > now() - interval '7 days'
--   GROUP BY scope, message
--   ORDER BY count(*) DESC;
--
--   -- El detalle de lo último de push
--   SELECT created_at, user_id, message, context, app_version
--   FROM client_errors
--   WHERE scope LIKE 'push.%'
--   ORDER BY created_at DESC
--   LIMIT 50;
--
-- ── Limpieza ───────────────────────────────────────────────────────────────
--
-- No hay retención automática. Si algún día molesta el tamaño:
--
--   DELETE FROM client_errors WHERE created_at < now() - interval '90 days';
--
-- Con el volumen de hoy —116 usuarios— esto no crece.
