/**
 * Lectura del informe de red de AdMob para Potion Bottle.
 *
 * AdMob sí tiene una API de informes (a diferencia de Play, que deja CSVs en
 * un bucket): `networkReport:generate` devuelve filas por día, formato de
 * anuncio y país. Este módulo pide el token, arma el pedido y devuelve filas
 * listas para guardar.
 *
 * Sólo corre en el servidor: usa el secreto del cliente OAuth y un refresh
 * token, que dan acceso de lectura a toda la cuenta de AdMob.
 *
 * ── Por qué OAuth de usuario y no una cuenta de servicio ──────────────────
 *
 * Porque la API de AdMob no acepta cuentas de servicio: no hay forma de
 * invitar una a la cuenta de AdMob, como sí se hace en Play Console. Lo único
 * que sirve es el permiso de una persona con acceso a la cuenta, dado una vez
 * con `scripts/admob-token.mjs`, que devuelve un refresh token. Con ese token
 * el cron pide un access token nuevo en cada corrida.
 *
 * El refresh token deja de andar en tres casos, y los tres dan `invalid_grant`:
 *   1. La pantalla de consentimiento del proyecto quedó en "Prueba" (Testing):
 *      ahí Google lo vence a los 7 días. Tiene que estar "En producción".
 *   2. Se cambió la contraseña de la cuenta de Google o se revocó el acceso.
 *   3. Pasaron seis meses sin usarlo. Con el cron diario no pasa.
 * En cualquiera de los tres, se vuelve a correr el script y se reemplaza la
 * variable en Vercel.
 *
 * ── Cómo se configura ─────────────────────────────────────────────────────
 *
 * Tres variables de entorno en Vercel (Production y Preview):
 *
 *   ADMOB_CLIENT_ID       Del cliente OAuth de tipo "App de escritorio" del
 *   ADMOB_CLIENT_SECRET   proyecto de Google Cloud con la API de AdMob activa.
 *   ADMOB_REFRESH_TOKEN   El que imprime `scripts/admob-token.mjs`.
 *
 * ── Los días y la moneda ──────────────────────────────────────────────────
 *
 * Los días son los de la zona horaria de la cuenta de AdMob, que la API no
 * deja cambiar: no son exactamente los días de Argentina del resto del panel.
 * La moneda se pide en dólares, para que no dependa de cómo esté configurada
 * la cuenta.
 */

// ── La app ─────────────────────────────────────────────────────────────────

/**
 * El editor y la app de Potion Bottle en AdMob, de `botellas/src/game/anuncios.ts`.
 * Van escritos acá y no por entorno por lo mismo que el paquete de Play: no
 * cambian sin publicar otra app.
 */
export const EDITOR_ADMOB = 'pub-7004694054304140'
export const APP_ADMOB_POTION = 'ca-app-pub-7004694054304140~4405107800'

export const MONEDA_ADMOB = 'USD'

// ── Configuración ──────────────────────────────────────────────────────────

export interface ConfigAdMob {
  clientId: string
  clientSecret: string
  refreshToken: string
}

export type ResultadoConfigAdMob =
  | { ok: true; config: ConfigAdMob }
  | { ok: false; faltan: string[] }

/** Se reporta qué variable falta, no un "sin configurar" que no dice cuál. */
export function leerConfigAdMob(): ResultadoConfigAdMob {
  const clientId = process.env.ADMOB_CLIENT_ID?.trim()
  const clientSecret = process.env.ADMOB_CLIENT_SECRET?.trim()
  const refreshToken = process.env.ADMOB_REFRESH_TOKEN?.trim()

  const faltan: string[] = []
  if (!clientId) faltan.push('ADMOB_CLIENT_ID')
  if (!clientSecret) faltan.push('ADMOB_CLIENT_SECRET')
  if (!refreshToken) faltan.push('ADMOB_REFRESH_TOKEN')

  if (!clientId || !clientSecret || !refreshToken) return { ok: false, faltan }
  return { ok: true, config: { clientId, clientSecret, refreshToken } }
}

// ── Token ──────────────────────────────────────────────────────────────────

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export type ResultadoToken =
  | { ok: true; token: string }
  /** `invalid_grant`: el refresh token venció o lo revocaron. Ver arriba. */
  | { ok: false; vencido: boolean; detalle: string }

/** Una corrida del cron hace un solo pedido: no hace falta cachear el token. */
async function obtenerToken(config: ConfigAdMob): Promise<ResultadoToken> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
      }),
      cache: 'no-store',
    })
    const json = await res.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string }
    if (res.ok && json.access_token) return { ok: true, token: json.access_token }
    return {
      ok: false,
      vencido: json.error === 'invalid_grant',
      detalle: `HTTP ${res.status}: ${json.error ?? ''} ${json.error_description ?? ''}`.trim(),
    }
  } catch (err) {
    return { ok: false, vencido: false, detalle: (err as Error).message }
  }
}

// ── Informe ────────────────────────────────────────────────────────────────

/** Un día de un formato en un país. */
export interface FilaAdMob {
  /** `YYYY-MM-DD`, en la zona horaria de la cuenta de AdMob. */
  fecha: string
  /** Como lo nombra AdMob: `REWARDED`, `INTERSTITIAL`, `BANNER`… */
  formato: string
  /** ISO de dos letras. `ZZ` si AdMob no lo sabe. */
  pais: string
  /** En millonésimas de `MONEDA_ADMOB`, que es como lo da la API. */
  gananciaMicros: number
  impresiones: number
  solicitudes: number
  solicitudesConAnuncio: number
  clics: number
}

export type ResultadoInforme =
  | { estado: 'ok'; filas: FilaAdMob[] }
  | { estado: 'token_vencido'; detalle: string }
  /** 403: la cuenta que dio el permiso no tiene acceso a la cuenta de AdMob, o la API no está activa. */
  | { estado: 'sin_permiso'; detalle: string }
  | { estado: 'error'; detalle: string }

type FechaApi = { year: number; month: number; day: number }

function aFechaApi(iso: string): FechaApi {
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

/** Los valores de la API vienen como string (`integerValue`, `microsValue`). */
function entero(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : 0
}

type Valor = { value?: string; integerValue?: string; microsValue?: string; doubleValue?: number }
type RespuestaFila = {
  row?: {
    dimensionValues?: Record<string, Valor>
    metricValues?: Record<string, Valor>
  }
}

/**
 * Las filas del informe entre `desde` y `hasta` (`YYYY-MM-DD`, inclusive),
 * por día, formato y país, sólo de Potion Bottle.
 */
export async function informeAdMob(
  config: ConfigAdMob,
  desde: string,
  hasta: string,
): Promise<ResultadoInforme> {
  const token = await obtenerToken(config)
  if (!token.ok) {
    return token.vencido
      ? { estado: 'token_vencido', detalle: token.detalle }
      : { estado: 'error', detalle: `sin token: ${token.detalle}` }
  }

  const cuerpo = {
    reportSpec: {
      dateRange: { startDate: aFechaApi(desde), endDate: aFechaApi(hasta) },
      dimensions: ['DATE', 'FORMAT', 'COUNTRY'],
      metrics: ['ESTIMATED_EARNINGS', 'IMPRESSIONS', 'AD_REQUESTS', 'MATCHED_REQUESTS', 'CLICKS'],
      dimensionFilters: [{ dimension: 'APP', matchesAny: { values: [APP_ADMOB_POTION] } }],
      localizationSettings: { currencyCode: MONEDA_ADMOB },
    },
  }

  let res: Response
  try {
    res = await fetch(
      `https://admob.googleapis.com/v1/accounts/${EDITOR_ADMOB}/networkReport:generate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
        cache: 'no-store',
      },
    )
  } catch (err) {
    return { estado: 'error', detalle: (err as Error).message }
  }

  if (res.status === 403) return { estado: 'sin_permiso', detalle: (await res.text()).slice(0, 300) }
  if (!res.ok) return { estado: 'error', detalle: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` }

  // La respuesta es un arreglo: un `header`, una `row` por fila y un `footer`.
  let partes: RespuestaFila[]
  try {
    partes = await res.json() as RespuestaFila[]
  } catch (err) {
    return { estado: 'error', detalle: `respuesta ilegible: ${(err as Error).message}` }
  }

  const filas: FilaAdMob[] = []
  for (const parte of Array.isArray(partes) ? partes : []) {
    const d = parte.row?.dimensionValues
    const m = parte.row?.metricValues
    if (!d || !m) continue

    // `DATE` viene como `20261019`.
    const crudo = d.DATE?.value ?? ''
    if (!/^\d{8}$/.test(crudo)) continue
    const fecha = `${crudo.slice(0, 4)}-${crudo.slice(4, 6)}-${crudo.slice(6, 8)}`

    const pais = (d.COUNTRY?.value ?? '').toUpperCase()
    filas.push({
      fecha,
      formato: d.FORMAT?.value || 'DESCONOCIDO',
      pais: /^[A-Z]{2}$/.test(pais) ? pais : 'ZZ',
      gananciaMicros: entero(m.ESTIMATED_EARNINGS?.microsValue),
      impresiones: entero(m.IMPRESSIONS?.integerValue),
      solicitudes: entero(m.AD_REQUESTS?.integerValue),
      solicitudesConAnuncio: entero(m.MATCHED_REQUESTS?.integerValue),
      clics: entero(m.CLICKS?.integerValue),
    })
  }

  return { estado: 'ok', filas }
}
