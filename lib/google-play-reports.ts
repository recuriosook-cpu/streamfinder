import { createSign } from 'node:crypto'
import Papa from 'papaparse'

/**
 * Lectura de los informes que Google Play deja en Cloud Storage.
 *
 * Play Console no tiene una API de estadísticas: lo que hace es escribir CSVs
 * en un bucket de Cloud Storage que Google crea para cada cuenta de
 * desarrollador. Este módulo sabe entrar a ese bucket, bajar los archivos que
 * nos importan y devolver filas por día.
 *
 * Sólo corre en el servidor: usa `node:crypto` para firmar el JWT y la clave
 * privada de una cuenta de servicio, que obviamente no puede salir de acá.
 *
 * ── Por qué no se usa `@google-cloud/storage` ─────────────────────────────
 *
 * Porque para lo que hacemos —bajar cuatro archivos por día— la librería
 * oficial es un paquete grande entrando a un bundle serverless a cambio de dos
 * llamadas HTTP. Lo único que hace falta es cambiar la cuenta de servicio por
 * un access token (un JWT firmado, que es la parte no trivial, y son veinte
 * líneas con `node:crypto`) y después un GET con ese token.
 *
 * ── Las tres cosas que sorprenden de estos archivos ───────────────────────
 *
 *   1. **Vienen en UTF-16.** No UTF-8. Leerlos como UTF-8 no falla: devuelve
 *      texto con un `\0` entre cada letra, el parser de CSV no reconoce ninguna
 *      columna y el resultado son cero filas sin ningún error. Por eso el
 *      decodificador es explícito y hay un chequeo del BOM que avisa.
 *   2. **Son mensuales, no diarios.** Un archivo por mes con una fila por día,
 *      reescrito cada día. Para tener los últimos días completos siempre hay
 *      que bajar el mes en curso, y cerca del día 1 también el anterior.
 *   3. **Google corrige hacia atrás.** Los números de los últimos días se
 *      ajustan durante una semana larga. Por eso todo esto es idempotente y
 *      hace upsert: correrlo de nuevo pisa lo viejo con lo corregido.
 *
 * ── Cómo se configura ─────────────────────────────────────────────────────
 *
 * Tres variables de entorno en Vercel (Production y Preview):
 *
 *   PLAY_REPORTS_BUCKET   El bucket de informes, sin `gs://`. Sale de Play
 *                         Console → Descargar informes → Estadísticas, botón
 *                         "Copiar URI de Cloud Storage". Tiene la forma
 *                         `pubsite_prod_rev_0123456789012345678`.
 *   GOOGLE_PLAY_SA_JSON   El archivo JSON de una cuenta de servicio de Google
 *                         Cloud, pegado entero. También se acepta en base64,
 *                         por si el panel de variables maltrata los saltos de
 *                         línea.
 *   PLAY_PACKAGE_NAME     Opcional. Por defecto `com.glynbox.app`.
 *
 * Y el paso que no es obvio y es el que falla: **el bucket es de Google, no
 * del proyecto de Cloud**. No alcanza con darle permisos de Storage a la
 * cuenta de servicio en IAM — ahí el bucket ni siquiera aparece. Hay que
 * invitar al email de la cuenta de servicio como usuario en Play Console
 * (Usuarios y permisos → Invitar usuario) y darle "Ver información de la app y
 * descargar informes masivos" con alcance **global**, no por app. Con alcance
 * por app, Google contesta 403 y el mensaje no explica por qué.
 */

// ── Configuración ──────────────────────────────────────────────────────────

/**
 * Lo que hay que tener definido para que esto funcione.
 *
 * Se lee de a una y se reporta qué falta, en vez de un booleano: si mañana el
 * cron no trae datos, el log tiene que decir cuál de las tres variables quedó
 * sin poner y no "no configurado".
 */
export interface ConfigPlay {
  bucket: string
  paquete: string
  email: string
  clavePrivada: string
}

export type ResultadoConfig =
  | { ok: true; config: ConfigPlay }
  | { ok: false; faltan: string[] }

/**
 * Las credenciales de la cuenta de servicio, del JSON que descarga Google.
 *
 * Se acepta el JSON tal cual sale del archivo y también en base64, porque
 * pegar un JSON con saltos de línea en un panel de variables de entorno sale
 * mal más veces de las que sale bien. Si no empieza con `{`, se prueba
 * decodificar primero.
 */
function leerCuentaDeServicio(crudo: string): { email: string; clavePrivada: string } | null {
  try {
    const texto = crudo.trim().startsWith('{')
      ? crudo
      : Buffer.from(crudo, 'base64').toString('utf8')

    const json = JSON.parse(texto) as { client_email?: string; private_key?: string }
    if (!json.client_email || !json.private_key) return null

    return {
      email: json.client_email,
      // Si el JSON pasó por un editor que convirtió los `\n` en dos caracteres
      // literales, la clave no parsea y la firma falla con un error que no
      // explica nada. Deshacerlo es barato y no rompe una clave sana.
      clavePrivada: json.private_key.replace(/\\n/g, '\n'),
    }
  } catch {
    return null
  }
}

export function leerConfig(): ResultadoConfig {
  const faltan: string[] = []

  const bucket = process.env.PLAY_REPORTS_BUCKET?.trim()
  if (!bucket) faltan.push('PLAY_REPORTS_BUCKET')

  // El único con default: es el paquete de la app y no cambia. Igual se puede
  // pisar por entorno, para poder apuntar a otra app sin tocar código.
  const paquete = process.env.PLAY_PACKAGE_NAME?.trim() || 'com.glynbox.app'

  const saCrudo = process.env.GOOGLE_PLAY_SA_JSON?.trim()
  if (!saCrudo) faltan.push('GOOGLE_PLAY_SA_JSON')

  const sa = saCrudo ? leerCuentaDeServicio(saCrudo) : null
  if (saCrudo && !sa) faltan.push('GOOGLE_PLAY_SA_JSON (no se pudo leer: ¿es el JSON completo?)')

  if (!bucket || !sa) return { ok: false, faltan }

  return { ok: true, config: { bucket, paquete, email: sa.email, clavePrivada: sa.clavePrivada } }
}

// ── Token ──────────────────────────────────────────────────────────────────

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/devstorage.read_only'

/**
 * Token cacheado en memoria del módulo.
 *
 * Una invocación del cron baja cuatro archivos; sin esto serían cuatro
 * intercambios de JWT por token para nada. No se comparte entre invocaciones
 * serverless salvo que reusen la instancia, y eso está bien: es una
 * optimización dentro de una corrida, no un cache que haya que invalidar.
 */
let tokenCache: { valor: string; venceEn: number } | null = null

const base64url = (v: string | Buffer) => Buffer.from(v).toString('base64url')

async function obtenerToken(config: ConfigPlay): Promise<string | null> {
  const ahora = Math.floor(Date.now() / 1000)

  // 60 segundos de colchón: un token que vence mientras el request viaja es un
  // 401 que parece un problema de permisos.
  if (tokenCache && tokenCache.venceEn > ahora + 60) return tokenCache.valor

  const cabecera = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const cuerpo = base64url(JSON.stringify({
    iss: config.email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: ahora,
    exp: ahora + 3600,
  }))

  let assertion: string
  try {
    const firma = createSign('RSA-SHA256')
      .update(`${cabecera}.${cuerpo}`)
      .sign(config.clavePrivada)
    assertion = `${cabecera}.${cuerpo}.${base64url(firma)}`
  } catch (err) {
    console.error('[play] no se pudo firmar el JWT:', (err as Error).message)
    return null
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      cache: 'no-store',
    })

    if (!res.ok) {
      console.error('[play] Google rechazó el JWT:', res.status, (await res.text()).slice(0, 300))
      return null
    }

    const json = await res.json() as { access_token?: string; expires_in?: number }
    if (!json.access_token) return null

    tokenCache = { valor: json.access_token, venceEn: ahora + (json.expires_in ?? 3600) }
    return json.access_token
  } catch (err) {
    console.error('[play] falló el intercambio por token:', (err as Error).message)
    return null
  }
}

// ── Descarga ───────────────────────────────────────────────────────────────

export type ResultadoDescarga =
  | { estado: 'ok'; texto: string }
  /** El archivo no existe. Normal: un mes sin datos no genera archivo. */
  | { estado: 'no_esta' }
  /**403: casi siempre el permiso de Play Console, no el de IAM. Ver el README del SQL. */
  | { estado: 'sin_permiso' }
  | { estado: 'error'; detalle: string }

/**
 * Baja un objeto del bucket y lo devuelve como texto.
 *
 * La ruta se codifica entera, barras incluidas: en la API JSON de Cloud
 * Storage el nombre del objeto es UN segmento de la URL, así que un `/` sin
 * escapar la parte en dos y devuelve 404.
 */
export async function descargarObjeto(
  config: ConfigPlay,
  ruta: string,
): Promise<ResultadoDescarga> {
  const token = await obtenerToken(config)
  if (!token) return { estado: 'error', detalle: 'sin token' }

  const url =
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.bucket)}` +
    `/o/${encodeURIComponent(ruta)}?alt=media`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })

    if (res.status === 404) return { estado: 'no_esta' }
    if (res.status === 403) return { estado: 'sin_permiso' }
    if (!res.ok) {
      return { estado: 'error', detalle: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` }
    }

    return { estado: 'ok', texto: decodificar(await res.arrayBuffer()) }
  } catch (err) {
    return { estado: 'error', detalle: (err as Error).message }
  }
}

/**
 * Bytes a texto, resolviendo el UTF-16.
 *
 * Exportada para poder ejercitarla sin red: es la pieza que más silenciosamente
 * puede fallar —un archivo mal decodificado no tira, devuelve cero filas— y la
 * única forma de probarla es dándole bytes a mano.
 *
 * Se mira el BOM en vez de asumir: Google documenta UTF-16 y en la práctica
 * manda UTF-16LE, pero el día que un archivo venga en UTF-8 —o que cambien—
 * esto lo lee igual en vez de devolver mil caracteres nulos que el parser de
 * CSV va a interpretar como un archivo sin columnas.
 */
export function decodificar(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes)
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes)
  }

  // Sin BOM. Si uno de cada dos bytes es cero, es UTF-16LE igual: hay archivos
  // que salen sin marca.
  const muestra = bytes.subarray(0, Math.min(bytes.length, 64))
  const cerosImpares = muestra.filter((b, i) => i % 2 === 1 && b === 0).length
  if (muestra.length >= 8 && cerosImpares > muestra.length / 4) {
    return new TextDecoder('utf-16le').decode(bytes)
  }

  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '')
}

// ── Parseo ─────────────────────────────────────────────────────────────────

/**
 * Los nombres de columna que nos interesan, con sus variantes.
 *
 * Se busca por NOMBRE y no por posición, y con más de una forma aceptada por
 * campo. No es paranoia: Google ya escribió "Daily Device UnInstalls" y "Daily
 * Device Uninstalls" en distintos momentos, y el orden de las columnas cambió
 * entre versiones del informe. Una lectura por índice se rompe en silencio —
 * sigue habiendo números, pero son de otra columna.
 *
 * La comparación normaliza a minúsculas y colapsa espacios, así que acá van en
 * minúscula y sin dobles espacios.
 */
const ALIAS = {
  fecha: ['date'],
  instalaciones: ['daily device installs'],
  desinstalaciones: ['daily device uninstalls'],
  baseInstalada: ['active device installs'],
  visitantes: ['store listing visitors'],
  adquisiciones: ['store listing acquisitions'],
} as const

type Campo = keyof typeof ALIAS

/**
 * Los campos que se suman.
 *
 * Excluye `fecha` en el tipo y no sólo en la lista: sin esto, el acumulador de
 * abajo queda indexado por un campo que puede ser `fecha` —un string— y
 * asignarle un número no compila. Que lo diga el tipo es mejor que acordarse
 * de no meter `fecha` en el array.
 */
type CampoNumerico = Exclude<Campo, 'fecha'>

const normalizar = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Índice nombre-normalizado → nombre real, para buscar sin adivinar. */
function indexarCabeceras(campos: string[]): Map<string, string> {
  return new Map(campos.map(c => [normalizar(c), c]))
}

function columnaDe(indice: Map<string, string>, campo: Campo): string | null {
  for (const alias of ALIAS[campo]) {
    const real = indice.get(alias)
    if (real) return real
  }
  return null
}

/**
 * Un número de una celda, o `null`.
 *
 * Las celdas vacías son comunes —un día sin datos— y tienen que quedar en
 * `null` y no en 0: un cero dibuja una caída en el gráfico que nunca pasó.
 */
function aNumero(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim().replace(/,/g, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Lo que este módulo sabe sacar de un día. */
export interface DiaPlay {
  fecha: string
  instalaciones: number | null
  desinstalaciones: number | null
  baseInstalada: number | null
  visitantes: number | null
  adquisiciones: number | null
}

/**
 * Suma las filas de un CSV por fecha.
 *
 * Suma, y no toma la primera, porque el mismo informe viene en versión
 * "overview" (una fila por día) y desglosado por país o por fuente de tráfico
 * (una fila por día y dimensión). Sumando, las dos formas dan el total del día
 * y no hay que tener dos parsers. Para el overview la suma es sobre un solo
 * sumando.
 *
 * `baseInstalada` es la excepción y por eso se trata aparte en el llamador: es
 * un stock, no un flujo, y sumar la base instalada de cada país da el total —
 * eso sí funciona— pero sumar dos filas del mismo día del overview la
 * duplicaría. Como el overview trae una fila por día, no pasa.
 */
export function filasPorFecha(csv: string): Map<string, Partial<DiaPlay>> {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  })

  const filas = parsed.data ?? []
  if (filas.length === 0) return new Map()

  const indice = indexarCabeceras(parsed.meta?.fields ?? [])
  const colFecha = columnaDe(indice, 'fecha')

  if (!colFecha) {
    console.error(
      '[play] el CSV no tiene columna de fecha. Cabeceras:',
      (parsed.meta?.fields ?? []).join(' | ').slice(0, 300)
    )
    return new Map()
  }

  const numericos: CampoNumerico[] = [
    'instalaciones', 'desinstalaciones', 'baseInstalada', 'visitantes', 'adquisiciones',
  ]
  const columnas = new Map<CampoNumerico, string>()
  for (const campo of numericos) {
    const col = columnaDe(indice, campo)
    if (col) columnas.set(campo, col)
  }

  const salida = new Map<string, Partial<DiaPlay>>()

  for (const fila of filas) {
    const fecha = (fila[colFecha] ?? '').trim()
    // Las fechas vienen como YYYY-MM-DD. Cualquier otra cosa es una fila de
    // totales al pie o basura, y no se cuenta.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue

    const acum = salida.get(fecha) ?? { fecha }

    for (const [campo, col] of columnas) {
      const n = aNumero(fila[col])
      if (n === null) continue
      const previo = acum[campo]
      acum[campo] = (typeof previo === 'number' ? previo : 0) + n
    }

    salida.set(fecha, acum)
  }

  return salida
}

// ── Rutas de los informes ──────────────────────────────────────────────────

/** `YYYYMM` de una fecha, que es como Google nombra los archivos mensuales. */
export function mesDe(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Los meses que hay que bajar hoy.
 *
 * Siempre dos: el corriente y el anterior. El anterior no es por las dudas —
 * el día 1 de cada mes, el mes en curso tiene una fila y todo lo demás está en
 * el archivo de al lado, y además Google sigue corrigiendo los últimos días
 * del mes cerrado durante una semana larga.
 */
export function mesesAConsultar(hoy = new Date()): string[] {
  const anterior = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - 1, 1))
  return [mesDe(anterior), mesDe(hoy)]
}

/**
 * Los archivos a probar para cada informe, en orden de preferencia.
 *
 * Para instalaciones el `overview` es exactamente lo que queremos: una fila por
 * día, sin desglose.
 *
 * Para la ficha de Play no hay `overview` garantizado —según la cuenta, el
 * informe sale desglosado por país o por fuente de tráfico— así que se prueban
 * los tres y se usa el primero que exista. Como `filasPorFecha` suma por fecha,
 * cualquiera de los tres da el total del día.
 */
export function rutasInstalls(paquete: string, mes: string): string[] {
  return [`stats/installs/installs_${paquete}_${mes}_overview.csv`]
}

export function rutasFicha(paquete: string, mes: string): string[] {
  const base = `stats/store_performance/store_performance_${paquete}_${mes}`
  return [`${base}_overview.csv`, `${base}_country.csv`, `${base}_traffic_source.csv`]
}
