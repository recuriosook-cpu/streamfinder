-- ── Tokens de "Iniciar sesión con Apple" ───────────────────────────────────
--
-- Apple exige que, cuando alguien borra su cuenta, la app le revoque el acceso
-- que le dio con "Iniciar sesión con Apple" (guía 5.1.1(v) de la App Store).
-- Revocar pide un refresh token de Apple, y Supabase no lo guarda: lo entrega
-- una sola vez, al iniciar sesión. Esta tabla lo guarda para poder usarlo
-- después, desde /api/delete-account.
--
-- Una fila por usuario y por client_id: el mismo usuario puede tener uno de
-- la app (`com.glynbox.app`) y otro de la web (el Services ID), y cada uno se
-- revoca con su propio client_id.
--
-- ── Privacidad ─────────────────────────────────────────────────────────────
--
-- El refresh token es una credencial. Nadie lo lee desde un cliente: RLS
-- prendido y sin políticas, y sin permisos para anon ni authenticated. Sólo
-- la service role (las rutas de la web) lee y escribe. Se borra sola con el
-- usuario (ON DELETE CASCADE).
--
-- Correr entero, una vez. Se puede volver a correr.

BEGIN;

CREATE TABLE IF NOT EXISTS public.apple_tokens (
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id     text        NOT NULL,
  refresh_token text        NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);

ALTER TABLE public.apple_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.apple_tokens FROM anon, authenticated;

COMMIT;
