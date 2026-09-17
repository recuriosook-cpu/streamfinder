import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'
import { DISPOSITIVOS, type Dispositivo } from '@/lib/device'

/**
 * GET /api/admin/descargar
 *
 * El embudo de la landing `/descargar`, para el panel: cuánta gente la vio,
 * cuánta tocó un botón, con qué aparato y hacia dónde se fue.
 *
 * ── Por qué es un endpoint y no una consulta desde el panel ────────────────
 *
 * Porque `analytics_events` no se puede leer desde el navegador, y con razón.
 * `supabase-analytics-actividad.sql` le revoca los permisos a `anon` y a
 * `authenticated` explícitamente: la anon key viaja en el bundle, así que
 * cualquiera que la lea podría sacar la actividad de todos los usuarios. El
 * panel consulta Supabase desde el cliente para casi todo, pero para esto no
 * puede. La service role vive acá y no sale del servidor.
 *
 * ── Por qué son conteos y no una descarga de filas ─────────────────────────
 *
 * La forma obvia sería traer los eventos y agrupar en JavaScript. Funciona hoy
 * y se rompe sola: una landing de campaña es justo el tipo de página que puede
 * juntar cien mil filas en una semana buena, y a esa altura habría que poner un
 * tope — que es lo mismo que decir que el número del panel deja de ser cierto
 * sin avisar.
 *
 * Así que se piden conteos: `head: true` con `count: 'exact'` no trae ni una
 * fila, sólo el número, y el número es siempre el real. Son nueve consultas en
 * vez de una, pero van todas juntas en un `Promise.all` y ninguna transporta
 * datos. Es más barato que traer las filas, no más caro.
 *
 * El filtro sobre `props` usa la sintaxis de PostgREST para JSONB
 * (`props->>dispositivo`). No hay índice sobre esa expresión; con el volumen de
 * una landing no hace falta, y el día que haga falta se agrega en el SQL sin
 * tocar este archivo.
 *
 * ── Los bots ──────────────────────────────────────────────────────────────
 *
 * Todo filtra `is_bot = false`, igual que el resto del panel. En una página que
 * se promociona con links públicos esto no es un detalle: los previsualizadores
 * de WhatsApp, Twitter y Facebook la van a visitar cada vez que alguien comparta
 * el link. Sin el filtro, las visitas serían en buena parte robots y la tasa de
 * conversión daría cualquier cosa.
 */

export const runtime = 'nodejs'

// ── Auth ───────────────────────────────────────────────────────────────────

/** Mismo criterio que `app/admin/layout.tsx` y `/api/admin/overview`. */
async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options) } catch { /**/ } }) },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  return profile?.username === 'Ferlageok' ? user : null
}

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface FilaDispositivo {
  dispositivo: Dispositivo
  visitas: number
  aPlayStore: number
  aWeb: number
  /** La suma de los dos de arriba. Se manda calculada para que la UI no sume. */
  clicks: number
  /**
   * Clicks sobre visitas, en porcentaje.
   *
   * `null` cuando no hubo visitas: no existe el porcentaje de conversión sobre
   * cero, y mostrar 0% ahí diría "nadie tocó el botón" cuando lo que pasa es
   * que nadie llegó. Es la misma distinción que hace `Metrica` en
   * `/api/admin/overview`.
   */
  conversionPct: number | null
}

export interface DescargarResumen {
  /** `false` si la tabla no existe o si todavía no entró ninguna visita. */
  disponible: boolean
  /** Primera visita registrada. Va en el cartel de arriba. */
  desde: string | null
  porDispositivo: FilaDispositivo[]
  totales: {
    visitas: number
    clicks: number
    aPlayStore: number
    aWeb: number
    conversionPct: number | null
  }
  generadoEn: string
}

const VACIO: DescargarResumen = {
  disponible: false,
  desde: null,
  porDispositivo: [],
  totales: { visitas: 0, clicks: 0, aPlayStore: 0, aWeb: 0, conversionPct: null },
  generadoEn: new Date().toISOString(),
}

function porcentaje(parte: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((parte / total) * 1000) / 10
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/descargar')
  if (failure) return failure

  /**
   * La base de todos los conteos: eventos humanos, sin traer filas.
   *
   * Va como `const` y no como `function` a propósito. Una declaración de
   * función se hoistea al principio del bloque, y TypeScript entonces no puede
   * dar por buena la garantía de que `admin` no es null —el `if (failure)` de
   * arriba— porque nada le asegura que no se la llame antes. Con un `const`
   * definido después del guard, el narrowing vale adentro.
   */
  const construir = () =>
    admin
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('is_bot', false)

  /**
   * Un conteo exacto sin traer filas.
   *
   * Devuelve 0 y loguea si la consulta falla, en vez de tirar: una métrica que
   * no se pudo calcular no puede tumbar el panel entero. El `disponible` de
   * abajo distingue "no hay datos" de "hay datos y son cero".
   */
  const contar = async (filtros: (q: ReturnType<typeof construir>) => ReturnType<typeof construir>) => {
    const { count, error } = await filtros(construir())
    if (error) {
      console.error('[admin/descargar] conteo falló:', error.message)
      return 0
    }
    return count ?? 0
  }

  // Nueve conteos y la fecha de la primera visita, todo en paralelo. Ninguno
  // depende del otro.
  const [visitas, clicksPlay, clicksWeb, primeraRes] = await Promise.all([
    Promise.all(
      DISPOSITIVOS.map(d =>
        contar(q => q.eq('name', 'descargar_viewed').eq('props->>dispositivo', d))
      )
    ),
    Promise.all(
      DISPOSITIVOS.map(d =>
        contar(q =>
          q.eq('name', 'descargar_clicked')
            .eq('props->>dispositivo', d)
            .eq('props->>destino', 'play_store')
        )
      )
    ),
    Promise.all(
      DISPOSITIVOS.map(d =>
        contar(q =>
          q.eq('name', 'descargar_clicked')
            .eq('props->>dispositivo', d)
            .eq('props->>destino', 'glynbox_web')
        )
      )
    ),
    admin
      .from('analytics_events')
      .select('created_at')
      .eq('name', 'descargar_viewed')
      .eq('is_bot', false)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const porDispositivo: FilaDispositivo[] = DISPOSITIVOS.map((dispositivo, i) => {
    const aPlayStore = clicksPlay[i]
    const aWeb = clicksWeb[i]
    const clicks = aPlayStore + aWeb
    return {
      dispositivo,
      visitas: visitas[i],
      aPlayStore,
      aWeb,
      clicks,
      conversionPct: porcentaje(clicks, visitas[i]),
    }
  })

  const totalVisitas = porDispositivo.reduce((s, f) => s + f.visitas, 0)
  const totalPlay    = porDispositivo.reduce((s, f) => s + f.aPlayStore, 0)
  const totalWeb     = porDispositivo.reduce((s, f) => s + f.aWeb, 0)
  const totalClicks  = totalPlay + totalWeb

  // "Disponible" es que haya entrado al menos una visita. Con cero visitas y
  // cero clicks no se puede distinguir una landing que nadie visitó de una
  // medición que todavía no se desplegó, y el panel muestra cosas distintas.
  if (totalVisitas === 0 && totalClicks === 0) {
    return NextResponse.json({ ...VACIO, generadoEn: new Date().toISOString() })
  }

  const resumen: DescargarResumen = {
    disponible: true,
    desde: (primeraRes.data?.created_at as string | undefined) ?? null,
    porDispositivo,
    totales: {
      visitas: totalVisitas,
      clicks: totalClicks,
      aPlayStore: totalPlay,
      aWeb: totalWeb,
      conversionPct: porcentaje(totalClicks, totalVisitas),
    },
    generadoEn: new Date().toISOString(),
  }

  return NextResponse.json(resumen)
}
