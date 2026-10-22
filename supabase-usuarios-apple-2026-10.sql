-- ================================================================
-- GLYNBOX — Nombres de usuario legibles para los que entran con Apple
-- Correr en: Supabase Dashboard (proyecto de GLYNBOX) > SQL Editor > New query
-- Seguro de correr más de una vez.
-- ================================================================
--
-- Quien entra con Apple y oculta su mail queda con un mail tipo
-- 9kp9knkwgf@privaterelay.appleid.com, y `handle_new_user` armaba el @ con lo
-- que va antes de la arroba: @9kp9knkwgf. Al 22/10/2026 eran 69 cuentas, todas
-- con su nombre real en `display_name` (Apple lo manda en el primer ingreso).
--
-- Esto hace cuatro cosas:
--
--   1. Funciones para armar un @ a partir de un nombre: "Paloma Gonzalez" →
--      @palomagonzalez, y si ya existe, @palomagonzalez2. Sin nombre,
--      @cinefilo1234. Sólo letras sin acento y números, hasta 20 caracteres:
--      entra en las reglas de la app ([a-z0-9_.], 3 a 20) y de la web.
--   2. `handle_new_user` usa eso para las cuentas nuevas con mail privado de
--      Apple: el nombre si llegó en el registro (la web lo recibe ahí) y si
--      no, @cinefiloNNNN. Las demás cuentas siguen como antes.
--   3. En la app, el nombre de Apple llega un instante después del registro
--      (la app lo guarda en `display_name`). Un trigger en `profiles` cambia
--      ese @cinefiloNNNN (o el aleatorio) por el del nombre en ese momento,
--      sólo si la persona nunca eligió su @ (`username_changed_at` vacío).
--   4. Renombra las cuentas que ya existen con el @ aleatorio, guardando el
--      viejo en `usuarios_anteriores`. La web usa esa tabla para que los links
--      viejos (glynbox.com/usuario/9kp9knkwgf) lleven al perfil nuevo.
--
-- Qué no se rompe al cambiar el @:
--   · Seguidores, reseñas, listas, calificaciones y notificaciones van por el
--     id de la cuenta, no por el @.
--   · Las menciones (@usuario en un texto) y `notifications.actor_username`
--     guardan el @ como texto. Al 22/10 no había ninguna con estos @; igual se
--     actualizan las notificaciones, por si aparece alguna antes de correr esto.
--   · `username_changed_at` no se toca: el cambio no cuenta como el cambio
--     mensual de la persona, que puede elegir otro @ cuando quiera.
-- ================================================================


-- ── 1. Armar el @ ──────────────────────────────────────────────────────────

-- La base sacada de un nombre, o NULL si no da para un @ (menos de 3 letras).
CREATE OR REPLACE FUNCTION public.glynbox_usuario_base(nombre text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN length(b) >= 3 THEN left(b, 20) END
    FROM (
      SELECT regexp_replace(
               translate(lower(coalesce(nombre, '')),
                         'áàäâãåéèëêíìïîóòöôõúùüûñçý',
                         'aaaaaaeeeeiiiiooooouuuuncy'),
               '[^a-z0-9]', '', 'g') AS b
    ) x
$$;

-- ¿Ese @ está libre? (sin distinguir mayúsculas, como lo lee la gente)
CREATE OR REPLACE FUNCTION public.glynbox_usuario_libre(candidato text, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE lower(username) = lower(candidato) AND id IS DISTINCT FROM p_id
  )
$$;

-- Un @ libre a partir de un nombre: la base, y si está tomada, base2, base3…
-- Sin nombre usable, cinefilo y cuatro números al azar.
CREATE OR REPLACE FUNCTION public.glynbox_usuario_desde_nombre(nombre text, p_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base text := public.glynbox_usuario_base(nombre);
  candidato text;
  n int := 1;
BEGIN
  IF base IS NULL THEN
    LOOP
      candidato := 'cinefilo' || (1000 + floor(random() * 9000))::int;
      EXIT WHEN public.glynbox_usuario_libre(candidato, p_id);
    END LOOP;
    RETURN candidato;
  END IF;

  candidato := base;
  WHILE NOT public.glynbox_usuario_libre(candidato, p_id) LOOP
    n := n + 1;
    -- Que el número entre en los 20 caracteres.
    candidato := left(base, 20 - length(n::text)) || n::text;
  END LOOP;
  RETURN candidato;
END
$$;

-- El nombre que mandó Apple (o Google) en el registro, si vino.
CREATE OR REPLACE FUNCTION public.glynbox_nombre_de_metadatos(meta jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(btrim(coalesce(
    nullif(meta ->> 'full_name', ''),
    nullif(meta ->> 'name', ''),
    concat_ws(' ', meta ->> 'given_name', meta ->> 'family_name')
  )), '')
$$;

-- ¿El @ de esta cuenta es el automático de Apple (sacado del mail privado,
-- o @cinefiloNNNN) y la persona nunca lo cambió?
CREATE OR REPLACE FUNCTION public.glynbox_usuario_automatico_apple(p_id uuid, usuario text, cambiado_en timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT cambiado_en IS NULL
     AND EXISTS (
       SELECT 1 FROM auth.users u
        WHERE u.id = p_id
          AND lower(u.email) LIKE '%@privaterelay.appleid.com'
          AND (
            lower(usuario) ~ ('^' || regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9_]', '_', 'g') || '[0-9]*$')
            OR usuario ~ '^cinefilo[0-9]+$'
          )
     )
$$;

REVOKE EXECUTE ON FUNCTION public.glynbox_usuario_libre(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.glynbox_usuario_desde_nombre(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.glynbox_usuario_automatico_apple(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;


-- ── 2. Cuentas nuevas ──────────────────────────────────────────────────────
-- Igual que antes para todas, salvo las de mail privado de Apple.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  counter INTEGER := 0;
BEGIN
  IF lower(NEW.email) LIKE '%@privaterelay.appleid.com' THEN
    final_username := public.glynbox_usuario_desde_nombre(
      public.glynbox_nombre_de_metadatos(NEW.raw_user_meta_data), NEW.id);
  ELSE
    base_username  := regexp_replace(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g');
    final_username := base_username;
    WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
      counter        := counter + 1;
      final_username := base_username || counter::text;
    END LOOP;
  END IF;

  INSERT INTO public.profiles (id, username)
    VALUES (NEW.id, final_username)
    ON CONFLICT (id) DO UPDATE
      SET username = EXCLUDED.username
      WHERE public.profiles.username IS NULL;
  RETURN NEW;
END;
$$;


-- ── El registro de los @ viejos ────────────────────────────────────────────
-- Lo lee el servidor de la web (service role) para redirigir los links
-- viejos. RLS prendida y sin políticas: nadie más.

CREATE TABLE IF NOT EXISTS public.usuarios_anteriores (
  id              bigserial   PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  username_viejo  text        NOT NULL,
  username_nuevo  text        NOT NULL,
  motivo          text        NOT NULL DEFAULT 'apple_aleatorio',
  cambiado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usuarios_anteriores_viejo ON public.usuarios_anteriores (lower(username_viejo));

ALTER TABLE public.usuarios_anteriores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usuarios_anteriores FROM anon, authenticated;


-- ── 3. El nombre que llega después (Apple en la app) ───────────────────────

CREATE OR REPLACE FUNCTION public.glynbox_usuario_con_nombre()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nuevo text;
BEGIN
  IF NEW.display_name IS NOT NULL
     AND btrim(NEW.display_name) <> ''
     AND NEW.display_name IS DISTINCT FROM OLD.display_name
     AND NEW.username IS NOT DISTINCT FROM OLD.username
     AND public.glynbox_usuario_base(NEW.display_name) IS DISTINCT FROM lower(NEW.username)
     AND public.glynbox_usuario_automatico_apple(NEW.id, NEW.username, NEW.username_changed_at) THEN
    nuevo := public.glynbox_usuario_desde_nombre(NEW.display_name, NEW.id);
    IF nuevo IS DISTINCT FROM NEW.username THEN
      INSERT INTO public.usuarios_anteriores (user_id, username_viejo, username_nuevo)
      VALUES (NEW.id, NEW.username, nuevo);
      NEW.username := nuevo;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS profiles_usuario_con_nombre ON public.profiles;
CREATE TRIGGER profiles_usuario_con_nombre
  BEFORE UPDATE OF display_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.glynbox_usuario_con_nombre();


-- ── 4. Las cuentas que ya existen ──────────────────────────────────────────
-- Para mirar antes (no cambia nada):
--
--   SELECT p.username, p.display_name
--     FROM public.profiles p
--    WHERE public.glynbox_usuario_automatico_apple(p.id, p.username, p.username_changed_at);

BEGIN;

DO $$
DECLARE
  r record;
  nombre text;
  nuevo text;
BEGIN
  FOR r IN
    SELECT p.id, p.username, p.display_name, u.raw_user_meta_data
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
     WHERE public.glynbox_usuario_automatico_apple(p.id, p.username, p.username_changed_at)
       AND p.username !~ '^cinefilo[0-9]+$'
     ORDER BY u.created_at
  LOOP
    nombre := coalesce(nullif(btrim(r.display_name), ''), public.glynbox_nombre_de_metadatos(r.raw_user_meta_data));
    -- Un "nombre" que es el mismo texto aleatorio del @ no es un nombre: va
    -- @cinefiloNNNN. Había una cuenta así al 22/10.
    IF public.glynbox_usuario_base(nombre) = lower(r.username) THEN
      nombre := NULL;
    END IF;
    nuevo := public.glynbox_usuario_desde_nombre(nombre, r.id);

    INSERT INTO public.usuarios_anteriores (user_id, username_viejo, username_nuevo)
    VALUES (r.id, r.username, nuevo);

    UPDATE public.profiles SET username = nuevo WHERE id = r.id;
    UPDATE public.notifications SET actor_username = nuevo WHERE actor_username = r.username;
  END LOOP;
END
$$;

COMMIT;

-- Para comprobar:
--
--   SELECT username_viejo, username_nuevo FROM public.usuarios_anteriores ORDER BY id;
--
-- Volver atrás (sólo si hace falta):
--
--   UPDATE public.profiles p SET username = a.username_viejo
--     FROM public.usuarios_anteriores a
--    WHERE a.user_id = p.id AND p.username = a.username_nuevo AND a.motivo = 'apple_aleatorio';
