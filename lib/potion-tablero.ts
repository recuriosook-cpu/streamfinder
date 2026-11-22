import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { paqueteDe } from '@/lib/google-play-reports'
import { appIdIos } from '@/lib/potion-tiendas'
import { LANZAMIENTO, ZONA } from '@/lib/potion-panel'

/**
 * La pestaña "Jugadores" de `/admin/potion`: las tarjetas de arriba, las
 * alertas y el listado de jugadores, separando a los de prueba.
 *
 * ── Las reglas ──────────────────────────────────────────────────────────────
 *
 * Cada número dice de qué fecha es su último dato. Un número que no se pudo
 * leer es `valor: null` con el motivo, nunca un 0: en la pantalla dice
 * "sin dato".
 *
 * ── Quién es un jugador real ───────────────────────────────────────────────
 *
 * Un aparato (una instalación del juego) es real salvo que, en este orden:
 *
 *   1. Esté marcado a mano en `potion_aparatos_marca`. La marca manda sobre
 *      todo lo demás, en los dos sentidos: también sirve para devolver a
 *      "reales" a uno que la regla automática se llevó.
 *   2. Sea de la versión web (sólo hubo pruebas).
 *   3. El juego lo haya marcado como robot de Google (`robot` en `app_abre`,
 *      desde la 1.3.0 de Android).
 *   4. Parezca un robot de Google: ver `robotsProbables`.
 *   5. Sea un iPhone que nunca jugó con una versión de la App Store después
 *      de que esa versión salió. Lo de antes es TestFlight o la revisión de
 *      Apple. No depende de los informes de ventas de Apple: las versiones y
 *      sus fechas están en `potion_versiones_tienda`, que se completa sola
 *      con la API pública de iTunes (`asegurarVersionesIos`).
 *   6. Sea un Android que empezó antes del lanzamiento (13/10): la prueba
 *      cerrada de Play.
 *
 * Ningún evento se borra: los de prueba van a su pestaña.
 */

// ── Tipos ──────────────────────────────────────────────────────────────────

export type Plataforma = 'android' | 'ios'

/** Un número con la fecha de su último dato, o "sin dato" con el porqué. */
export interface Dato {
  valor: number | null
  /** ISO (`momento`) o `YYYY-MM-DD` (`dia`). `null` si no hay dato. */
  fecha: string | null
  tipoFecha: 'dia' | 'momento'
  /** Por qué no hay número. Sólo cuando `valor` es `null`. */
  motivo?: string
  /** El último dato es viejo: se muestra igual, pero avisando. */
  atrasado?: string
  /** Aclaración corta de qué cuenta. */
  nota?: string
}

export type Clase = 'real' | 'prueba' | 'robot'

export interface Jugador {
  id: string
  plataforma: Plataforma | 'web'
  version: string
  /** Código de dos letras. `null`: los eventos de antes del 16/11 no lo traen. */
  pais: string | null
  desde: string
  ultimo: string
  dias: number
  eventos: number
  /** Hasta dónde llegó. Pasado el último nivel, el juego informa uno más. */
  nivelActual: number | null
  maxGanado: number | null
  /** Los niveles de su versión. `null`: versión desconocida. */
  totalNiveles: number | null
  /** Ganó el último nivel de la versión que tiene hoy. */
  termino: boolean
  terminoEn: string | null
  clase: Clase
  /** Por qué no es real. */
  motivo: string | null
  /** La clase sale de una marca a mano. */
  marcado: boolean
}

export interface Alerta {
  tipo: 'ultimo_nivel' | 'nuevo_ios' | 'copia_apple' | 'copia_google' | 'atrasado' | 'sin_dato' | 'cuadre' | 'niveles'
  nivel: 'info' | 'aviso' | 'error'
  texto: string
  /** Cuándo pasó, ISO. */
  fecha: string | null
  jugador?: string
}

/** Cuántas instalaciones vio el propio juego, separadas por clase. */
export interface Separacion {
  /** `null` si no se pudieron leer los eventos. */
  android: { personas: number; robots: number; prueba: number } | null
  ios: { personas: number; prueba: number } | null
  /** Los robots, agrupados por la versión que vinieron a probar. */
  robotsPorVersion: { version: string; dia: string; cantidad: number }[]
  /** El último evento del juego, ISO. */
  fecha: string | null
  motivo?: string
}

/** Las desinstalaciones de Android según Google Play. Apple no da este dato. */
export interface Borraron {
  /** Desde el lanzamiento. `null`: sin dato, con el motivo. */
  valor: number | null
  motivo?: string
  /** Las descargas de Android desde el lanzamiento, para el porcentaje. */
  descargas: number
  porcentaje: number | null
  /** Los últimos 7 y 30 días hasta `fecha`, y desde qué día cuentan. */
  ult7: number | null
  ult30: number | null
  desde7: string | null
  desde30: string | null
  /** Días en los que Google no trajo el dato: no se cuentan como 0. */
  faltan: number
  /** El último día que publicó Google, `YYYY-MM-DD`. */
  fecha: string | null
  atrasado?: string
}

export interface PotionTablero {
  separacion: Separacion
  tarjetas: {
    descargas: Record<Plataforma, Dato>
    tienen: Record<Plataforma, Dato>
    borraron: Borraron
    hoy: Record<Plataforma, Dato>
    semana: Record<Plataforma, Dato>
    /** Abrieron el juego en los últimos 30 días, hoy incluido. */
    mes: Record<Plataforma, Dato>
  }
  /** Lo que falla o está atrasado. */
  avisos: Alerta[]
  /** La tabla de niveles quedó vieja: va arriba de todo, en cualquier pestaña. */
  avisosNiveles: Alerta[]
  /** Lo que pasó con los jugadores: último nivel, iPhone nuevos. */
  alertas: Alerta[]
  reales: Jugador[]
  prueba: Jugador[]
  /** Desde cuándo está cada versión de iPhone en la App Store. */
  versionesIos: { version: string; desde: string }[]
  generadoEn: string
}

// ── Constantes ─────────────────────────────────────────────────────────────

const DIA_MS = 24 * 3600_000
const LANZAMIENTO_MS = Date.parse(LANZAMIENTO)
const DESDE_DIA = LANZAMIENTO.slice(0, 10)

/**
 * Cuántos niveles trae cada versión del juego. El paquete de niveles sale
 * de `botellas/src/game/levels.json`:
 *
 *   - Hasta la 1.0.0 (el lanzamiento, 13/10): 600.
 *   - Desde la 1.0.7 (19/10): 1000. La 1.3.0 también trae 1000.
 *   - Desde la 1.4.0 (19/11): 1500.
 *
 * AL PUBLICAR UNA VERSIÓN NUEVA HAY QUE AGREGARLA ACÁ, aunque no traiga
 * niveles nuevos (con el mismo total que la anterior). Si no, el panel avisa
 * arriba de todo (`revisarTablaDeNiveles`):
 *
 *   - en amarillo, apenas alguien juega con una versión más nueva que la
 *     última de la tabla;
 *   - en rojo, si alguien pasó el total que la tabla le da a su versión. Ese
 *     jugador muestra "sin dato" en vez de decir que terminó.
 */
const NIVELES_POR_VERSION: { desde: string; niveles: number }[] = [
  { desde: '1.0.0', niveles: 600 },
  { desde: '1.0.7', niveles: 1000 },
  { desde: '1.4.0', niveles: 1500 },
]

/**
 * A qué hora UTC corre cada copia (`vercel.json`). Con un margen: si a esa
 * hora más el margen no hay corrida de hoy, "no corrió hoy".
 */
const COPIA_APPLE_UTC = { h: 16, m: 15 }
const COPIA_GOOGLE_UTC = { h: 9, m: 30 }
const MARGEN_COPIA_MS = 45 * 60_000

/** Google publica con 2 o 3 días de demora; más que esto es "atrasado". */
const PLAY_ATRASADO_DIAS = 4
/** Apple publica el día anterior; más que esto es "atrasado". */
const APPLE_ATRASADO_DIAS = 3

// ── Ayudas ─────────────────────────────────────────────────────────────────

/** El día de Argentina, `YYYY-MM-DD`. Argentina no tiene horario de verano. */
function diaAR(ms: number): string {
  return new Date(ms - 3 * 3600_000).toISOString().slice(0, 10)
}

function restarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS)
}

/** `1.1.2 (5)` → `1.1.2`. */
export function nombreDeVersion(v: string | null | undefined): string {
  return (v ?? '').split(' (')[0].trim()
}

function compararVersiones(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export function nivelesDeLaVersion(version: string | null | undefined): number | null {
  const v = nombreDeVersion(version)
  if (!/^\d+\.\d+\.\d+$/.test(v)) return null
  let total: number | null = null
  for (const t of NIVELES_POR_VERSION) if (compararVersiones(v, t.desde) >= 0) total = t.niveles
  return total
}

/**
 * Los avisos de que la tabla de niveles quedó vieja. Mira a todos los
 * aparatos menos los de la web: los de prueba suelen ser los primeros en
 * tener la versión nueva, así que avisan antes.
 */
function revisarTablaDeNiveles(crudos: AparatoCrudo[]): Alerta[] {
  const ultima = NIVELES_POR_VERSION[NIVELES_POR_VERSION.length - 1]
  const nuevas = new Map<string, number>()
  const pasados = new Map<string, { tabla: number; nivel: number; jugadores: number }>()
  for (const a of crudos) {
    if (a.plataforma === 'web') continue
    const v = nombreDeVersion(a.version)
    if (!/^\d+\.\d+\.\d+$/.test(v)) continue
    if (compararVersiones(v, ultima.desde) > 0) nuevas.set(v, (nuevas.get(v) ?? 0) + 1)
    const total = nivelesDeLaVersion(v)
    if (total === null) continue
    // Pasado el último nivel el juego informa uno más: eso no es pasarse.
    const nivel = Math.max((a.nivelActual ?? 0) - 1, a.maxGanado ?? 0)
    if (nivel > total) {
      const p = pasados.get(v)
      if (p) { p.jugadores++; p.nivel = Math.max(p.nivel, nivel) } else pasados.set(v, { tabla: total, nivel, jugadores: 1 })
    }
  }
  const fmt = (n: number) => n.toLocaleString('es-AR')
  const ordenar = (a: string, b: string) => compararVersiones(b, a)
  const avisos: Alerta[] = []
  for (const v of [...pasados.keys()].sort(ordenar)) {
    const p = pasados.get(v)!
    avisos.push({
      tipo: 'niveles', nivel: 'error', fecha: null,
      texto: `Falta cargar los niveles de la ${v}: ${p.jugadores === 1 ? 'un jugador ya pasó' : `${p.jugadores} jugadores ya pasaron`} el nivel ${fmt(p.tabla)} (el más lejos ganó el ${fmt(p.nivel)}), que es el último según la tabla. Agregá la ${v} con su total en NIVELES_POR_VERSION (lib/potion-tablero.ts). Mientras tanto su nivel dice "sin dato".`,
    })
  }
  const soloNuevas = [...nuevas.keys()].filter(v => !pasados.has(v)).sort(ordenar)
  if (soloNuevas.length > 0) {
    const lista = soloNuevas.map(v => `${v} (${nuevas.get(v) === 1 ? '1 aparato' : `${nuevas.get(v)} aparatos`})`).join(', ')
    avisos.push({
      tipo: 'niveles', nivel: 'aviso', fecha: null,
      texto: `Hay quien juega con ${soloNuevas.length === 1 ? 'una versión que no está' : 'versiones que no están'} en la tabla de niveles: ${lista}. La tabla llega hasta la ${ultima.desde} (${fmt(ultima.niveles)} niveles). Agregá ${soloNuevas.length === 1 ? 'esa versión' : 'esas versiones'} en NIVELES_POR_VERSION (lib/potion-tablero.ts) con su total, aunque no traiga${soloNuevas.length === 1 ? '' : 'n'} niveles nuevos.`,
    })
  }
  return avisos
}

/** El momento de la corrida de hoy, o de ayer si la de hoy todavía no tocaba. */
function ultimaCorridaEsperada(ahora: number, hora: { h: number; m: number }): number {
  const d = new Date(ahora)
  const hoy = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hora.h, hora.m)
  return ahora >= hoy + MARGEN_COPIA_MS ? hoy : hoy - DIA_MS
}

/** 'hoy' si la corrida esperada es de hoy (UTC), 'ayer' si no. */
function cuandoTocaba(esperada: number, ahora: number): string {
  return new Date(esperada).toISOString().slice(0, 10) === new Date(ahora).toISOString().slice(0, 10) ? 'hoy' : 'ayer'
}

function fmtDia(dia: string): string {
  const [, m, d] = dia.split('-')
  return `${Number(d)}/${Number(m)}`
}

function fmtMomento(iso: string): string {
  const ms = Date.parse(iso)
  const dia = diaAR(ms)
  const hora = new Date(ms - 3 * 3600_000).toISOString().slice(11, 16)
  return `${fmtDia(dia)} ${hora}`
}

const sinDato = (motivo: string, tipoFecha: Dato['tipoFecha'] = 'momento'): Dato =>
  ({ valor: null, fecha: null, tipoFecha, motivo })

// ── Lo que devuelve potion_aparatos() ──────────────────────────────────────

interface AparatoCrudo {
  id: string
  plataforma: string | null
  version: string | null
  pais: string | null
  primero: string
  ultimo: string
  eventos: number
  dias: number
  nivelActual: number | null
  maxGanado: number | null
  ganadoEn: string | null
  ganadoVersion: string | null
  robot: boolean | null
  /** versión completa → [primer evento, último evento], en ms. */
  versiones: Record<string, [number, number]> | null
  marca: 'prueba' | 'real' | null
  marcaMotivo: string | null
}

// ── Versiones de la App Store ──────────────────────────────────────────────

/**
 * Agrega la versión que hoy está en la App Store si todavía no estaba. La
 * API de búsqueda de iTunes es pública y sin clave; `currentVersionReleaseDate`
 * es cuándo salió la versión actual. Si no contesta, queda lo que ya estaba
 * en la tabla: no es motivo para romper el panel.
 */
async function asegurarVersionesIos(potion: SupabaseClient): Promise<{ version: string; desde: string }[] | null> {
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${appIdIos()}&country=us`, {
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    })
    if (res.ok) {
      const j = await res.json() as { results?: { version?: string; currentVersionReleaseDate?: string }[] }
      const r = j.results?.[0]
      if (r?.version && r.currentVersionReleaseDate) {
        await potion.from('potion_versiones_tienda')
          .upsert({ plataforma: 'ios', version: r.version, desde: r.currentVersionReleaseDate },
            { onConflict: 'plataforma,version', ignoreDuplicates: true })
      }
    }
  } catch (e) {
    console.warn('[potion-tablero] la búsqueda de iTunes no contestó:', e instanceof Error ? e.message : e)
  }
  const { data, error } = await potion.from('potion_versiones_tienda')
    .select('version, desde').eq('plataforma', 'ios').order('desde', { ascending: true })
  if (error) {
    console.error('[potion-tablero] potion_versiones_tienda falló:', error.message)
    return null
  }
  return (data ?? []) as { version: string; desde: string }[]
}

// ── Robots ─────────────────────────────────────────────────────────────────

/**
 * Los robots de Google que el juego no marcó.
 *
 * Cada versión que se sube a Play la abren solos 3 o 4 aparatos de Google en
 * un par de horas, juegan un rato el nivel 1 y no vuelven nunca. La marca
 * del juego (1.3.0) no llegó en ninguno de los de la 1.3.0, así que hace
 * falta reconocerlos por la forma: un Android que jugó un solo día, con
 * pocos eventos y sin pasar del nivel 8, y al menos otros dos iguales, con la
 * misma versión, que aparecieron dentro de las 2 horas.
 *
 * Revisado contra todas las versiones hasta la 1.3.0: agarra los grupos del
 * 4/10, 6/10, 19/10, 20/10, 21/10, 23/10, 5/11 y 16/11, y ningún jugador que
 * haya vuelto otro día.
 */
const ROBOT_VENTANA_MS = 2 * 3600_000

function robotsProbables(aparatos: AparatoCrudo[]): Set<string> {
  const candidatos = aparatos.filter(a =>
    a.plataforma === 'android' && a.dias === 1 && a.eventos <= 40 && (a.nivelActual ?? 1) <= 8)
  const robots = new Set<string>()
  for (const a of candidatos) {
    const t = Date.parse(a.primero)
    const vecinos = candidatos.filter(b =>
      b.version === a.version && Math.abs(Date.parse(b.primero) - t) <= ROBOT_VENTANA_MS)
    if (vecinos.length >= 3) robots.add(a.id)
  }
  return robots
}

// ── Clasificación ──────────────────────────────────────────────────────────

function clasificar(
  a: AparatoCrudo,
  robots: Set<string>,
  versionesIos: Map<string, number> | null,
): { clase: Clase; motivo: string | null; marcado: boolean } {
  if (a.marca === 'prueba') return { clase: 'prueba', motivo: a.marcaMotivo || 'Marcado a mano como de prueba', marcado: true }
  if (a.marca === 'real') return { clase: 'real', motivo: null, marcado: true }
  if (a.plataforma === 'web') return { clase: 'prueba', motivo: 'Versión web (sólo hubo pruebas)', marcado: false }
  if (a.robot) return { clase: 'robot', motivo: 'El juego lo marcó como robot de Google', marcado: false }
  if (robots.has(a.id)) {
    return { clase: 'robot', motivo: 'Robot de Google probable: 3 o más Android nuevos en 2 horas con la misma versión, un solo día', marcado: false }
  }
  if (a.plataforma === 'ios') {
    if (versionesIos === null) return { clase: 'real', motivo: null, marcado: false }
    const deTienda = Object.entries(a.versiones ?? {}).some(([v, [, hasta]]) => {
      const desde = versionesIos.get(nombreDeVersion(v))
      return desde !== undefined && hasta >= desde
    })
    if (!deTienda) {
      return { clase: 'prueba', motivo: 'TestFlight o revisión de Apple: nunca jugó con una versión de la App Store después de que salió', marcado: false }
    }
  }
  if (a.plataforma === 'android' && Date.parse(a.primero) < LANZAMIENTO_MS) {
    return { clase: 'prueba', motivo: 'Empezó antes del lanzamiento (prueba cerrada de Play)', marcado: false }
  }
  return { clase: 'real', motivo: null, marcado: false }
}

function aJugador(a: AparatoCrudo, c: ReturnType<typeof clasificar>): Jugador {
  let total = nivelesDeLaVersion(a.version)
  // La tabla de niveles quedó vieja para esta versión: mejor "sin dato" que
  // decir que terminó. Misma regla que `revisarTablaDeNiveles`.
  if (total !== null && Math.max((a.nivelActual ?? 0) - 1, a.maxGanado ?? 0) > total) total = null
  const termino = total !== null && a.maxGanado !== null && a.maxGanado >= total
  const plataforma = a.plataforma === 'ios' || a.plataforma === 'android' || a.plataforma === 'web' ? a.plataforma : 'android'
  return {
    id: a.id,
    plataforma,
    version: a.version ?? '',
    pais: a.pais,
    desde: a.primero,
    ultimo: a.ultimo,
    dias: a.dias,
    eventos: a.eventos,
    nivelActual: a.nivelActual,
    maxGanado: a.maxGanado,
    totalNiveles: total,
    termino,
    terminoEn: termino ? a.ganadoEn : null,
    clase: c.clase,
    motivo: c.motivo,
    marcado: c.marcado,
  }
}

// ── Las tiendas ────────────────────────────────────────────────────────────

interface Play {
  ok: boolean
  motivo?: string
  total: number
  base: number | null
  ultimaFecha: string | null
  /** La última vez que corrió la copia (el `actualizado_en` más nuevo). */
  copiaEn: string | null
  /** Las desinstalaciones de cada día, `null` si Google no trajo el dato. */
  bajas?: { fecha: string; cantidad: number | null }[]
}

async function leerPlay(admin: SupabaseClient): Promise<Play> {
  const { data, error } = await admin.from('play_install_stats')
    .select('fecha, instalaciones, desinstalaciones, base_instalada, actualizado_en')
    .eq('package_name', paqueteDe('potion')).gte('fecha', DESDE_DIA)
    .order('fecha', { ascending: true }).limit(1000)
  if (error) return { ok: false, motivo: `No se pudo leer play_install_stats: ${error.message}`, total: 0, base: null, ultimaFecha: null, copiaEn: null }
  const filas = (data ?? []) as {
    fecha: string; instalaciones: number | null; desinstalaciones: number | null; base_instalada: number | null; actualizado_en: string | null
  }[]
  if (filas.length === 0) return { ok: false, motivo: 'Google Play todavía no informó ningún día', total: 0, base: null, ultimaFecha: null, copiaEn: null }
  let total = 0
  let copiaEn: string | null = null
  for (const f of filas) {
    total += f.instalaciones ?? 0
    if (f.actualizado_en && (!copiaEn || f.actualizado_en > copiaEn)) copiaEn = f.actualizado_en
  }
  const conBase = filas.filter(f => f.base_instalada !== null)
  return {
    ok: true,
    total,
    base: conBase.length > 0 ? conBase[conBase.length - 1].base_instalada : null,
    ultimaFecha: filas[filas.length - 1].fecha,
    copiaEn,
    bajas: filas.map(f => ({ fecha: f.fecha, cantidad: f.desinstalaciones })),
  }
}

/**
 * El cuadro "Lo borraron": las desinstalaciones que informa Google Play
 * ("Uninstall events" del informe de instalaciones). Son eventos, no
 * aparatos: quien lo borra, lo vuelve a bajar y lo borra otra vez cuenta dos.
 * Y entran los aparatos de la prueba cerrada, que ya lo tenían antes del
 * lanzamiento y lo borraron después.
 *
 * Los 7 y 30 días se cuentan hasta el último día que publicó Google, no
 * hasta hoy: Google publica con días de atraso y, contando hasta hoy, los
 * últimos días saldrían siempre de menos.
 */
function armarBorraron(play: Play, atrasado: string | undefined): Borraron {
  const vacio = { ult7: null, ult30: null, desde7: null, desde30: null, faltan: 0, porcentaje: null, descargas: play.total }
  if (!play.ok) return { valor: null, fecha: null, motivo: play.motivo ?? 'Sin datos de Google Play', ...vacio }
  const bajas = play.bajas ?? []
  const conDato = bajas.filter(b => b.cantidad !== null)
  if (conDato.length === 0 || !play.ultimaFecha) {
    return { valor: null, fecha: play.ultimaFecha, motivo: 'Google Play no trajo desinstalaciones para ningún día', ...vacio }
  }
  const sumaDesde = (desde: string) => {
    const dias = bajas.filter(b => b.fecha >= desde)
    const con = dias.filter(b => b.cantidad !== null)
    return con.length === 0 ? null : con.reduce((s, b) => s + (b.cantidad ?? 0), 0)
  }
  const desde7 = restarDias(play.ultimaFecha, 6)
  const desde30 = restarDias(play.ultimaFecha, 29)
  const valor = conDato.reduce((s, b) => s + (b.cantidad ?? 0), 0)
  return {
    valor,
    descargas: play.total,
    porcentaje: play.total > 0 ? Math.round((valor / play.total) * 100) : null,
    ult7: sumaDesde(desde7),
    ult30: sumaDesde(desde30),
    desde7,
    desde30,
    faltan: bajas.length - conDato.length,
    fecha: play.ultimaFecha,
    atrasado,
  }
}

interface DiaCorrida { fecha: string; estado: string; http: number | null; unidades?: number; apps?: { id: string; titulo: string; unidades: number }[]; detalle?: string }

interface Apple {
  /** Se pudo leer la tabla de descargas. */
  ok: boolean
  motivo?: string
  total: number
  /**
   * El último día con informe de Apple. Un 404 no cuenta: para una cuenta
   * que vende todos los días (Glynbox) es "todavía no está listo", no
   * "no hubo nada".
   */
  ultimoDiaRespondido: string | null
  /** La última corrida de la copia. */
  corrida: { en: string; ok: boolean; motivo: string | null; dias: DiaCorrida[] } | null
  corridaMotivo?: string
  /** Las otras apps que traían los informes de la última corrida (por título). */
  otrasApps: string[]
}

async function leerApple(admin: SupabaseClient): Promise<Apple> {
  const appId = appIdIos()
  const [desc, corr] = await Promise.all([
    admin.from('appstore_descargas').select('fecha, descargas')
      .eq('app_id', appId).gte('fecha', DESDE_DIA).limit(5000),
    admin.from('appstore_corridas').select('corrida_en, ok, motivo, dias')
      .eq('app_id', appId).order('corrida_en', { ascending: false }).limit(1).maybeSingle(),
  ])
  const r: Apple = { ok: !desc.error, total: 0, ultimoDiaRespondido: null, corrida: null, otrasApps: [] }
  if (desc.error) r.motivo = `No se pudo leer appstore_descargas: ${desc.error.message}`
  for (const f of (desc.data ?? []) as { descargas: number }[]) r.total += f.descargas
  if (corr.error) {
    r.corridaMotivo = `No se pudo leer el registro de la copia de Apple: ${corr.error.message}`
  } else if (corr.data) {
    const c = corr.data as { corrida_en: string; ok: boolean; motivo: string | null; dias: DiaCorrida[] | null }
    r.corrida = { en: c.corrida_en, ok: c.ok, motivo: c.motivo, dias: c.dias ?? [] }
    const otras = new Set<string>()
    for (const d of r.corrida.dias) for (const a of d.apps ?? []) if (a.id !== appId) otras.add(a.titulo || a.id)
    r.otrasApps = [...otras]
    for (const d of r.corrida.dias) {
      if (d.estado === 'ok' && (!r.ultimoDiaRespondido || d.fecha > r.ultimoDiaRespondido)) {
        r.ultimoDiaRespondido = d.fecha
      }
    }
  }
  return r
}

// ── El tablero ─────────────────────────────────────────────────────────────

export async function armarTablero(potion: SupabaseClient | null, admin: SupabaseClient | null): Promise<PotionTablero> {
  const ahora = Date.now()
  const hoy = diaAR(ahora)
  const hace7 = restarDias(hoy, 6)
  const hace30 = restarDias(hoy, 29)
  const avisos: Alerta[] = []
  const alertas: Alerta[] = []

  // Todo en paralelo: cada fuente que falla deja su parte "sin dato" y no
  // arrastra a las otras.
  type Lectura = { data: AparatoCrudo[]; error?: undefined } | { data?: undefined; error: string }
  const [crudo, versionesIos, play, apple] = await Promise.all([
    potion
      ? potion.rpc('potion_aparatos', { p_zona: ZONA }).then(
          (r): Lectura => (r.error ? { error: r.error.message } : { data: (r.data ?? []) as AparatoCrudo[] }),
          (e: unknown): Lectura => ({ error: e instanceof Error ? e.message : String(e) }),
        )
      : Promise.resolve<Lectura>({ error: 'Faltan POTION_SUPABASE_URL o POTION_SUPABASE_SECRET en Vercel' }),
    potion ? asegurarVersionesIos(potion) : Promise.resolve(null),
    admin ? leerPlay(admin) : Promise.resolve<Play>({ ok: false, motivo: 'Sin conexión con la base de Glynbox', total: 0, base: null, ultimaFecha: null, copiaEn: null }),
    admin ? leerApple(admin) : Promise.resolve<Apple>({ ok: false, motivo: 'Sin conexión con la base de Glynbox', total: 0, ultimoDiaRespondido: null, corrida: null, otrasApps: [] }),
  ])

  // ── Jugadores ──
  let jugadores: Jugador[] = []
  let ultimoEvento: string | null = null
  let avisosNiveles: Alerta[] = []
  const eventosMotivo = crudo.error !== undefined ? `No se pudieron leer los eventos del juego: ${crudo.error}` : null
  if (eventosMotivo) {
    avisos.push({ tipo: 'sin_dato', nivel: 'error', texto: eventosMotivo, fecha: null })
  } else if (crudo.data) {
    const mapaIos = versionesIos ? new Map(versionesIos.map(v => [v.version, Date.parse(v.desde)])) : null
    if (!mapaIos) {
      avisos.push({ tipo: 'sin_dato', nivel: 'aviso', texto: 'No se pudieron leer las versiones de la App Store: los iPhone de TestFlight cuentan como reales hasta que vuelva.', fecha: null })
    }
    avisosNiveles = revisarTablaDeNiveles(crudo.data)
    const robots = robotsProbables(crudo.data)
    jugadores = crudo.data.map(a => aJugador(a, clasificar(a, robots, mapaIos)))
    for (const j of jugadores) if (!ultimoEvento || j.ultimo > ultimoEvento) ultimoEvento = j.ultimo
  }
  const reales = jugadores.filter(j => j.clase === 'real').sort((a, b) => (a.ultimo < b.ultimo ? 1 : -1))
  const prueba = jugadores.filter(j => j.clase !== 'real').sort((a, b) => (a.ultimo < b.ultimo ? 1 : -1))

  const separacion: Separacion = eventosMotivo
    ? { android: null, ios: null, robotsPorVersion: [], fecha: null, motivo: eventosMotivo }
    : (() => {
        const de = (p: Plataforma, c: Clase) => jugadores.filter(j => j.plataforma === p && j.clase === c).length
        const grupos = new Map<string, { version: string; dia: string; cantidad: number }>()
        for (const j of jugadores) {
          if (j.clase !== 'robot') continue
          const version = nombreDeVersion(j.version) || 'sin versión'
          const g = grupos.get(version)
          const dia = diaAR(Date.parse(j.desde))
          if (g) { g.cantidad++; if (dia < g.dia) g.dia = dia } else grupos.set(version, { version, dia, cantidad: 1 })
        }
        return {
          android: { personas: de('android', 'real'), robots: de('android', 'robot'), prueba: de('android', 'prueba') },
          ios: { personas: de('ios', 'real'), prueba: de('ios', 'prueba') + de('ios', 'robot') },
          robotsPorVersion: [...grupos.values()].sort((a, b) => (a.dia < b.dia ? 1 : -1)),
          fecha: ultimoEvento,
        }
      })()

  const deEventos = (valor: (p: Plataforma) => number, nota: string): Record<Plataforma, Dato> => {
    const uno = (p: Plataforma): Dato => eventosMotivo
      ? sinDato(eventosMotivo)
      : { valor: valor(p), fecha: ultimoEvento, tipoFecha: 'momento', nota }
    return { android: uno('android'), ios: uno('ios') }
  }
  const realesDe = (p: Plataforma) => reales.filter(j => j.plataforma === p)

  const tHoy = deEventos(p => realesDe(p).filter(j => diaAR(Date.parse(j.ultimo)) === hoy).length,
    'Abrieron el juego desde las 0 h de Argentina')
  const tSemana = deEventos(p => realesDe(p).filter(j => diaAR(Date.parse(j.ultimo)) >= hace7).length,
    'Abrieron el juego en los últimos 7 días, hoy incluido')
  const tMes = deEventos(p => realesDe(p).filter(j => diaAR(Date.parse(j.ultimo)) >= hace30).length,
    'Abrieron el juego en los últimos 30 días, hoy incluido')

  // ── Descargas y "tienen el juego" ──
  const playAtrasado = play.ultimaFecha && diasEntre(play.ultimaFecha, hoy) > PLAY_ATRASADO_DIAS
    ? `Google Play publica con demora: el último día informado es el ${fmtDia(play.ultimaFecha)} (hace ${diasEntre(play.ultimaFecha, hoy)} días)`
    : undefined

  const descAndroid: Dato = play.ok
    ? { valor: play.total, fecha: play.ultimaFecha, tipoFecha: 'dia', atrasado: playAtrasado, nota: 'Lo cuenta Google Play desde el lanzamiento (13/10), sin sus robots' }
    : sinDato(play.motivo ?? 'Sin datos de Google Play', 'dia')
  const tieneAndroid: Dato = play.ok && play.base !== null
    ? { valor: play.base, fecha: play.ultimaFecha, tipoFecha: 'dia', atrasado: playAtrasado, nota: 'Google Play: aparatos con el juego instalado' }
    : sinDato(play.motivo ?? 'Google Play no informó aparatos con el juego', 'dia')

  let descIos: Dato
  if (!apple.ok) descIos = sinDato(apple.motivo ?? 'No se pudo leer', 'dia')
  else if (apple.corridaMotivo) descIos = sinDato(apple.corridaMotivo, 'dia')
  else if (!apple.corrida) descIos = sinDato('La copia de Apple todavía no dejó registro de ninguna corrida', 'dia')
  else if (!apple.ultimoDiaRespondido) {
    descIos = sinDato(`Apple no contestó ningún día en la última copia (${fmtMomento(apple.corrida.en)}): ${apple.corrida.motivo ?? 'sin detalle'}`, 'dia')
  } else {
    const atraso = diasEntre(apple.ultimoDiaRespondido, hoy)
    descIos = {
      valor: apple.total, fecha: apple.ultimoDiaRespondido, tipoFecha: 'dia',
      atrasado: atraso > APPLE_ATRASADO_DIAS ? `Apple contestó hasta el ${fmtDia(apple.ultimoDiaRespondido)} (hace ${atraso} días)` : undefined,
      nota: 'Lo cuenta Apple: primeras descargas desde que salió',
    }
  }

  const iosActivos30 = realesDe('ios').filter(j => Date.parse(j.ultimo) >= ahora - 30 * DIA_MS).length
  const tieneIos: Dato = eventosMotivo
    ? sinDato(eventosMotivo)
    : { valor: iosActivos30, fecha: ultimoEvento, tipoFecha: 'momento', nota: 'Apple no lo da: son los iPhone que abrieron el juego en los últimos 30 días, según el juego' }

  // ── Avisos de las copias ──
  const esperadaApple = ultimaCorridaEsperada(ahora, COPIA_APPLE_UTC)
  if (apple.corrida && Date.parse(apple.corrida.en) < esperadaApple - 15 * 60_000) {
    avisos.push({ tipo: 'copia_apple', nivel: 'error', texto: `La copia de Apple no corrió ${cuandoTocaba(esperadaApple, ahora)}. La última fue el ${fmtMomento(apple.corrida.en)}.`, fecha: apple.corrida.en })
  } else if (apple.corrida && !apple.corrida.ok) {
    avisos.push({ tipo: 'copia_apple', nivel: 'error', texto: `La última copia de Apple (${fmtMomento(apple.corrida.en)}) tuvo errores: ${apple.corrida.motivo ?? 'sin detalle'}`, fecha: apple.corrida.en })
  } else if (!apple.corrida && !apple.corridaMotivo) {
    avisos.push({ tipo: 'copia_apple', nivel: 'aviso', texto: 'La copia de Apple todavía no dejó registro: corre todos los días a las 13:15 de Argentina.', fecha: null })
  }
  if (apple.corridaMotivo) avisos.push({ tipo: 'sin_dato', nivel: 'error', texto: apple.corridaMotivo, fecha: null })
  if (!apple.ok && apple.motivo) avisos.push({ tipo: 'sin_dato', nivel: 'error', texto: apple.motivo, fecha: null })
  if (descIos.atrasado) avisos.push({ tipo: 'atrasado', nivel: 'aviso', texto: descIos.atrasado, fecha: null })

  const esperadaGoogle = ultimaCorridaEsperada(ahora, COPIA_GOOGLE_UTC)
  if (!play.ok) {
    avisos.push({ tipo: 'sin_dato', nivel: 'error', texto: play.motivo ?? 'Sin datos de Google Play', fecha: null })
  } else if (!play.copiaEn || Date.parse(play.copiaEn) < esperadaGoogle - 15 * 60_000) {
    avisos.push({ tipo: 'copia_google', nivel: 'error', texto: `La copia de Google Play no corrió ${cuandoTocaba(esperadaGoogle, ahora)}.${play.copiaEn ? ` La última fue el ${fmtMomento(play.copiaEn)}.` : ''}`, fecha: play.copiaEn })
  }
  if (playAtrasado) avisos.push({ tipo: 'atrasado', nivel: 'aviso', texto: playAtrasado, fecha: null })

  // Apple dice 0 pero hay iPhone de la App Store jugando: el informe no
  // está trayendo a Potion.
  const iosRealesHastaRespondido = apple.ultimoDiaRespondido
    ? realesDe('ios').filter(j => diaAR(Date.parse(j.desde)) <= apple.ultimoDiaRespondido!).length
    : 0
  if (descIos.valor === 0 && iosRealesHastaRespondido > 0) {
    avisos.push({
      tipo: 'cuadre', nivel: 'error',
      texto: `Apple informa 0 descargas hasta el ${fmtDia(apple.ultimoDiaRespondido!)}, pero ${iosRealesHastaRespondido} iPhone de la App Store ya ${iosRealesHastaRespondido === 1 ? 'jugaba' : 'jugaban'} para esa fecha. El informe no está trayendo a Potion${apple.otrasApps.length > 0 ? `: sólo trae ${apple.otrasApps.join(', ')}, así que Potion debe informar con otro número de vendedor (agregalo a APPSTORE_VENDOR_NUMBER en Vercel, separado por coma)` : ''}.`,
      fecha: null,
    })
  }

  // ── Alertas de jugadores ──
  for (const j of reales) {
    if (j.termino && j.terminoEn && Date.parse(j.terminoEn) >= ahora - 30 * DIA_MS) {
      alertas.push({
        tipo: 'ultimo_nivel', nivel: 'info', jugador: j.id, fecha: j.terminoEn,
        texto: `Un jugador de ${j.plataforma === 'ios' ? 'iPhone' : 'Android'}${j.pais ? ` (${j.pais})` : ''} llegó al último nivel (${j.totalNiveles}).`,
      })
    }
    if (j.plataforma === 'ios' && diaAR(Date.parse(j.desde)) >= hace7) {
      alertas.push({
        tipo: 'nuevo_ios', nivel: 'info', jugador: j.id, fecha: j.desde,
        texto: `Nuevo jugador de iPhone${j.pais ? ` (${j.pais})` : ''}, con la ${nombreDeVersion(j.version)}.`,
      })
    }
  }
  alertas.sort((a, b) => ((a.fecha ?? '') < (b.fecha ?? '') ? 1 : -1))

  return {
    separacion,
    tarjetas: {
      descargas: { android: descAndroid, ios: descIos },
      tienen: { android: tieneAndroid, ios: tieneIos },
      borraron: armarBorraron(play, playAtrasado),
      hoy: tHoy,
      semana: tSemana,
      mes: tMes,
    },
    avisos,
    avisosNiveles,
    alertas,
    reales,
    prueba,
    versionesIos: versionesIos ?? [],
    generadoEn: new Date().toISOString(),
  }
}
