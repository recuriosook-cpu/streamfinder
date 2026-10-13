-- ================================================================
-- POTION BOTTLE — La función que alimenta /admin/potion
--
-- CORRER EN EL PROYECTO DE SUPABASE DEL JUEGO, NO EN EL DE GLYNBOX.
-- Supabase Dashboard (proyecto del juego) > SQL Editor > New query.
-- Seguro de correr más de una vez.
-- ================================================================
--
-- Por qué vive acá y no en `botellas/servidor/`: la usa el panel de Glynbox y
-- nadie más. El juego no la llama ni la necesita. El nombre del archivo no
-- empieza con `supabase-` a propósito: esos son todos del proyecto de Glynbox.
--
-- QUIÉN LA PUEDE LLAMAR: sólo `service_role`, o sea la ruta
-- `/api/admin/potion` con la clave secreta. El juego usa `anon`, que no la
-- puede ejecutar: `anon` no puede leer la tabla y esta función no le abre una
-- puerta, porque es SECURITY INVOKER (corre con los permisos del que llama).
--
-- QUÉ DEVUELVE: un solo JSON con las seis secciones del panel. Una función y
-- no once es para que el panel haga un pedido y no once, y para que todas las
-- secciones salgan de la misma foto de la tabla.
--
-- CÓMO SE CUENTA, que difiere de `botellas/servidor/consultas.sql` en tres
-- cosas, a pedido:
--
--   1. LAS FECHAS SON `recibido`, NO `cuando`, al revés de lo que recomienda
--      `botellas/servidor/estadisticas.sql`. Decidido el 13/10/2026: un
--      teléfono con el reloj mal inventa fechas, y eso ensucia más que un
--      evento offline que llega tarde. El costo: un evento guardado sin
--      conexión cuenta el día que llegó, no el día que se jugó, y un jugador
--      que vuelve a conectarse después de días puede aparecer "volviendo" el
--      día equivocado.
--
--      PARA REVISARLO: si esta consulta muestra que una parte importante de
--      los eventos llega con más de un día de demora, conviene repensar la
--      decisión (por ejemplo, `cuando` cuando la demora es razonable y
--      `recibido` si no).
--
--        SELECT round(100.0 * count(*) FILTER (WHERE recibido - cuando > interval '1 day')
--                     / nullif(count(*), 0), 1) AS pct_mas_de_un_dia,
--               round(100.0 * count(*) FILTER (WHERE recibido - cuando > interval '1 hour')
--                     / nullif(count(*), 0), 1) AS pct_mas_de_una_hora
--          FROM public.potion_eventos
--         WHERE recibido > now() - interval '30 days';
--   2. LOS DÍAS SON DE ARGENTINA (`p_zona`), no UTC. "Hoy" cambia a las 0 de
--      Buenos Aires y no a las 21.
--   3. LOS EVENTOS DE PRUEBA NO CUENTAN NUNCA: los de `version = 'prueba'`,
--      que manda `npm run check:envio`. No son un jugador.
--
-- Igual que allá, los niveles repetidos (`repite = true`) quedan afuera de
-- todo lo que es de niveles.
--
-- LOS PARÁMETROS
--   p_rango        'hoy' | '7d' | 'todo'. Cualquier otra cosa es 'todo'.
--   p_lanzamiento  si no es NULL, se descarta todo lo recibido antes. Es la
--                  casilla "solo desde el lanzamiento".
--   p_zona         la zona horaria de los días.
--
-- QUÉ RESPETA EL RANGO Y QUÉ NO
--   · Las tarjetas que ya dicen su período ("hoy", "últimos 7 días") lo
--     ignoran: "nuevos hoy" es de hoy aunque el rango sea "todo".
--   · Las cohortes de retención se filtran por el día de llegada. Volver se
--     mira siempre, porque los días de vuelta son posteriores a la llegada.
--   · "Primer día" de un jugador es el primero DESPUÉS del filtro del
--     lanzamiento: con la casilla puesta, un tester que siguió jugando aparece
--     como nuevo el 13 de octubre.
--   · Todo lo demás cuenta sólo eventos del rango.
--
-- LA CONVERSIÓN DE LOS DATOS ES DEFENSIVA. `props` lo arma el teléfono y la
-- función que lo recibe sólo mira el tamaño: un `segundos: "abc"` mandado a
-- mano con la clave publicable entra igual. Un `::numeric` directo haría
-- fallar el panel entero por ese evento, así que cada número pasa por
-- `jsonb_typeof` antes de convertirse.
-- ================================================================

CREATE OR REPLACE FUNCTION public.potion_panel(
  p_rango       TEXT,
  p_lanzamiento TIMESTAMPTZ,
  p_zona        TEXT DEFAULT 'America/Argentina/Buenos_Aires'
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
WITH
param AS (
  SELECT h.hoy,
         CASE p_rango WHEN 'hoy' THEN h.hoy WHEN '7d' THEN h.hoy - 6 END AS desde
    FROM (SELECT (now() AT TIME ZONE p_zona)::date AS hoy) h
),

-- Todo lo que pasa el filtro del lanzamiento, sin mirar el rango.
ev AS (
  SELECT e.recibido,
         (e.recibido AT TIME ZONE p_zona)::date AS dia,
         e.instalacion, e.sesion, e.nombre, e.nivel, e.props
    FROM public.potion_eventos e
   WHERE e.version IS DISTINCT FROM 'prueba'
     AND (p_lanzamiento IS NULL OR e.recibido >= p_lanzamiento)
),

-- Lo anterior, recortado al rango.
er AS (
  SELECT ev.* FROM ev, param WHERE param.desde IS NULL OR ev.dia >= param.desde
),

primero AS (
  SELECT instalacion, min(dia) AS dia0 FROM ev GROUP BY instalacion
),

-- ── Sesiones ──────────────────────────────────────────────────────────────
-- La duración es el rato en pantalla: la suma de los `app_pausa`. Ver
-- `alCambiarDeEstado` en `botellas/src/game/estadisticas.ts`.
sesiones AS (
  SELECT sesion,
         sum(CASE WHEN jsonb_typeof(props->'segundos') = 'number'
                  THEN (props->>'segundos')::numeric END)
           FILTER (WHERE nombre = 'app_pausa') AS segundos
    FROM er
   GROUP BY sesion
),

-- ── Retención ─────────────────────────────────────────────────────────────
dias AS (
  SELECT DISTINCT instalacion, dia FROM ev
),
cohortes AS (
  SELECT pr.dia0,
         count(DISTINCT pr.instalacion)                                   AS llegaron,
         count(DISTINCT pr.instalacion) FILTER (WHERE d.dia = pr.dia0 + 1)  AS d1,
         count(DISTINCT pr.instalacion) FILTER (WHERE d.dia = pr.dia0 + 3)  AS d3,
         count(DISTINCT pr.instalacion) FILTER (WHERE d.dia = pr.dia0 + 7)  AS d7,
         count(DISTINCT pr.instalacion) FILTER (WHERE d.dia = pr.dia0 + 30) AS d30
    FROM primero pr
    CROSS JOIN param
    LEFT JOIN dias d
      ON d.instalacion = pr.instalacion
     AND d.dia IN (pr.dia0 + 1, pr.dia0 + 3, pr.dia0 + 7, pr.dia0 + 30)
   WHERE param.desde IS NULL OR pr.dia0 >= param.desde
   GROUP BY pr.dia0
),

-- ── Niveles ───────────────────────────────────────────────────────────────
inicios AS (
  SELECT instalacion, nivel
    FROM er
   WHERE nombre = 'nivel_empieza'
     AND nivel IS NOT NULL
     AND props->>'repite' IS DISTINCT FROM 'true'
),
llegaron AS (
  SELECT nivel, count(DISTINCT instalacion) AS jugadores
    FROM inicios
   GROUP BY nivel
),
-- El último nivel que empezó cada jugador en el rango, y si después de eso
-- lleva 7 días sin aparecer (mirando todo, no sólo el rango).
ultimo AS (
  SELECT i.instalacion, max(i.nivel) AS nivel
    FROM inicios i
   GROUP BY i.instalacion
),
visto AS (
  SELECT instalacion, max(recibido) AS ultima_vez FROM ev GROUP BY instalacion
),
quedaron AS (
  SELECT u.nivel,
         count(*)                                                          AS quedaron,
         count(*) FILTER (WHERE v.ultima_vez < now() - interval '7 days')  AS se_fueron
    FROM ultimo u
    JOIN visto v USING (instalacion)
   GROUP BY u.nivel
),
por_nivel AS (
  SELECT nivel,
         count(*) FILTER (WHERE nombre = 'nivel_empieza')    AS intentos,
         count(*) FILTER (WHERE nombre = 'nivel_gana')       AS victorias,
         count(*) FILTER (WHERE nombre = 'nivel_reinicia')   AS reinicios,
         count(*) FILTER (WHERE nombre = 'nivel_sin_salida') AS sin_salida,
         count(DISTINCT instalacion) FILTER (WHERE nombre = 'nivel_empieza') AS jugadores
    FROM er
   WHERE nivel IS NOT NULL
     AND nombre IN ('nivel_empieza', 'nivel_gana', 'nivel_reinicia', 'nivel_sin_salida')
     -- `nivel_sin_salida` no trae `repite`: pasa siempre.
     AND props->>'repite' IS DISTINCT FROM 'true'
   GROUP BY nivel
)

SELECT jsonb_build_object(
  'hoy',   (SELECT hoy   FROM param),
  'desde', (SELECT desde FROM param),

  'resumen', jsonb_build_object(
    'jugadores',    (SELECT count(DISTINCT instalacion) FROM er),
    'nuevosHoy',    (SELECT count(*) FROM primero, param WHERE dia0 = param.hoy),
    'nuevos7d',     (SELECT count(*) FROM primero, param WHERE dia0 >= param.hoy - 6),
    'activosHoy',   (SELECT count(DISTINCT instalacion) FROM ev, param WHERE ev.dia = param.hoy),
    'sesionesHoy',  (SELECT count(DISTINCT sesion)      FROM ev, param WHERE ev.dia = param.hoy),
    -- Una sesión sin ningún tramo medido todavía no pasó a segundo plano, o
    -- la cerraron de golpe: su duración no se sabe y un cero bajaría la media.
    'duracionMediaSeg', (SELECT round(avg(segundos)) FROM sesiones WHERE segundos > 0),
    'sesionesMedidas',  (SELECT count(*)              FROM sesiones WHERE segundos > 0),
    'eventos',      (SELECT count(*) FROM er)
  ),

  -- Un día es "maduro" para D-N cuando el día N ya terminó. Antes de eso no
  -- hay dato, y el panel muestra un guión en vez de un cero.
  'retencion', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'dia', c.dia0, 'llegaron', c.llegaron,
             'd1', c.d1, 'd3', c.d3, 'd7', c.d7, 'd30', c.d30,
             'd1Maduro',  c.dia0 + 1  < param.hoy,
             'd3Maduro',  c.dia0 + 3  < param.hoy,
             'd7Maduro',  c.dia0 + 7  < param.hoy,
             'd30Maduro', c.dia0 + 30 < param.hoy
           ) ORDER BY c.dia0 DESC)
      FROM (SELECT * FROM cohortes ORDER BY dia0 DESC LIMIT 90) c, param
  ), '[]'::jsonb),

  'embudo', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'nivel', l.nivel, 'jugadores', l.jugadores,
             'quedaron', coalesce(q.quedaron, 0), 'seFueron', coalesce(q.se_fueron, 0)
           ) ORDER BY l.nivel)
      FROM llegaron l
      LEFT JOIN quedaron q USING (nivel)
  ), '[]'::jsonb),

  -- Ordenados por intentos por victoria, de peor a mejor. Los que nadie ganó
  -- van primero: son los peores de todos.
  'niveles', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'nivel', n.nivel, 'jugadores', n.jugadores, 'intentos', n.intentos,
             'victorias', n.victorias, 'reinicios', n.reinicios, 'sinSalida', n.sin_salida
           ) ORDER BY n.intentos::numeric / nullif(n.victorias, 0) DESC NULLS FIRST,
                      n.intentos DESC, n.nivel)
      FROM por_nivel n
     WHERE n.intentos >= 3
  ), '[]'::jsonb),

  -- `via` es de dónde salió: 'bolsa' (una unidad o monedas) o 'video'.
  'comodines', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'cual', x.cual, 'usos', x.usos, 'porVideo', x.por_video, 'jugadores', x.jugadores
           ) ORDER BY x.usos DESC, x.cual)
      FROM (
        SELECT coalesce(props->>'cual', '?')                AS cual,
               count(*)                                     AS usos,
               count(*) FILTER (WHERE props->>'via' = 'video') AS por_video,
               count(DISTINCT instalacion)                  AS jugadores
          FROM er
         WHERE nombre = 'comodin'
         GROUP BY 1
      ) x
  ), '[]'::jsonb),

  'paneles', jsonb_build_object(
    'sinMonedas', (SELECT count(*) FROM er WHERE nombre = 'panel_sin_monedas'),
    'sinMonedasJugadores', (SELECT count(DISTINCT instalacion) FROM er WHERE nombre = 'panel_sin_monedas'),
    'sinVidas', (SELECT count(*) FROM er WHERE nombre = 'panel_sin_vidas'),
    'sinVidasJugadores', (SELECT count(DISTINCT instalacion) FROM er WHERE nombre = 'panel_sin_vidas'),
    -- El comodín que quiso usar y no pudo pagar.
    'sinMonedasPorComodin', coalesce((
      SELECT jsonb_agg(jsonb_build_object('cual', x.cual, 'veces', x.veces) ORDER BY x.veces DESC, x.cual)
        FROM (
          SELECT coalesce(props->>'comodin', '?') AS cual, count(*) AS veces
            FROM er WHERE nombre = 'panel_sin_monedas' GROUP BY 1
        ) x
    ), '[]'::jsonb)
  ),

  'pase', (
    SELECT jsonb_build_object(
      'abrieron',     count(DISTINCT instalacion) FILTER (WHERE nombre = 'pase_abre'),
      'aperturas',    count(*)                    FILTER (WHERE nombre = 'pase_abre'),
      'subieron',     count(DISTINCT instalacion) FILTER (WHERE nombre = 'pase_escalon'),
      'escalones',    count(*)                    FILTER (WHERE nombre = 'pase_escalon'),
      'completaron',  count(DISTINCT instalacion) FILTER (WHERE nombre = 'pase_completo'),
      'proximamente', count(DISTINCT instalacion) FILTER (WHERE nombre = 'pase_proximamente')
    )
      FROM er
     WHERE nombre IN ('pase_abre', 'pase_escalon', 'pase_completo', 'pase_proximamente')
  ),

  -- La práctica -el primer duelo, contra el muñeco del profesor- va aparte:
  -- mezclada, inflaría las victorias.
  'duelos', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'practica', x.practica, 'empezados', x.empezados, 'terminados', x.terminados,
             'ganados', x.ganados, 'conElBoton', x.con_el_boton, 'jugadores', x.jugadores
           ) ORDER BY x.practica)
      FROM (
        SELECT coalesce(props->>'practica' = 'true', false)                      AS practica,
               count(*) FILTER (WHERE nombre = 'duelo_empieza')                  AS empezados,
               count(*) FILTER (WHERE nombre = 'duelo_termina')                  AS terminados,
               count(*) FILTER (WHERE nombre = 'duelo_termina' AND props->>'gano' = 'true') AS ganados,
               count(*) FILTER (WHERE nombre = 'duelo_abandona')                 AS con_el_boton,
               count(DISTINCT instalacion) FILTER (WHERE nombre = 'duelo_empieza') AS jugadores
          FROM er
         WHERE nombre IN ('duelo_empieza', 'duelo_termina', 'duelo_abandona')
         GROUP BY 1
      ) x
  ), '[]'::jsonb)
);
$$;

-- Postgres deja ejecutar una función nueva a cualquiera (PUBLIC). Se saca eso,
-- y a `anon` y `authenticated` también por nombre: Supabase les da permisos
-- por defecto sobre lo que se crea en `public`.
REVOKE ALL ON FUNCTION public.potion_panel(TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.potion_panel(TEXT, TIMESTAMPTZ, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
