import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { paqueteDe } from '@/lib/google-play-reports'
import { faltantesAppStore, POTION_APP_ID_POR_DEFECTO } from '@/lib/appstore-reports'
import { LANZAMIENTO } from '@/lib/potion-panel'

/**
 * Lo que dicen las tiendas de Potion Bottle, para las tarjetas de arriba y
 * "Dónde está el juego" de `/admin/potion`.
 *
 *   · Android: `play_install_stats` (por día) y `play_install_stats_pais`
 *     (por día y país), las tablas que llena el cron de Play.
 *   · iOS: `appstore_descargas`, la que llena el cron de App Store. Apple sólo
 *     da descargas: ni desinstalaciones ni cuántos la tienen. "Tienen la app"
 *     en iOS sale de los eventos del juego (`lib/potion-usuarios.ts`).
 *
 * Todo desde el lanzamiento (13/10/2026), como las otras tarjetas de arriba.
 * Una tabla que no existe o que falla deja su parte en cero con `disponible:
 * false`; nunca rompe la otra tienda.
 */

const DESDE = LANZAMIENTO.slice(0, 10)
const PAGINA = 1000

export function appIdIos(): string {
  return process.env.APPSTORE_POTION_APP_ID?.trim() || POTION_APP_ID_POR_DEFECTO
}

function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export interface TiendasAndroid {
  disponible: boolean
  /** Instalaciones desde el lanzamiento. */
  total: number
  /** Instalaciones de los últimos 7 días con dato y de los 7 anteriores. */
  ult7: number
  prev7: number
  /** El último día con dato de Play. Play publica con días de demora. */
  ultimaFecha: string | null
  /** Aparatos con la app, el último día con dato. */
  base: number | null
  /** La misma base, 7 días antes de `ultimaFecha`. */
  baseHace7: number | null
}

export interface TiendasIos {
  /** Si están las variables de App Store Connect en Vercel. */
  configurado: boolean
  /** `false` si falta la tabla o la consulta falló. */
  disponible: boolean
  total: number
  /** Descargas de los últimos 7 días y de los 7 anteriores. */
  ult7: number
  prev7: number
  /** El primer día con alguna descarga: desde ahí la app está en la App Store. */
  primeraFecha: string | null
  ultimaFecha: string | null
}

export interface PaisTiendas {
  pais: string
  /** Aparatos Android con la app el último día con dato por país. */
  android: number
  /** Descargas de iPhone desde el lanzamiento: Apple no dice cuántos la siguen teniendo. */
  ios: number
  total: number
}

export interface PotionTiendas {
  android: TiendasAndroid
  ios: TiendasIos
  /** De mayor a menor. Sólo los que tienen algo. */
  paises: PaisTiendas[]
  /** El día de los números de Android por país. */
  paisesFecha: string | null
  generadoEn: string
}

async function todas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[] | null> {
  const filas: T[] = []
  for (let i = 0; ; i += PAGINA) {
    const { data, error } = await consulta(i, i + PAGINA - 1)
    if (error) return null
    filas.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGINA) break
  }
  return filas
}

async function android(admin: SupabaseClient): Promise<{ a: TiendasAndroid; paises: Map<string, number>; fecha: string | null }> {
  const paquete = paqueteDe('potion')
  type Dia = { fecha: string; instalaciones: number | null; base_instalada: number | null }
  type Pais = { fecha: string; pais: string; base_instalada: number | null }

  const [dias, ultimaPais] = await Promise.all([
    todas<Dia>((d, h) => admin.from('play_install_stats')
      .select('fecha, instalaciones, base_instalada')
      .eq('package_name', paquete).gte('fecha', DESDE)
      .order('fecha', { ascending: true }).range(d, h)),
    admin.from('play_install_stats_pais').select('fecha')
      .eq('package_name', paquete).gte('fecha', DESDE)
      .order('fecha', { ascending: false }).limit(1).maybeSingle(),
  ])

  const vacio: TiendasAndroid = {
    disponible: false, total: 0, ult7: 0, prev7: 0, ultimaFecha: null, base: null, baseHace7: null,
  }
  if (!dias) console.error('[potion-tiendas] play_install_stats falló')

  let a = vacio
  if (dias && dias.length > 0) {
    const ultimaFecha = dias[dias.length - 1].fecha
    const corte7 = sumarDias(ultimaFecha, -7)
    const corte14 = sumarDias(ultimaFecha, -14)
    let total = 0, ult7 = 0, prev7 = 0
    for (const d of dias) {
      const n = d.instalaciones ?? 0
      total += n
      if (d.fecha > corte7) ult7 += n
      else if (d.fecha > corte14) prev7 += n
    }
    const conBase = dias.filter(d => d.base_instalada !== null)
    const base = conBase.length > 0 ? conBase[conBase.length - 1].base_instalada : null
    const anterior = conBase.filter(d => d.fecha <= corte7)
    a = {
      disponible: true, total, ult7, prev7, ultimaFecha, base,
      baseHace7: anterior.length > 0 ? anterior[anterior.length - 1].base_instalada : null,
    }
  }

  // Los países del último día con dato: la base es un stock, el último día
  // es "hoy". Sumados dan la base total de ese día.
  const paises = new Map<string, number>()
  const fecha = (ultimaPais.data as { fecha?: string } | null)?.fecha ?? null
  if (fecha) {
    const { data, error } = await admin.from('play_install_stats_pais')
      .select('fecha, pais, base_instalada')
      .eq('package_name', paquete).eq('fecha', fecha)
    if (error) console.error('[potion-tiendas] play_install_stats_pais falló:', error.message)
    for (const f of (data ?? []) as Pais[]) {
      if ((f.base_instalada ?? 0) > 0) paises.set(f.pais, f.base_instalada as number)
    }
  }
  return { a, paises, fecha }
}

async function ios(admin: SupabaseClient): Promise<{ i: TiendasIos; paises: Map<string, number> }> {
  type Fila = { fecha: string; pais: string; descargas: number }
  const configurado = faltantesAppStore().length === 0
  const filas = await todas<Fila>((d, h) => admin.from('appstore_descargas')
    .select('fecha, pais, descargas')
    .eq('app_id', appIdIos()).gte('fecha', DESDE)
    .order('fecha', { ascending: true }).order('pais', { ascending: true }).range(d, h))

  const paises = new Map<string, number>()
  if (!filas) {
    // Lo normal hasta correr supabase-appstore-descargas-2026-11.sql.
    return {
      i: { configurado, disponible: false, total: 0, ult7: 0, prev7: 0, primeraFecha: null, ultimaFecha: null },
      paises,
    }
  }

  // Apple publica el día de ayer: la semana termina ayer.
  const ayer = sumarDias(new Date().toISOString().slice(0, 10), -1)
  const corte7 = sumarDias(ayer, -7)
  const corte14 = sumarDias(ayer, -14)
  let total = 0, ult7 = 0, prev7 = 0
  let primeraFecha: string | null = null
  let ultimaFecha: string | null = null
  for (const f of filas) {
    total += f.descargas
    if (f.fecha > corte7) ult7 += f.descargas
    else if (f.fecha > corte14) prev7 += f.descargas
    if (f.descargas > 0) {
      if (!primeraFecha) primeraFecha = f.fecha
      ultimaFecha = f.fecha
      paises.set(f.pais, (paises.get(f.pais) ?? 0) + f.descargas)
    }
  }
  return { i: { configurado, disponible: true, total, ult7, prev7, primeraFecha, ultimaFecha }, paises }
}

export async function leerTiendas(admin: SupabaseClient): Promise<PotionTiendas> {
  const [{ a, paises: pa, fecha }, { i, paises: pi }] = await Promise.all([android(admin), ios(admin)])
  const codigos = new Set([...pa.keys(), ...pi.keys()])
  const paises: PaisTiendas[] = [...codigos].map(pais => {
    const android = pa.get(pais) ?? 0
    const ios = pi.get(pais) ?? 0
    return { pais, android, ios, total: android + ios }
  }).sort((x, y) => y.total - x.total || x.pais.localeCompare(y.pais))
  return { android: a, ios: i, paises, paisesFecha: fecha, generadoEn: new Date().toISOString() }
}

/**
 * Desde cuándo la app de iPhone está en la App Store, en ms: medianoche del
 * Pacífico del primer día con descargas. `null` si todavía no salió (o la
 * tabla no existe). Lo usa `vivo`, que se pide cada minuto: se guarda 10
 * minutos en memoria para no consultar la base cada vez.
 */
let cacheIos: { valor: number | null; hasta: number } | null = null

export async function iosDesdeMs(admin: SupabaseClient): Promise<number | null> {
  if (cacheIos && cacheIos.hasta > Date.now()) return cacheIos.valor
  const { data, error } = await admin.from('appstore_descargas')
    .select('fecha').eq('app_id', appIdIos()).gt('descargas', 0)
    .order('fecha', { ascending: true }).limit(1).maybeSingle()
  const fecha = error ? null : (data as { fecha?: string } | null)?.fecha ?? null
  // Los días de Apple son del Pacífico. -07:00 (horario de verano) es la
  // medianoche más temprana posible: así no se pierde la primera hora.
  const valor = fecha ? Date.parse(`${fecha}T00:00:00-07:00`) : null
  cacheIos = { valor, hasta: Date.now() + 10 * 60_000 }
  return valor
}
