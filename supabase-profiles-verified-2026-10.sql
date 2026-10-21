-- ================================================================
-- GLYNBOX — Cuentas verificadas (profiles.verified)
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez. Corrido en producción el 2026-10-21.
-- ================================================================
--
-- `profiles.verified` es la única fuente del tilde azul, en la web
-- (`lib/verified.ts`) y en la app (`src/lib/verified.ts`). Se cambia desde
-- `/admin/usuarios`, que escribe con la service role.
--
-- La columna se creó a mano antes de este archivo:
--
--   ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
--
-- y nadie la podía leer: `profiles` tiene permisos por columna desde
-- `supabase-profiles-columnas-2026-09.sql`, así que una columna nueva necesita
-- su GRANT. Sin él, la app recibía `permission denied` y no mostraba ningún
-- tilde.
-- ================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;

-- 1. Pública, como is_premium: la leen visitantes y logueados.
GRANT SELECT (verified) ON public.profiles TO anon, authenticated;

-- 2. Nadie se autoverifica. Los usuarios editan su propia fila de `profiles`,
--    así que sin esto bastaría mandar `verified: true` desde la app. No tira
--    error -ignora el cambio- para no romper la edición de perfil.
CREATE OR REPLACE FUNCTION public.profiles_proteger_verified()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.verified := false;
    ELSE
      NEW.verified := OLD.verified;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_proteger_verified ON public.profiles;
CREATE TRIGGER profiles_proteger_verified
  BEFORE INSERT OR UPDATE OF verified ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_proteger_verified();

-- 3. Los primeros verificados.
UPDATE public.profiles SET verified = true
 WHERE username IN ('Ferlageok', 'elchimax');

-- Comprobar:
--   SELECT username, verified FROM public.profiles WHERE verified;
