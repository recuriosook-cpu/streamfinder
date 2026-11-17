import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { requireAdminClient } from '@/lib/service-role'
import { VENTANAS, VENTANA_POR_DEFECTO, type Ventana } from '@/lib/metricas-ventanas'

/**
 * GET /api/admin/aviso-app?dias=7|30 — el aviso de pantalla completa para
 * bajar la app (`components/AvisoApp.tsx`). Bloque "Aviso de la app" de
 * `/admin/metricas`.
 *
 * - Totales y serie por día: de `analytics_dia_evento` (el resumen diario de
 *   todos los eventos, sin bots, que arma `analytics_resumir` cada hora).
 *   `personas` es la suma de personas distintas de cada día.
 * - Reparto por tienda: conteos sobre `analytics_events`, que guarda estos
 *   eventos 60 días (no están entre los "masivos" de `analytics_limpiar`).
 * - Descartes (`aviso_app_descartado`, desde el 17/11/2026): por qué no salió
 *   al entrar, también contados sobre `analytics_events`.
 *
 * Sin funciones nuevas en la base: todo con lo que ya existe.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const EVENTOS = ['aviso_app_mostrado', 'aviso_app_descargar', 'aviso_app_seguir_web'] as const
type Evento = (typeof EVENTOS)[number]
const TIENDAS = ['play_store', 'app_store'] as const
const SENALES = ['marca', 'referrer', 'display_mode', 'standalone'] as const
/** Cuándo se publicó `aviso_app_descartado` (commit 0ddbfd5). */
const DESCARTES_DESDE = '2026-11-17T13:08:00Z'

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

export interface ConteoAviso { veces: number; personas: number }

export interface AvisoAppResumen {
  dias: Ventana
  /** El primer día con el aviso: antes de eso no hay datos. */
  desde: string | null
  mostrado: ConteoAviso
  descargar: ConteoAviso
  seguirWeb: ConteoAviso
  /** Por tienda, en veces: `play_store` (Android) y `app_store` (iPhone). */
  porTienda: Record<(typeof TIENDAS)[number], Record<'mostrado' | 'descargar' | 'seguirWeb', number>>
  /**
   * Visitas de celular en las que no salió al entrar (una por visita), desde
   * el 17/11/2026. `buscador`: llegó de Google o Bing y el aviso espera a la
   * segunda página; `buscadorDespues` es cuántas veces salió en esa segunda
   * página. `enApp`: se la tomó como dentro de la app, abierta por señal.
   * `mostrado` son las veces que salió en el mismo período (desde `desde`, que
   * es el comienzo de la ventana o el 17/11/2026, lo que sea más tarde), para
   * comparar contra lo mismo.
   */
  descartado: {
    desde: string
    mostrado: number
    buscador: number
    buscadorDespues: number
    enApp: number
    enAppPorSenal: Record<(typeof SENALES)[number], number>
  }
  /** Una fila por día de la ventana, en veces. */
  serie: { dia: string; mostrado: number; descargar: number; seguirWeb: number }[]
}

const CLAVE: Record<Evento, 'mostrado' | 'descargar' | 'seguirWeb'> = {
  aviso_app_mostrado: 'mostrado',
  aviso_app_descargar: 'descargar',
  aviso_app_seguir_web: 'seguirWeb',
}

/** Fecha de hoy en Argentina, `YYYY-MM-DD`: la misma zona que usa `analytics_dia_evento`. */
function hoyAR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}

function restarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/aviso-app')
  if (failure) return failure

  const pedido = Number(req.nextUrl.searchParams.get('dias'))
  const dias: Ventana = (VENTANAS as readonly number[]).includes(pedido) ? (pedido as Ventana) : VENTANA_POR_DEFECTO
  const hoy = hoyAR()
  const desdeDia = restarDias(hoy, dias - 1)
  // Para los conteos por tienda: desde las 0 h de Argentina (UTC−3) del primer día.
  const desdeInstante = `${desdeDia}T03:00:00Z`

  const contar = (nombre: string, prop: string, valor: string) =>
    admin.from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('name', nombre)
      .eq('is_bot', false)
      .eq(`props->>${prop}`, valor)
      .gte('created_at', desdeInstante)

  // Lo de la 2ª página se cuenta sólo desde que existe el descarte: antes no
  // hay contra qué compararlo y el porcentaje pasaba del 100%.
  const desdeDescartes = desdeInstante > DESCARTES_DESDE ? desdeInstante : DESCARTES_DESDE
  const mostradoDesde = (entrada?: string) => {
    let q = admin.from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('name', 'aviso_app_mostrado')
      .eq('is_bot', false)
      .gte('created_at', desdeDescartes)
    if (entrada) q = q.eq('props->>entrada', entrada)
    return q
  }

  const descartes = Promise.all([
    mostradoDesde(),
    contar('aviso_app_descartado', 'motivo', 'buscador'),
    mostradoDesde('buscador'),
    contar('aviso_app_descartado', 'motivo', 'en_app'),
    ...SENALES.map(senal => contar('aviso_app_descartado', 'senal', senal)),
  ])

  const [resumen, primero, ...porTienda] = await Promise.all([
    admin.from('analytics_dia_evento')
      .select('dia, name, eventos, personas')
      .in('name', EVENTOS as unknown as string[])
      .eq('is_bot', false)
      .gte('dia', desdeDia),
    admin.from('analytics_dia_evento')
      .select('dia')
      .eq('name', 'aviso_app_mostrado')
      .order('dia', { ascending: true })
      .limit(1),
    ...TIENDAS.flatMap(tienda => EVENTOS.map(nombre =>
      admin.from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .eq('name', nombre)
        .eq('is_bot', false)
        .eq('props->>tienda', tienda)
        .gte('created_at', desdeInstante))),
  ])

  if (resumen.error) {
    console.error('[admin/aviso-app]', resumen.error.message)
    return NextResponse.json({ message: resumen.error.message }, { status: 500 })
  }

  const vacio = () => ({ veces: 0, personas: 0 })
  const salida: AvisoAppResumen = {
    dias,
    desde: (primero.data?.[0] as { dia: string } | undefined)?.dia ?? null,
    mostrado: vacio(),
    descargar: vacio(),
    seguirWeb: vacio(),
    porTienda: {
      play_store: { mostrado: 0, descargar: 0, seguirWeb: 0 },
      app_store: { mostrado: 0, descargar: 0, seguirWeb: 0 },
    },
    descartado: {
      desde: DESCARTES_DESDE,
      mostrado: 0,
      buscador: 0,
      buscadorDespues: 0,
      enApp: 0,
      enAppPorSenal: { marca: 0, referrer: 0, display_mode: 0, standalone: 0 },
    },
    serie: Array.from({ length: dias }, (_, i) => ({ dia: restarDias(hoy, dias - 1 - i), mostrado: 0, descargar: 0, seguirWeb: 0 })),
  }

  const [mostrado, buscador, buscadorDespues, enApp, ...porSenal] = await descartes
  salida.descartado.desde = desdeDescartes
  salida.descartado.mostrado = mostrado.count ?? 0
  salida.descartado.buscador = buscador.count ?? 0
  salida.descartado.buscadorDespues = buscadorDespues.count ?? 0
  salida.descartado.enApp = enApp.count ?? 0
  SENALES.forEach((senal, i) => { salida.descartado.enAppPorSenal[senal] = porSenal[i].count ?? 0 })

  const porDia = new Map(salida.serie.map(f => [f.dia, f]))
  for (const r of (resumen.data ?? []) as { dia: string; name: Evento; eventos: number; personas: number }[]) {
    const k = CLAVE[r.name]
    if (!k) continue
    salida[k].veces += r.eventos
    salida[k].personas += r.personas
    const fila = porDia.get(r.dia)
    if (fila) fila[k] += r.eventos
  }

  TIENDAS.forEach((tienda, t) => EVENTOS.forEach((nombre, e) => {
    salida.porTienda[tienda][CLAVE[nombre]] = porTienda[t * EVENTOS.length + e].count ?? 0
  }))

  return NextResponse.json(salida, { headers: { 'Cache-Control': 'private, no-store' } })
}
