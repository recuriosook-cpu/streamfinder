import type { SupabaseClient } from '@supabase/supabase-js'
import { LANZAMIENTO, type Rango } from '@/lib/potion-panel'

/**
 * Los conteos de jugadores de `/admin/potion`.
 *
 * Un usuario es cualquier instalación con eventos desde el lanzamiento
 * (13/10/2026), sin separar a los testers ni a los que traían progreso.
 *
 * Lo usan las dos rutas del panel: `vivo` (las tarjetas de arriba) y la
 * principal (las tarjetas de jugadores de abajo, la retención y el embudo de
 * niveles), para que todos los números de jugadores salgan del mismo
 * criterio.
 *
 * La retención y el embudo siguen las mismas reglas que en
 * `potion-panel.sql` (cohortes por día de llegada, "maduro" cuando el día N
 * ya terminó, niveles repetidos afuera, "se fue" a los 7 días sin aparecer),
 * con una diferencia: siempre cuentan desde el lanzamiento, no miran la
 * casilla.
 *
 * ── Por qué se agrupa acá y no en SQL ─────────────────────────────────────
 *
 * La RPC `potion_panel` hay que correrla a mano en el proyecto del juego.
 * Esto no la toca: se bajan sólo cinco columnas de los eventos desde el
 * lanzamiento, paginando. Con unos pocos miles de eventos es un pedido; si la
 * tabla crece a cientos de miles, conviene pasarlo a una función SQL.
 *
 * Igual que `potion-panel.sql`: las fechas son `recibido` (llegada al
 * servidor), los días son de Argentina y los eventos de `version = 'prueba'`
 * no cuentan.
 */

export interface PotionUsuarios {
  /** Usuarios desde el lanzamiento. */
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
  /** Cohortes por día de llegada, la más nueva primero. Máximo 90. */
  retencion: Cohorte[]
  /** Por nivel, de menor a mayor. Sólo inicios del rango. */
  embudo: NivelEmbudo[]
  /**
   * `YYYY-MM-DD` → usuarios con algún evento ese día. Todos los días desde el
   * lanzamiento, sin mirar el rango. Lo usa la ganancia por usuario de AdMob.
   */
  activosPorDia: Record<string, number>
}

export interface Cohorte {
  /** `YYYY-MM-DD`, día de Buenos Aires. */
  dia: string
  llegaron: number
  d1: number
  d3: number
  d7: number
  d30: number
  /** Si el día N ya terminó. Si no, el número todavía no dice nada. */
  d1Maduro: boolean
  d3Maduro: boolean
  d7Maduro: boolean
  d30Maduro: boolean
}

export interface NivelEmbudo {
  nivel: number
  jugadores: number
  /** Jugadores cuyo último nivel empezado en el rango es este. */
  quedaron: number
  /** De esos, los que llevan 7 días o más sin aparecer. */
  seFueron: number
}

const AHORA_MS = 15 * 60_000
const SE_FUE_MS = 7 * 24 * 3600_000
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

type Fila = {
  instalacion: string | null
  nombre: string
  recibido: string
  nivel: number | null
  props: Record<string, unknown> | null
}

interface Instalacion {
  primerDia: string
  ultimaMs: number
  dias: Set<string>
  /** Niveles empezados en el rango, sin contar los repetidos. */
  niveles: Set<number>
}

/** `null` si la consulta falló; el detalle va al log con `etiqueta`. */
export async function contarUsuarios(
  potion: SupabaseClient,
  rango: Rango,
  etiqueta: string,
): Promise<PotionUsuarios | null> {
  // Ordenados por llegada: el primer evento de cada instalación es el primero
  // que aparece. `id` desempata para que la
  // paginación no saltee filas.
  const filas: Fila[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await potion
      .from('potion_eventos')
      .select('instalacion, nombre, recibido, nivel, props')
      .gte('recibido', LANZAMIENTO)
      .or('version.is.null,version.neq.prueba')
      .order('recibido', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA - 1)
    if (error) {
      console.error(`[${etiqueta}] la consulta de usuarios falló:`, error.message)
      return null
    }
    filas.push(...((data ?? []) as Fila[]))
    if (!data || data.length < PAGINA) break
  }

  const ahora = Date.now()
  const hoy = diaAR(ahora)
  const hace7 = restarDias(hoy, 6)
  const desdeRango = rango === 'hoy' ? hoy : rango === '7d' ? hace7 : null

  const instalaciones = new Map<string, Instalacion>()
  for (const f of filas) {
    if (!f.instalacion) continue
    const ms = new Date(f.recibido).getTime()
    const dia = diaAR(ms)
    let i = instalaciones.get(f.instalacion)
    if (!i) {
      i = { primerDia: dia, ultimaMs: ms, dias: new Set(), niveles: new Set() }
      instalaciones.set(f.instalacion, i)
    }
    i.ultimaMs = Math.max(i.ultimaMs, ms)
    i.dias.add(dia)
    // Como `inicios` en el SQL: `repite` puede llegar como booleano o texto.
    if (
      f.nombre === 'nivel_empieza' && f.nivel !== null && Number.isFinite(Number(f.nivel)) &&
      String(f.props?.repite) !== 'true' && (desdeRango === null || dia >= desdeRango)
    ) {
      i.niveles.add(Number(f.nivel))
    }
  }

  const r: PotionUsuarios = {
    total: 0, nuevosHoy: 0, nuevos7d: 0, jugaronHoy: 0, jugandoAhora: 0, enRango: 0, retencion: [], embudo: [],
    activosPorDia: {},
  }
  const cohortes = new Map<string, Cohorte>()
  const porNivel = new Map<number, NivelEmbudo>()
  for (const i of instalaciones.values()) {
    r.total++
    if (i.primerDia === hoy) r.nuevosHoy++
    if (i.primerDia >= hace7) r.nuevos7d++
    if (i.dias.has(hoy)) r.jugaronHoy++
    if (i.ultimaMs >= ahora - AHORA_MS) r.jugandoAhora++
    if (desdeRango === null || [...i.dias].some(d => d >= desdeRango)) r.enRango++
    for (const d of i.dias) r.activosPorDia[d] = (r.activosPorDia[d] ?? 0) + 1

    if (desdeRango === null || i.primerDia >= desdeRango) {
      let c = cohortes.get(i.primerDia)
      if (!c) {
        const maduro = (n: number) => restarDias(i.primerDia, -n) < hoy
        c = {
          dia: i.primerDia, llegaron: 0, d1: 0, d3: 0, d7: 0, d30: 0,
          d1Maduro: maduro(1), d3Maduro: maduro(3), d7Maduro: maduro(7), d30Maduro: maduro(30),
        }
        cohortes.set(i.primerDia, c)
      }
      c.llegaron++
      if (i.dias.has(restarDias(i.primerDia, -1)))  c.d1++
      if (i.dias.has(restarDias(i.primerDia, -3)))  c.d3++
      if (i.dias.has(restarDias(i.primerDia, -7)))  c.d7++
      if (i.dias.has(restarDias(i.primerDia, -30))) c.d30++
    }

    if (i.niveles.size > 0) {
      const ultimo = Math.max(...i.niveles)
      for (const nivel of i.niveles) {
        let e = porNivel.get(nivel)
        if (!e) {
          e = { nivel, jugadores: 0, quedaron: 0, seFueron: 0 }
          porNivel.set(nivel, e)
        }
        e.jugadores++
        if (nivel === ultimo) {
          e.quedaron++
          if (i.ultimaMs < ahora - SE_FUE_MS) e.seFueron++
        }
      }
    }
  }

  r.retencion = [...cohortes.values()].sort((a, b) => (a.dia < b.dia ? 1 : -1)).slice(0, 90)
  r.embudo = [...porNivel.values()].sort((a, b) => a.nivel - b.nivel)
  return r
}
