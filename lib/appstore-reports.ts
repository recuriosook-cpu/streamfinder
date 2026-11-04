import 'server-only'
import { createSign } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

/**
 * Los informes de ventas de App Store Connect, para las descargas de iPhone
 * de Potion Bottle en `/admin/potion`.
 *
 * Lo usa sólo `/api/cron/appstore-stats`, que copia los días a la tabla
 * `appstore_descargas` del Supabase de Glynbox. El panel lee la tabla y no le
 * pega a Apple.
 *
 * ── Qué pide Apple ────────────────────────────────────────────────────────
 *
 * `GET /v1/salesReports` con `reportType=SALES`, `reportSubType=SUMMARY`,
 * `frequency=DAILY`, el número de vendedor y el día. Devuelve un TSV
 * comprimido con gzip: una fila por app, tipo de producto, país, versión y
 * demás. Si ese día no hubo ninguna venta ni descarga —o el día todavía no
 * está listo— contesta 404, que acá es "cero", no un error.
 *
 * El token es un JWT ES256 firmado con la clave `.p8` de una clave de API de
 * App Store Connect, con 20 minutos de vida como máximo. La clave tiene que
 * tener acceso a "Ventas" (rol Ventas, Finanzas, Administrador o
 * Titular de cuenta): con el de "Gestor de apps" Apple contesta 403.
 *
 * ── Qué es una descarga ───────────────────────────────────────────────────
 *
 * La columna "Product Type Identifier". Las primeras descargas son 1, 1F, 1T
 * (iPhone, universal, iPad) y 1E, 1EP, 1EU (apps a medida). Las 3, 3F, 3T son
 * volver a bajarla con la misma cuenta y van aparte. Las 7, 7F, 7T son
 * actualizaciones y no cuentan. Las compras dentro del juego (IA*) tampoco:
 * esas ya las cuenta `potion_compras`.
 */

const BASE = 'https://api.appstoreconnect.apple.com'

/** El Apple ID de Potion Bottle (`ascAppId` de `botellas/eas.json`). */
export const POTION_APP_ID_POR_DEFECTO = '6827137001'

const DESCARGA = new Set(['1', '1F', '1T', '1E', '1EP', '1EU'])
const REDESCARGA = new Set(['3', '3F', '3T'])

export interface ConfigAppStore {
  issuerId: string
  keyId: string
  privateKey: string
  vendorNumber: string
  appId: string
}

/** Las variables que faltan, por nombre. Vacío = está todo. */
export function faltantesAppStore(): string[] {
  const faltan: string[] = []
  if (!process.env.APPSTORE_ISSUER_ID?.trim()) faltan.push('APPSTORE_ISSUER_ID')
  if (!process.env.APPSTORE_KEY_ID?.trim()) faltan.push('APPSTORE_KEY_ID')
  if (!process.env.APPSTORE_PRIVATE_KEY?.includes('PRIVATE KEY')) faltan.push('APPSTORE_PRIVATE_KEY')
  if (!process.env.APPSTORE_VENDOR_NUMBER?.trim()) faltan.push('APPSTORE_VENDOR_NUMBER')
  return faltan
}

/** `null` si falta alguna variable. La clave acepta saltos de línea reales o escritos como `\n`. */
export function leerConfigAppStore(): ConfigAppStore | null {
  if (faltantesAppStore().length > 0) return null
  return {
    issuerId: process.env.APPSTORE_ISSUER_ID!.trim(),
    keyId: process.env.APPSTORE_KEY_ID!.trim(),
    privateKey: process.env.APPSTORE_PRIVATE_KEY!.replace(/\\n/g, '\n').trim(),
    vendorNumber: process.env.APPSTORE_VENDOR_NUMBER!.trim(),
    appId: process.env.APPSTORE_POTION_APP_ID?.trim() || POTION_APP_ID_POR_DEFECTO,
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/** El token de la API: 15 minutos de vida, se arma en cada corrida. */
function token(c: ConfigAppStore): string {
  const ahora = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: c.keyId, typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: c.issuerId, iat: ahora, exp: ahora + 900, aud: 'appstoreconnect-v1',
  }))
  const firma = createSign('SHA256')
    .update(`${header}.${payload}`)
    .sign({ key: c.privateKey, dsaEncoding: 'ieee-p1363' })
  return `${header}.${payload}.${base64url(firma)}`
}

export interface PaisAppStore {
  pais: string
  descargas: number
  redescargas: number
}

export type ResultadoDia =
  | { estado: 'ok'; paises: PaisAppStore[] }
  /** 404: ese día no hubo nada, o Apple todavía no lo publicó. */
  | { estado: 'vacio' }
  | { estado: 'sin_permiso'; detalle: string }
  | { estado: 'error'; detalle: string }

/** El TSV de un día, sólo las filas de la app, sumadas por país. */
export function paisesDelInforme(tsv: string, appId: string): PaisAppStore[] {
  const lineas = tsv.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lineas.length < 2) return []
  const cab = lineas[0].split('\t').map(s => s.trim())
  const col = (nombre: string) => cab.indexOf(nombre)
  const iTipo = col('Product Type Identifier')
  const iUnidades = col('Units')
  const iPais = col('Country Code')
  const iApp = col('Apple Identifier')
  if (iTipo < 0 || iUnidades < 0 || iPais < 0 || iApp < 0) {
    throw new Error(`el informe de Apple no trae las columnas esperadas: ${cab.join(', ')}`)
  }

  const porPais = new Map<string, PaisAppStore>()
  for (const linea of lineas.slice(1)) {
    const c = linea.split('\t')
    if ((c[iApp] ?? '').trim() !== appId) continue
    const tipo = (c[iTipo] ?? '').trim()
    const esDescarga = DESCARGA.has(tipo)
    const esRedescarga = REDESCARGA.has(tipo)
    if (!esDescarga && !esRedescarga) continue
    const unidades = Number(c[iUnidades])
    if (!Number.isFinite(unidades)) continue
    const pais = (c[iPais] ?? '').trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(pais)) continue
    const p = porPais.get(pais) ?? { pais, descargas: 0, redescargas: 0 }
    if (esDescarga) p.descargas += unidades
    else p.redescargas += unidades
    porPais.set(pais, p)
  }
  return [...porPais.values()]
}

/** Baja el informe diario de un día (`YYYY-MM-DD`). */
export async function informeDelDia(c: ConfigAppStore, fecha: string): Promise<ResultadoDia> {
  const params = new URLSearchParams({
    'filter[frequency]': 'DAILY',
    'filter[reportType]': 'SALES',
    'filter[reportSubType]': 'SUMMARY',
    'filter[vendorNumber]': c.vendorNumber,
    'filter[reportDate]': fecha,
    'filter[version]': '1_0',
  })
  let res: Response
  try {
    res = await fetch(`${BASE}/v1/salesReports?${params}`, {
      headers: { Authorization: `Bearer ${token(c)}`, Accept: 'application/a-gzip' },
      cache: 'no-store',
    })
  } catch (e) {
    return { estado: 'error', detalle: e instanceof Error ? e.message : String(e) }
  }

  if (res.status === 404) return { estado: 'vacio' }
  if (res.status === 401 || res.status === 403) {
    const texto = (await res.text().catch(() => '')).slice(0, 300)
    return { estado: 'sin_permiso', detalle: `${res.status} ${texto}` }
  }
  if (!res.ok) {
    const texto = (await res.text().catch(() => '')).slice(0, 300)
    return { estado: 'error', detalle: `${res.status} ${texto}` }
  }

  try {
    const crudo = Buffer.from(await res.arrayBuffer())
    // Viene comprimido; por las dudas, si no empieza con la firma de gzip se lee tal cual.
    const tsv = crudo[0] === 0x1f && crudo[1] === 0x8b ? gunzipSync(crudo).toString('utf8') : crudo.toString('utf8')
    return { estado: 'ok', paises: paisesDelInforme(tsv, c.appId) }
  } catch (e) {
    return { estado: 'error', detalle: e instanceof Error ? e.message : String(e) }
  }
}
