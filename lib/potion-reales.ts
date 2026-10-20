import type { SupabaseClient } from '@supabase/supabase-js'
import { LANZAMIENTO, type Rango } from '@/lib/potion-panel'

/**
 * Los conteos de jugadores de `/admin/potion`, sólo con usuarios reales.
 *
 * Un usuario real es una instalación cuyo primer `app_abre` desde el
 * lanzamiento fue en el nivel 1. Los testers que siguieron jugando después
 * del 13/10 abren en el nivel donde habían quedado, y así quedan afuera.
 *
 * Lo usan las dos rutas del panel: `vivo` (las tarjetas de arriba) y la
 * principal (las de "Jugadores", "Nuevos" y "Activos" de abajo), para que
 * todos los números de jugadores salgan del mismo criterio.
 *
 * ── Por qué se agrupa acá y no en SQL ─────────────────────────────────────
 *
 * La RPC `potion_panel` hay que correrla a mano en el proyecto del juego.
 * Esto no la toca: se bajan sólo cuatro columnas de los eventos desde el
 * lanzamiento, paginando. Con unos pocos miles de eventos es un pedido; si la
 * tabla crece a cientos de miles, conviene pasarlo a una función SQL.
 *
 * Igual que `potion-panel.sql`: las fechas son `recibido` (llegada al
 * servidor), los días son de Argentina y los eventos de `version = 'prueba'`
 * no cuentan.
 */

export interface PotionReales {
  /** Usuarios reales desde el lanzamiento. */
  total: number
  /** Su primer evento llegó hoy. */
  nuevosHoy: number
  /** Su primer evento llegó en los últimos 7 días, hoy incluido. */
  nuevos7d: number
  /** Con algún evento desde las 0 de hoy. */
  jugaronHoy: number
  /** Con algún evento en los últimos 15 minutos. */
  jugandoAhora: number
  /** Con algún evento en el rango pedido. */
  enRango: number
}

const AHORA_MS = 15 * 60_000
const PAGINA = 1000

/**
 * El día de Argentina de un instante, `YYYY-MM-DD`. Argentina no tiene
 * horario de verano, así que restar 3 horas fijas es exacto.
 */
function diaAR(ms: number): string {
  return new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
}

/** `YYYY-MM-DD` menos `n` días. */
function restarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

type Fila = { instalacion: string | null; nombre: string; recibido: string; props: Record<string, unknown> | null }

interface Instalacion {
  /** Si su primer `app_abre` fue en el nivel 1. `undefined`: todavía no abrió. */
  real?: boolean
  primerDia: string
  ultimaMs: number
  dias: Set<string>
}

/** `null` si la consulta falló; el detalle va al log con `etiqueta`. */
export async function contarReales(
  potion: SupabaseClient,
  rango: Rango,
  etiqueta: string,
): Promise<PotionReales | null> {
  // Ordenados por llegada: el primer evento y el primer `app_abre` de cada
  // instalación son los primeros que aparecen. `id` desempata para que la
  // paginación no saltee filas.
  const filas: Fila[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await potion
      .from('potion_eventos')
      .select('instalacion, nombre, recibido, props')
      .gte('recibido', LANZAMIENTO)
      .or('version.is.null,version.neq.prueba')
      .order('recibido', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA - 1)
    if (error) {
      console.error(`[${etiqueta}] la consulta de usuarios reales falló:`, error.message)
      return null
    }
    filas.push(...((data ?? []) as Fila[]))
    if (!data || data.length < PAGINA) break
  }

  const instalaciones = new Map<string, Instalacion>()
  for (const f of filas) {
    if (!f.instalacion) continue
    const ms = new Date(f.recibido).getTime()
    const dia = diaAR(ms)
    let i = instalaciones.get(f.instalacion)
    if (!i) {
      i = { primerDia: dia, ultimaMs: ms, dias: new Set() }
      instalaciones.set(f.instalacion, i)
    }
    i.ultimaMs = Math.max(i.ultimaMs, ms)
    i.dias.add(dia)
    if (f.nombre === 'app_abre' && i.real === undefined) i.real = Number(f.props?.nivel) === 1
  }

  const ahora = Date.now()
  const hoy = diaAR(ahora)
  const hace7 = restarDias(hoy, 6)
  const desdeRango = rango === 'hoy' ? hoy : rango === '7d' ? hace7 : null

  const r: PotionReales = { total: 0, nuevosHoy: 0, nuevos7d: 0, jugaronHoy: 0, jugandoAhora: 0, enRango: 0 }
  for (const i of instalaciones.values()) {
    if (!i.real) continue
    r.total++
    if (i.primerDia === hoy) r.nuevosHoy++
    if (i.primerDia >= hace7) r.nuevos7d++
    if (i.dias.has(hoy)) r.jugaronHoy++
    if (i.ultimaMs >= ahora - AHORA_MS) r.jugandoAhora++
    if (desdeRango === null || [...i.dias].some(d => d >= desdeRango)) r.enRango++
  }
  return r
}
