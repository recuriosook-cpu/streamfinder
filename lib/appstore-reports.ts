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

/**
 * Una app que venía en el informe del día, con sus descargas. Sirve para ver
 * por qué una app no entra: si Potion figura con otro ID, se ve acá.
 */
export interface AppEnInforme {
  id: string
  titulo: string
  unidades: number
}

/**
 * Lo que dijo Apple, para dejarlo registrado en `appstore_corridas`. Antes
 * la copia terminaba "bien" sin rastro y no había forma de saber qué pasó.
 */
export interface DiagnosticoDia {
  http: number | null
  /** Renglones del informe, sin la cabecera. */
  filas?: number
  apps?: AppEnInforme[]
  /** El texto de Apple cuando no es un informe. */
  detalle?: string
}

export type ResultadoDia =
  | { estado: 'ok'; paises: PaisAppStore[]; diag: DiagnosticoDia }
  /** 404: ese día no hubo nada, o Apple todavía no lo publicó. */
  | { estado: 'vacio'; diag: DiagnosticoDia }
  | { estado: 'sin_permiso'; detalle: string; diag: DiagnosticoDia }
  | { estado: 'error'; detalle: string; diag: DiagnosticoDia }

/**
 * Todas las apps del informe con sus primeras descargas y redescargas, sin
 * filtrar por ID. `null` si al informe le faltan las columnas.
 */
export function appsDelInforme(tsv: string): { filas: number; apps: AppEnInforme[] } | null {
  const lineas = tsv.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lineas.length < 1) return { filas: 0, apps: [] }
  const cab = lineas[0].split('\t').map(s => s.trim())
  const iTipo = cab.indexOf('Product Type Identifier')
  const iUnidades = cab.indexOf('Units')
  const iApp = cab.indexOf('Apple Identifier')
  const iTitulo = cab.indexOf('Title')
  if (iTipo < 0 || iUnidades < 0 || iApp < 0) return null
  const porApp = new Map<string, AppEnInforme>()
  for (const linea of lineas.slice(1)) {
    const c = linea.split('\t')
    const id = (c[iApp] ?? '').trim()
    const a = porApp.get(id) ?? { id, titulo: iTitulo >= 0 ? (c[iTitulo] ?? '').trim().slice(0, 60) : '', unidades: 0 }
    const tipo = (c[iTipo] ?? '').trim()
    const n = Number(c[iUnidades])
    if ((DESCARGA.has(tipo) || REDESCARGA.has(tipo)) && Number.isFinite(n)) a.unidades += n
    porApp.set(id, a)
  }
  return { filas: lineas.length - 1, apps: [...porApp.values()] }
}

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
    const detalle = e instanceof Error ? e.message : String(e)
    return { estado: 'error', detalle, diag: { http: null, detalle } }
  }

  if (!res.ok) {
    // El texto de Apple dice si es "no hubo ventas ese día" u otra cosa
    // (número de vendedor inválido, por ejemplo). Se guarda tal cual.
    const texto = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
    const diag: DiagnosticoDia = { http: res.status, detalle: texto }
    if (res.status === 404) return { estado: 'vacio', diag }
    if (res.status === 401 || res.status === 403) return { estado: 'sin_permiso', detalle: `${res.status} ${texto}`, diag }
    return { estado: 'error', detalle: `${res.status} ${texto}`, diag }
  }

  try {
    const crudo = Buffer.from(await res.arrayBuffer())
    // Viene comprimido; por las dudas, si no empieza con la firma de gzip se lee tal cual.
    const tsv = crudo[0] === 0x1f && crudo[1] === 0x8b ? gunzipSync(crudo).toString('utf8') : crudo.toString('utf8')
    const resumen = appsDelInforme(tsv)
    return {
      estado: 'ok',
      paises: paisesDelInforme(tsv, c.appId),
      diag: { http: res.status, filas: resumen?.filas, apps: resumen?.apps },
    }
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    return { estado: 'error', detalle, diag: { http: res.status, detalle } }
  }
}
