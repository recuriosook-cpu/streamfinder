-- ================================================================
-- GLYNBOX — Wrapped anual: wrapped_anual(p_user, p_anio)
-- Correr en: Supabase Dashboard > SQL Editor > New query
-- Seguro de correr más de una vez (CREATE OR REPLACE). No toca datos.
-- ================================================================
--
-- El resumen del año de un usuario, en JSON, para la página pública
-- /wrapped/[usuario]/[año] (web) y la app. Devuelve NULL si el usuario no
-- existe, está bloqueado u oculta su actividad (`puede_ver_actividad`: el
-- dueño con su sesión sí ve el suyo).
--
-- ── Qué cuenta como "visto en el año" ───────────────────────────────────────
--
-- Las filas de `watched` con `watched_at` dentro del año (hora de Buenos
-- Aires), salvo las que no dicen cuándo se vio algo (medido el 2026-11-21):
--
--   · origen 'letterboxd': la importación guarda la fecha en que se importó,
--     no la de Letterboxd (app/importar/page.tsx).
--   · origen 'deslizar…' ('deslizar', 'deslizar_estrellas'): el modo
--     deslizar marca "la vi" con cada tarjeta; es repasar lo visto alguna vez.
--   · las del onboarding: el "ya vi" de la grilla se guarda con la hora del
--     onboarding y sin origen. Se reconocen por ser anteriores a
--     `profiles.onboarding_completed_at` (+2 min). Eran 68.188 de las 90.293
--     vistas sin origen de 2026.
--
-- Con esto, al 2026-11-21: 1.362 usuarios con alguna vista en 2026, 408 con
-- 5 o más. Lo marcado a mano sí cuenta con la fecha en que se marcó, aunque
-- sea ponerse al día con lo visto antes (hay quien marcó 500 en un día).
--
-- ── Cada dato ───────────────────────────────────────────────────────────────
--
--   peliculas / series   Vistas del año por tipo. `hay_wrapped` = 5 o más
--                        entre las dos; si no, sólo vuelven año, total y
--                        hay_wrapped (la página muestra un mensaje).
--   horas                Aproximadas: películas con la duración de TMDB si
--                        está guardada (`favorites.runtime`, de cualquier
--                        usuario: es el dato de TMDB) y si no 110 min; más
--                        45 min por capítulo de `episodios_vistos` del año.
--                        OJO: las series marcadas enteras no suman horas
--                        (no se sabe cuántos capítulos vio). `episodios_vistos`
--                        existe desde el 2026-11-19. La web no muestra horas.
--   genero_id            El más visto, de `watched.genre_ids`. Sólo si al
--                        menos el 60 % de las vistas del año tiene géneros
--                        guardados. Hoy casi ninguna fila los tiene (8 de
--                        169.534), así que vuelve NULL hasta que se carguen.
--   plataforma_id        Entre las plataformas del perfil
--                        (`favorite_platforms`), la que tiene más de lo que
--                        vio según `disponibilidad` en su país. Es la
--                        disponibilidad de hoy, no la del día que lo vio. Se
--                        agrupan las familias de TMDB (Netflix con anuncios
--                        → Netflix; lib/providers.ts FAMILIAS_DE_PLATAFORMA).
--                        Sólo si: país y plataformas cargados, al menos la
--                        mitad de lo visto tiene disponibilidad guardada en
--                        su país, y la ganadora tiene 3 títulos o más.
--   puntaje_promedio     Promedio (estrellas de 0,5 a 5) de las notas de lo
--                        visto en el año (`ratings`, o la de la reseña si no
--                        hay). Sólo con 3 notas o más.
--   favoritas            Hasta 4 de lo visto en el año con nota: mayor nota,
--                        desempate por la vista más reciente. Con póster.
--   top_pct              "Top N %": el porcentaje de usuarios con al menos
--                        una vista en el año que vieron tanto o más que él
--                        (redondeado para arriba, mínimo 1). Sólo con 10
--                        usuarios o más en el año. Cuentan todos, también
--                        los que ocultan su actividad (sólo entra la cuenta).
--
-- Rendimiento: la cuenta del top recorre las vistas del año de todos
-- (~170.000 filas hoy; unos ms). La página se cachea 10 min en la CDN.
--
-- ================================================================

-- El id con que se guarda una plataforma en el perfil (el primero de su
-- familia). Copia de FAMILIAS_DE_PLATAFORMA en lib/providers.ts: si cambia
-- allá, cambiar acá.
CREATE OR REPLACE FUNCTION public.wrapped_plataforma_canonica(p_id integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_id IN (8, 1796, 175) THEN 8                              -- Netflix
    WHEN p_id IN (119, 9, 2100, 613) THEN 119                       -- Prime Video
    WHEN p_id IN (337, 122) THEN 337                                -- Disney+
    WHEN p_id IN (1899, 384, 1825, 2284) THEN 1899                  -- HBO Max
    WHEN p_id IN (531, 2303, 2304, 2616, 582, 1853, 633) THEN 531   -- Paramount+
    WHEN p_id IN (350, 2243) THEN 350                               -- Apple TV
    WHEN p_id IN (457, 1866) THEN 457                               -- ViX
    WHEN p_id IN (386, 387) THEN 386                                -- Peacock
    WHEN p_id IN (63, 64) THEN 63                                   -- Filmin
    ELSE p_id
  END
$$;

-- ¿Esta fila de `watched` dice cuándo se vio? (ver arriba). Una sola regla
-- para la vista del usuario y para la cuenta del top.
CREATE OR REPLACE FUNCTION public.wrapped_vista_cuenta(
  p_origen text, p_watched_at timestamptz, p_onboarding timestamptz
) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (p_origen IS NULL OR (p_origen <> 'letterboxd' AND p_origen NOT LIKE 'deslizar%'))
     AND (p_onboarding IS NULL OR p_watched_at > p_onboarding + interval '2 minutes')
$$;

CREATE OR REPLACE FUNCTION public.wrapped_anual(p_user uuid, p_anio integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desde       timestamptz;
  v_hasta       timestamptz;
  v_pais        text;
  v_plataformas integer[];
  v_onboarding  timestamptz;
  v_peliculas   integer;
  v_series      integer;
  v_total       integer;
  v_res         jsonb;
BEGIN
  IF p_user IS NULL OR p_anio IS NULL OR p_anio < 2000 OR p_anio > 2100 THEN
    RETURN NULL;
  END IF;

  SELECT upper(p.country), p.onboarding_completed_at,
         ARRAY(SELECT DISTINCT wrapped_plataforma_canonica(x::integer)
               FROM unnest(p.favorite_platforms) x WHERE x ~ '^\d{1,9}$')
    INTO v_pais, v_onboarding, v_plataformas
    FROM profiles p
   WHERE p.id = p_user AND p.blocked IS NOT TRUE;
  IF NOT FOUND OR NOT puede_ver_actividad(p_user) THEN
    RETURN NULL;
  END IF;

  v_desde := make_timestamptz(p_anio,     1, 1, 0, 0, 0, 'America/Argentina/Buenos_Aires');
  v_hasta := make_timestamptz(p_anio + 1, 1, 1, 0, 0, 0, 'America/Argentina/Buenos_Aires');

  SELECT count(*) FILTER (WHERE w.media_type = 'movie'),
         count(*) FILTER (WHERE w.media_type = 'tv')
    INTO v_peliculas, v_series
    FROM watched w
   WHERE w.user_id = p_user
     AND w.watched_at >= v_desde AND w.watched_at < v_hasta
     AND wrapped_vista_cuenta(w.origen, w.watched_at, v_onboarding);
  v_total := v_peliculas + v_series;

  IF v_total < 5 THEN
    RETURN jsonb_build_object('anio', p_anio, 'hay_wrapped', false, 'total', v_total);
  END IF;

  WITH vistas AS (
    SELECT w.media_type, w.media_id, w.title, w.poster_path, w.watched_at, w.genre_ids
      FROM watched w
     WHERE w.user_id = p_user
       AND w.watched_at >= v_desde AND w.watched_at < v_hasta
       AND wrapped_vista_cuenta(w.origen, w.watched_at, v_onboarding)
  ),
  notas AS (
    SELECT v.*, COALESCE(r.rating, rv.rating) AS puntaje
      FROM vistas v
      LEFT JOIN ratings r
        ON r.user_id = p_user AND r.media_id = v.media_id AND r.media_type = v.media_type
      LEFT JOIN LATERAL (
        SELECT x.rating FROM reviews x
         WHERE x.user_id = p_user AND x.media_id = v.media_id AND x.media_type = v.media_type
           AND x.rating IS NOT NULL
         ORDER BY x.updated_at DESC NULLS LAST LIMIT 1
      ) rv ON r.rating IS NULL
  ),
  minutos_peliculas AS (
    SELECT COALESCE(sum(COALESCE(
             (SELECT max(f.runtime) FROM favorites f
               WHERE f.media_type = 'movie' AND f.media_id = v.media_id AND f.runtime > 0),
             110)), 0) AS m
      FROM vistas v WHERE v.media_type = 'movie'
  ),
  episodios AS (
    SELECT count(*) AS n FROM episodios_vistos e
     WHERE e.user_id = p_user AND e.fecha >= v_desde AND e.fecha < v_hasta
  ),
  genero AS (
    SELECT CASE
             WHEN (SELECT count(*) FROM vistas WHERE cardinality(genre_ids) > 0) >= 0.6 * v_total
             THEN (SELECT g FROM vistas, unnest(genre_ids) g
                    GROUP BY g ORDER BY count(*) DESC, max(watched_at) DESC LIMIT 1)
           END AS id
  ),
  disp AS (
    SELECT v.media_type, v.media_id, d.proveedores
      FROM vistas v
      JOIN disponibilidad d
        ON d.media_type = v.media_type AND d.media_id = v.media_id AND d.pais = v_pais
  ),
  plataforma AS (
    SELECT c.prov AS id, count(DISTINCT (d.media_type, d.media_id)) AS titulos
      FROM disp d
      CROSS JOIN LATERAL (SELECT DISTINCT wrapped_plataforma_canonica(x) AS prov FROM unnest(d.proveedores) x) c
     WHERE c.prov = ANY (v_plataformas)
     GROUP BY c.prov
     -- Empate: la que el usuario puso primero en su perfil.
     ORDER BY titulos DESC, array_position(v_plataformas, c.prov)
     LIMIT 1
  ),
  cuentas AS (
    SELECT w.user_id, count(*) AS n
      FROM watched w
      JOIN profiles p ON p.id = w.user_id AND p.blocked IS NOT TRUE
     WHERE w.watched_at >= v_desde AND w.watched_at < v_hasta
       AND wrapped_vista_cuenta(w.origen, w.watched_at, p.onboarding_completed_at)
     GROUP BY w.user_id
  ),
  top AS (
    SELECT count(*) AS usuarios,
           count(*) FILTER (WHERE n >= v_total) AS iguales_o_mas
      FROM cuentas
  )
  SELECT jsonb_build_object(
    'anio',              p_anio,
    'hay_wrapped',       true,
    'total',             v_total,
    'peliculas',         v_peliculas,
    'series',            v_series,
    'minutos_peliculas', (SELECT m FROM minutos_peliculas),
    'episodios',         (SELECT n FROM episodios),
    'horas',             round(((SELECT m FROM minutos_peliculas) + 45 * (SELECT n FROM episodios)) / 60.0),
    'genero_id',         (SELECT id FROM genero),
    'plataforma_id',     CASE
                           WHEN v_pais IS NOT NULL AND cardinality(v_plataformas) > 0
                            AND (SELECT count(*) FROM disp) >= 0.5 * v_total
                            AND (SELECT titulos FROM plataforma) >= 3
                           THEN (SELECT id FROM plataforma)
                         END,
    'plataforma_titulos', (SELECT titulos FROM plataforma),
    'puntaje_promedio',  (SELECT CASE WHEN count(puntaje) >= 3 THEN round(avg(puntaje), 1) END FROM notas),
    'puntajes',          (SELECT count(puntaje) FROM notas),
    'top_pct',           (SELECT CASE WHEN usuarios >= 10
                                      THEN GREATEST(1, ceil(100.0 * iguales_o_mas / usuarios))::integer
                                 END FROM top),
    'usuarios_del_anio', (SELECT usuarios FROM top),
    'favoritas',         COALESCE((
                           SELECT jsonb_agg(jsonb_build_object(
                                    'media_type', f.media_type, 'media_id', f.media_id,
                                    'titulo', f.title, 'poster_path', f.poster_path, 'puntaje', f.puntaje)
                                  ORDER BY f.puntaje DESC, f.watched_at DESC)
                             FROM (SELECT * FROM notas WHERE puntaje IS NOT NULL
                                    ORDER BY puntaje DESC, watched_at DESC LIMIT 4) f
                         ), '[]'::jsonb)
  ) INTO v_res;

  RETURN v_res;
END;
$$;

REVOKE ALL ON FUNCTION public.wrapped_anual(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wrapped_anual(uuid, integer) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------
-- VERIFICAR (solo lectura): con un usuario que tenga 5 o más vistas en 2026.
--   SELECT wrapped_anual((SELECT id FROM profiles WHERE username = 'TU_USUARIO'), 2026);
-- ----------------------------------------------------------------
