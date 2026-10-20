import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPotionClient } from '@/lib/potion-supabase'
import { contarReales } from '@/lib/potion-reales'
import { esRango, LANZAMIENTO, RANGO_POR_DEFECTO, ZONA, type Rango } from '@/lib/potion-panel'

/**
 * GET /api/admin/potion?rango=hoy|7d|todo&lanzamiento=1
 *
 * Las estadísticas del juego Potion Bottle para `/admin/potion`.
 *
 * ── Dos proyectos de Supabase ─────────────────────────────────────────────
 *
 * La sesión del admin se valida contra el Supabase de GLYNBOX, como en el
 * resto de `/api/admin`. Los datos salen del Supabase DEL JUEGO, con su clave
 * secreta (`lib/potion-supabase.ts`). La clave no sale nunca de acá: el
 * navegador recibe los números ya calculados.
 *
 * ── Todo el cálculo vive en SQL ───────────────────────────────────────────
 *
 * Una sola RPC, `potion_panel`, en `potion-panel.sql` (raíz del repo), que se
 * corre en el proyecto del juego. Bajarse los eventos y agruparlos acá
 * funcionaría con los dos mil de hoy y no con los de un mes de jugadores.
 *
 * Las fechas son las de llegada al servidor (`recibido`) y no las del
 * teléfono (`cuando`). Es una decisión con costo; el porqué y la consulta para
 * revisarla están en el encabezado de `potion-panel.sql`.
 *
 * La excepción son los conteos de jugadores del resumen (jugadores, nuevos y
 * activos): cuentan sólo usuarios reales, con el mismo cálculo que las
 * tarjetas de arriba (`lib/potion-reales.ts`), y pisan los del SQL.
 *
 * Acá sólo se pasan a número los conteos y se calculan los porcentajes, con
 * el mismo criterio que `/api/admin/retencion`: un porcentaje sin
 * denominador es `null`, no `NaN` ni 0.
 */

export const runtime = 'nodejs'

// ── Auth ───────────────────────────────────────────────────────────────────

/** Mismo criterio que el resto de `/api/admin`. */
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

// ── Tipos de la respuesta ──────────────────────────────────────────────────

export interface PotionResumen {
  /** Usuarios reales con algún evento en el rango. Ver `lib/potion-reales.ts`. */
  jugadores: number
  nuevosHoy: number
  nuevos7d: number
  activosHoy: number
  sesionesHoy: number
  /** `null` si ninguna sesión del rango tiene un tramo medido. */
  duracionMediaSeg: number | null
  sesionesMedidas: number
  eventos: number
}

export interface PotionCohorte {
  /** `YYYY-MM-DD`, día de Buenos Aires. */
  dia: string
  llegaron: number
  /** `null`: la cohorte todavía no cumplió el plazo. */
  d1Pct: number | null
  d3Pct: number | null
  d7Pct: number | null
  d30Pct: number | null
  d1: number
  d3: number
  d7: number
  d30: number
}

export interface PotionNivelEmbudo {
  nivel: number
  jugadores: number
  /** Jugadores cuyo último nivel empezado es este. */
  quedaron: number
  /** De esos, los que llevan 7 días o más sin aparecer. */
  seFueron: number
}

export interface PotionAbandono {
  nivel: number
  cantidad: number
  /** Sobre los que llegaron a ese nivel. */
  pct: number | null
  /**
   * `true` si son jugadores que llevan 7 días sin aparecer. `false` si nadie
   * cumple eso todavía y el número es de los que están parados ahí: pueden
   * seguir jugando.
   */
  confirmado: boolean
}

export interface PotionNivel {
  nivel: number
  jugadores: number
  intentos: number
  victorias: number
  reinicios: number
  sinSalida: number
  /** `null` si nadie lo ganó en el rango. */
  intentosPorVictoria: number | null
}

export interface PotionComodin {
  cual: string
  usos: number
  jugadores: number
  /** Cuántos de los usos salieron de mirar un video. */
  porVideo: number
}

export interface PotionDuelos {
  empezados: number
  terminados: number
  ganados: number
  /** Empezados que no terminaron: salió con el botón o cerró el juego. */
  abandonados: number
  conElBoton: number
  jugadores: number
  pctGanados: number | null
}

export interface PotionPanel {
  disponible: boolean
  motivo: 'sin_configurar' | 'sin_migracion' | 'error' | null
  rango: Rango
  desdeLanzamiento: boolean
  hoy: string | null
  resumen: PotionResumen
  retencion: PotionCohorte[]
  embudo: PotionNivelEmbudo[]
  abandono: PotionAbandono | null
  niveles: PotionNivel[]
  comodines: PotionComodin[]
  paneles: {
    sinMonedas: number
    sinMonedasJugadores: number
    sinVidas: number
    sinVidasJugadores: number
    sinMonedasPorComodin: { cual: string; veces: number }[]
  }
  pase: {
    abrieron: number
    aperturas: number
    subieron: number
    escalones: number
    completaron: number
    proximamente: number
    /** Escalones por jugador que subió alguno. */
    escalonesPorJugador: number | null
    pctCompletan: number | null
  }
  duelos: { partidas: PotionDuelos; practica: PotionDuelos }
  generadoEn: string
}

// ── Lo que devuelve el SQL ─────────────────────────────────────────────────

/** Lo que manda `jsonb`: los `count` llegan como número, pero no se confía. */
type Crudo = Record<string, unknown>

interface FilaPanel {
  hoy?: string
  resumen?: Crudo
  retencion?: Crudo[]
  embudo?: Crudo[]
  niveles?: Crudo[]
  comodines?: Crudo[]
  paneles?: Crudo & { sinMonedasPorComodin?: Crudo[] }
  pase?: Crudo
  duelos?: Crudo[]
}

// ── Ayudas ─────────────────────────────────────────────────────────────────

/** A número finito. Cualquier otra cosa, 0: un `NaN` no llega a la pantalla. */
function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function nONull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function porcentaje(parte: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((parte / total) * 1000) / 10
}

function cociente(a: number, b: number): number | null {
  if (b <= 0) return null
  return Math.round((a / b) * 10) / 10
}

const DUELOS_VACIOS: PotionDuelos = {
  empezados: 0, terminados: 0, ganados: 0, abandonados: 0, conElBoton: 0, jugadores: 0, pctGanados: null,
}

function vacio(rango: Rango, desdeLanzamiento: boolean, motivo: PotionPanel['motivo']): PotionPanel {
  return {
    disponible: false, motivo, rango, desdeLanzamiento, hoy: null,
    resumen: {
      jugadores: 0, nuevosHoy: 0, nuevos7d: 0, activosHoy: 0, sesionesHoy: 0,
      duracionMediaSeg: null, sesionesMedidas: 0, eventos: 0,
    },
    retencion: [], embudo: [], abandono: null, niveles: [], comodines: [],
    paneles: { sinMonedas: 0, sinMonedasJugadores: 0, sinVidas: 0, sinVidasJugadores: 0, sinMonedasPorComodin: [] },
    pase: {
      abrieron: 0, aperturas: 0, subieron: 0, escalones: 0, completaron: 0, proximamente: 0,
      escalonesPorJugador: null, pctCompletan: null,
    },
    duelos: { partidas: DUELOS_VACIOS, practica: DUELOS_VACIOS },
    generadoEn: new Date().toISOString(),
  }
}

/** Falta correr `potion-panel.sql` en el proyecto del juego. */
function faltaLaMigracion(error: { code?: string; message?: string }): boolean {
  if (error.code === '42883' || error.code === 'PGRST202') return true
  return (error.message ?? '').toLowerCase().includes('could not find the function')
}

function duelos(fila: Crudo | undefined): PotionDuelos {
  if (!fila) return DUELOS_VACIOS
  const empezados = n(fila.empezados)
  const terminados = n(fila.terminados)
  const ganados = n(fila.ganados)
  return {
    empezados, terminados, ganados,
    // Un duelo terminado cuya partida se mandó antes que su inicio (o cuyo
    // inicio se perdió) haría negativa la resta. Cero, no -1.
    abandonados: Math.max(0, empezados - terminados),
    conElBoton: n(fila.conElBoton),
    jugadores: n(fila.jugadores),
    pctGanados: porcentaje(ganados, terminados),
  }
}

/**
 * El nivel donde más gente deja de jugar.
 *
 * Primero entre los que se fueron de verdad (7 días sin aparecer). Si nadie
 * cumple eso todavía —en la primera semana después de publicar, nadie—, el
 * nivel donde más gente está parada, avisando que puede ser simplemente
 * donde están hoy. Sin el respaldo la sección quedaría vacía justo cuando
 * más se la mira.
 *
 * El último nivel alcanzado por alguien queda afuera del segundo caso: ahí
 * "se quedó" el que va más adelante, que no abandonó nada.
 */
function abandonoPrincipal(embudo: PotionNivelEmbudo[]): PotionAbandono | null {
  const mayor = (clave: 'seFueron' | 'quedaron', filas: PotionNivelEmbudo[]) =>
    filas.reduce<PotionNivelEmbudo | null>(
      (mejor, f) => (f[clave] > 0 && (!mejor || f[clave] > mejor[clave]) ? f : mejor),
      null,
    )

  const seFue = mayor('seFueron', embudo)
  if (seFue) {
    return { nivel: seFue.nivel, cantidad: seFue.seFueron, pct: porcentaje(seFue.seFueron, seFue.jugadores), confirmado: true }
  }

  const tope = embudo.length > 0 ? embudo[embudo.length - 1].nivel : null
  const parado = mayor('quedaron', embudo.filter(f => f.nivel !== tope))
  if (parado) {
    return { nivel: parado.nivel, cantidad: parado.quedaron, pct: porcentaje(parado.quedaron, parado.jugadores), confirmado: false }
  }
  return null
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const pedido = params.get('rango')
  const rango: Rango = esRango(pedido) ? pedido : RANGO_POR_DEFECTO
  const desdeLanzamiento = params.get('lanzamiento') === '1'

  const potion = getPotionClient()
  if (!potion) {
    console.error('[admin/potion] faltan POTION_SUPABASE_URL o POTION_SUPABASE_SECRET')
    return NextResponse.json(vacio(rango, desdeLanzamiento, 'sin_configurar'))
  }

  const [{ data, error }, reales] = await Promise.all([
    potion.rpc('potion_panel', {
      p_rango: rango,
      p_lanzamiento: desdeLanzamiento ? LANZAMIENTO : null,
      p_zona: ZONA,
    }),
    contarReales(potion, rango, 'admin/potion'),
  ])

  if (error) {
    if (faltaLaMigracion(error)) {
      console.warn('[admin/potion] falta correr potion-panel.sql en el proyecto del juego')
      return NextResponse.json(vacio(rango, desdeLanzamiento, 'sin_migracion'))
    }
    console.error('[admin/potion] la consulta falló:', error.message)
    return NextResponse.json(vacio(rango, desdeLanzamiento, 'error'))
  }

  if (!reales) return NextResponse.json(vacio(rango, desdeLanzamiento, 'error'))

  const f = (data ?? {}) as FilaPanel
  const r = f.resumen ?? {}

  const resumen: PotionResumen = {
    // Sólo usuarios reales, siempre desde el lanzamiento: no miran la casilla.
    jugadores: reales.enRango,
    nuevosHoy: reales.nuevosHoy,
    nuevos7d: reales.nuevos7d,
    activosHoy: reales.jugaronHoy,
    sesionesHoy: n(r.sesionesHoy),
    duracionMediaSeg: nONull(r.duracionMediaSeg),
    sesionesMedidas: n(r.sesionesMedidas),
    eventos: n(r.eventos),
  }

  const retencion: PotionCohorte[] = (f.retencion ?? []).map(c => {
    const llegaron = n(c.llegaron)
    const d1 = n(c.d1), d3 = n(c.d3), d7 = n(c.d7), d30 = n(c.d30)
    return {
      dia: String(c.dia ?? ''),
      llegaron, d1, d3, d7, d30,
      // La bandera de madurez manda sobre el número: ver el SQL.
      d1Pct:  c.d1Maduro  === true ? porcentaje(d1,  llegaron) : null,
      d3Pct:  c.d3Maduro  === true ? porcentaje(d3,  llegaron) : null,
      d7Pct:  c.d7Maduro  === true ? porcentaje(d7,  llegaron) : null,
      d30Pct: c.d30Maduro === true ? porcentaje(d30, llegaron) : null,
    }
  })

  const embudo: PotionNivelEmbudo[] = (f.embudo ?? []).map(e => ({
    nivel: n(e.nivel),
    jugadores: n(e.jugadores),
    quedaron: n(e.quedaron),
    seFueron: n(e.seFueron),
  }))

  const niveles: PotionNivel[] = (f.niveles ?? []).map(l => {
    const intentos = n(l.intentos)
    const victorias = n(l.victorias)
    return {
      nivel: n(l.nivel),
      jugadores: n(l.jugadores),
      intentos,
      victorias,
      reinicios: n(l.reinicios),
      sinSalida: n(l.sinSalida),
      intentosPorVictoria: cociente(intentos, victorias),
    }
  })

  const comodines: PotionComodin[] = (f.comodines ?? []).map(c => ({
    cual: String(c.cual ?? '?'),
    usos: n(c.usos),
    jugadores: n(c.jugadores),
    porVideo: n(c.porVideo),
  }))

  const p = f.paneles ?? {}
  const pase = f.pase ?? {}
  const filaDuelos = f.duelos ?? []

  const subieron = n(pase.subieron)
  const abrieron = n(pase.abrieron)
  const completaron = n(pase.completaron)

  const panel: PotionPanel = {
    disponible: true,
    motivo: null,
    rango,
    desdeLanzamiento,
    hoy: typeof f.hoy === 'string' ? f.hoy : null,
    resumen,
    retencion,
    embudo,
    abandono: abandonoPrincipal(embudo),
    niveles,
    comodines,
    paneles: {
      sinMonedas: n(p.sinMonedas),
      sinMonedasJugadores: n(p.sinMonedasJugadores),
      sinVidas: n(p.sinVidas),
      sinVidasJugadores: n(p.sinVidasJugadores),
      sinMonedasPorComodin: (p.sinMonedasPorComodin ?? []).map(x => ({ cual: String(x.cual ?? '?'), veces: n(x.veces) })),
    },
    pase: {
      abrieron,
      aperturas: n(pase.aperturas),
      subieron,
      escalones: n(pase.escalones),
      completaron,
      proximamente: n(pase.proximamente),
      escalonesPorJugador: cociente(n(pase.escalones), subieron),
      // Sobre los que lo abrieron: el que nunca miró la pantalla igual sube
      // escalones jugando, pero "completar" se lee contra el que lo conoce.
      pctCompletan: porcentaje(completaron, Math.max(abrieron, subieron)),
    },
    duelos: {
      partidas: duelos(filaDuelos.find(d => d.practica !== true)),
      practica: duelos(filaDuelos.find(d => d.practica === true)),
    },
    generadoEn: new Date().toISOString(),
  }

  return NextResponse.json(panel)
}
