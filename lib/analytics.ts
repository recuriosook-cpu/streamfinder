'use client'

import { createClient } from '@/lib/supabase'
import type { EventName, EventProps } from '@/lib/analytics-events'

/**
 * Cliente de analytics.
 *
 * Regla única, y no se negocia: **esto nunca puede romper la página**. Todo lo
 * que hay acá abajo está envuelto en try/catch, incluidos los accesos a
 * localStorage —que tiran en Safari privado y con cookies de terceros
 * bloqueadas— y el cliente de Supabase. Si la medición falla, se pierde el
 * evento y nadie se entera. Es el orden correcto de prioridades.
 *
 * Los eventos se acumulan y se mandan de a lotes: cada 5 segundos, o al llegar
 * a 10, lo que pase primero. Y al cerrar la pestaña se vacía la cola con
 * `sendBeacon`, que es lo único que el navegador garantiza que sale cuando la
 * página se está muriendo.
 */

const ENDPOINT = '/api/track'

const ANON_KEY    = 'glynbox_anon_id'
const SESSION_KEY = 'glynbox_session_id'
const SESSION_TS  = 'glynbox_session_last'
const ORIGEN_KEY  = 'glynbox_origen'

/** Nueva sesión después de esto sin actividad. */
const SESSION_TIMEOUT_MS = 30 * 60_000

/** Se manda cuando la cola llega acá... */
const BATCH_SIZE = 10
/** ...o cuando pasa esto desde el primer evento en cola. */
const FLUSH_INTERVAL_MS = 5_000

/** Techo de la cola, por si el flush viene fallando: no crecer sin límite. */
const MAX_QUEUE = 50

interface QueuedEvent {
  name: string
  props: EventProps
  path: string | null
  user_id: string | null
  anon_id: string
  session_id: string
  platform: 'web'
}

let queue: QueuedEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let listenersReady = false

/** Cache del user id, para no pegarle a Supabase en cada evento. */
let cachedUserId: string | null = null
let userIdResolved = false

// ── Almacenamiento tolerante a fallos ──────────────────────────────────────
// En Safari privado, con cookies bloqueadas o con storage lleno, estos accesos
// TIRAN. No devuelven null: tiran. De ahí el try/catch en cada uno.

function readStore(store: 'local' | 'session', key: string): string | null {
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage
    return s.getItem(key)
  } catch { return null }
}

function writeStore(store: 'local' | 'session', key: string, value: string): void {
  try {
    const s = store === 'local' ? window.localStorage : window.sessionStorage
    s.setItem(key, value)
  } catch { /* sin storage seguimos igual, con ids en memoria */ }
}

function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch { /* sigue abajo */ }
  // Respaldo para navegadores viejos y contextos no seguros (http://).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Identificador del navegador, persistente.
 *
 * Es lo que permite unir lo que hizo alguien antes de registrarse con lo que
 * hizo después. Si localStorage no está disponible, se genera uno por carga:
 * peor para la métrica, pero nunca rompe.
 */
let memoryAnonId: string | null = null

function getAnonId(): string {
  const stored = readStore('local', ANON_KEY)
  if (stored) return stored

  if (!memoryAnonId) memoryAnonId = uuid()
  writeStore('local', ANON_KEY, memoryAnonId)
  return memoryAnonId
}

/**
 * Identificador de sesión.
 *
 * Vive en sessionStorage, así que una pestaña nueva ya es una sesión nueva. Y
 * además se renueva si pasaron 30 minutos sin eventos, para que una pestaña
 * abierta toda la noche no cuente como una sola sesión eterna.
 *
 * El respaldo en memoria NO es decorativo. Antes existía la variable pero nunca
 * se leía al entrar a la función: se asignaba y se devolvía en la misma
 * llamada. Con eso, en cualquier navegador donde sessionStorage no esté
 * disponible —Safari privado, un iframe sin allow-same-origin, storage lleno—
 * cada `track()` minteaba un id nuevo, y la sesión de esa persona salía
 * partida en tantas sesiones como eventos hubiera generado.
 *
 * `getAnonId()` acá al lado ya lo hacía bien; esto era la asimetría.
 *
 * Con storage roto la sesión sigue muriendo al recargar —el estado de módulo no
 * sobrevive—, y eso no tiene arreglo posible sin storage. Pero al menos la
 * visita queda entera en vez de hecha pedazos evento por evento.
 */
let memorySessionId: string | null = null
let memorySessionLast = 0

function getSessionId(): string {
  const now = Date.now()

  // El storage manda; la memoria es el respaldo. Se leen por separado porque
  // pueden fallar de a uno: se puede haber escrito el id y no el timestamp.
  const stored = readStore('session', SESSION_KEY)
  const lastRaw = readStore('session', SESSION_TS)

  const existing = stored ?? memorySessionId
  // `Number('')` y `Number('abc')` dan 0 y NaN, los dos falsy: el `last &&` de
  // abajo los trata como "no hay timestamp" y abre sesión nueva, que es lo
  // correcto.
  const last = lastRaw ? Number(lastRaw) : memorySessionLast

  if (existing && last && now - last < SESSION_TIMEOUT_MS) {
    memorySessionId = existing
    memorySessionLast = now
    writeStore('session', SESSION_TS, String(now))
    return existing
  }

  const fresh = uuid()
  memorySessionId = fresh
  memorySessionLast = now
  writeStore('session', SESSION_KEY, fresh)
  writeStore('session', SESSION_TS, String(now))
  return fresh
}

// ── Origen de la sesión ────────────────────────────────────────────────────

/**
 * De dónde vino esta sesión, cuando vino de algún lado que queremos medir.
 *
 * Hoy hay uno solo. Es una unión y no un `string` para que marcar un origen
 * que el panel no conoce no compile.
 */
export type Origen = 'descargar'

/**
 * Por qué existe esto.
 *
 * `/descargar` es la pantalla a la que apuntan las campañas, y la pregunta que
 * importa de esa plata no es cuántos tocaron el botón sino cuántos terminaron
 * registrándose. El problema es que el registro no pasa ahí: pasa dos o tres
 * pantallas después, en el onboarding, cuando ya no queda ningún rastro de por
 * dónde entró esa persona.
 *
 * La marca es ese rastro. Se pone al pisar la landing y a partir de ahí viaja
 * en las props de todos los eventos de la sesión, así que el `signup_completed`
 * del final se le puede atribuir a la campaña. De paso, como la llevan también
 * los `page_view`, se puede medir cuánto se quedó y cuántas páginas vio esa
 * gente en particular.
 *
 * ── Por qué va pegada al `session_id` ──────────────────────────────────────
 *
 * Guardada a secas en sessionStorage, la marca sobreviviría a la renovación de
 * sesión por inactividad: la pestaña sigue siendo la misma, así que alguien que
 * deja la página abierta una hora y vuelve arrancaría una sesión NUEVA que
 * igual se contaría como una visita a la landing. El panel vería visitas que
 * nunca ocurrieron.
 *
 * Por eso se guarda `origen:session_id` y al leer se compara. Si la sesión se
 * renovó, la marca de la anterior no aplica y hay que volver a pisar la landing
 * para marcarse de nuevo — que es exactamente lo que significa "durante toda su
 * sesión".
 *
 * Lo que sí sobrevive, y tiene que sobrevivir, es la ida y vuelta al login de
 * Google: es la misma pestaña, así que sessionStorage sigue ahí cuando el
 * usuario vuelve a `/auth/callback`. Si el login abriera una pestaña nueva la
 * marca se perdería, y ese registro quedaría sin atribuir.
 */
let memoryOrigen: string | null = null

/**
 * Marca la sesión. Idempotente: la primera marca gana.
 *
 * Que la primera gane importa el día que haya un segundo origen. Alguien que
 * entró por una campaña y más tarde pasa por otra landing sigue siendo de la
 * primera, que es la que lo trajo.
 */
export function marcarOrigen(origen: Origen): void {
  try {
    if (typeof window === 'undefined') return

    const sessionId = getSessionId()
    const actual = leerOrigen(sessionId)
    if (actual) return

    const valor = `${origen}:${sessionId}`
    memoryOrigen = valor
    writeStore('session', ORIGEN_KEY, valor)
  } catch { /* nunca romper por medición */ }
}

/**
 * El origen de la sesión en curso, o `null`.
 *
 * Recibe el `session_id` ya resuelto en vez de pedirlo: `track()` lo acaba de
 * calcular, y volver a llamar a `getSessionId()` acá adentro reescribiría el
 * timestamp de actividad por segunda vez en la misma llamada.
 */
function leerOrigen(sessionId: string): Origen | null {
  const guardado = readStore('session', ORIGEN_KEY) ?? memoryOrigen
  if (!guardado) return null

  // `split` con límite no existe en JS como en otros lenguajes, y el valor
  // tiene un solo separador útil: lo que va antes del primer `:` es el origen.
  const corte = guardado.indexOf(':')
  if (corte < 0) return null

  const origen = guardado.slice(0, corte)
  const deSesion = guardado.slice(corte + 1)

  if (deSesion !== sessionId) return null
  return origen === 'descargar' ? origen : null
}

// ── Usuario ────────────────────────────────────────────────────────────────

/**
 * El user id, si hay sesión.
 *
 * Se resuelve una sola vez y queda cacheado. `getSession()` y no `getUser()`:
 * el primero lee el token que ya está en storage, el segundo hace un round trip
 * a Supabase, y no vale la pena por un campo de analytics.
 */
async function resolveUserId(): Promise<string | null> {
  if (userIdResolved) return cachedUserId
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getSession()
    cachedUserId = data.session?.user?.id ?? null
  } catch {
    cachedUserId = null
  }
  userIdResolved = true
  return cachedUserId
}

/** Para llamar al login/logout y no arrastrar el id viejo. */
export function resetAnalyticsUser(): void {
  cachedUserId = null
  userIdResolved = false
}

// ── Envío ──────────────────────────────────────────────────────────────────

function payloadFor(events: QueuedEvent[]): string {
  return JSON.stringify({ events })
}

/**
 * Vacía la cola.
 *
 * `useBeacon` sólo va en `pagehide`/`visibilitychange`: `sendBeacon` es lo único
 * que el navegador se compromete a mandar cuando la página se está
 * descargando, porque un `fetch` normal se cancela con la página. Tiene un tope
 * de ~64KB, de sobra para 50 eventos.
 */
function flush(useBeacon = false): void {
  if (queue.length === 0) return

  const batch = queue
  queue = []

  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }

  try {
    const body = payloadFor(batch)

    if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
      return
    }

    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // La respuesta no se mira: no hay nada que hacer con ella y no queremos
      // que un 500 llegue a la consola del usuario como un unhandled rejection.
      keepalive: true,
    }).catch(() => { /* silencio */ })
  } catch { /* silencio */ }
}

function scheduleFlush(): void {
  if (flushTimer) return
  try {
    flushTimer = setTimeout(() => {
      flushTimer = null
      flush()
    }, FLUSH_INTERVAL_MS)
  } catch { /* silencio */ }
}

/**
 * Engancha el vaciado al cierre de la pestaña.
 *
 * `visibilitychange` a hidden es el evento confiable en móvil: en iOS
 * `beforeunload` muchas veces no dispara, porque la app pasa a segundo plano en
 * vez de cerrarse. `pagehide` cubre el resto.
 */
function ensureListeners(): void {
  if (listenersReady || typeof window === 'undefined') return
  listenersReady = true

  try {
    const onHide = () => flush(true)
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush(true)
    })
  } catch { /* silencio */ }
}

// ── API pública ────────────────────────────────────────────────────────────

/**
 * Registra un evento.
 *
 * No devuelve promesa y nunca tira. Se llama y se sigue.
 *
 *     track('provider_click', { provider: 'Netflix', media_type: 'movie', media_id: 603 })
 *
 * `name` está tipado contra el catálogo de `lib/analytics-events.ts`, así que un
 * nombre que no exista no compila. El endpoint igual revalida: el cliente es
 * público y no se le cree nada.
 */
export function track(name: EventName, props: EventProps = {}): void {
  try {
    if (typeof window === 'undefined') return  // no-op en SSR

    ensureListeners()

    const anonId = getAnonId()
    const sessionId = getSessionId()
    const path = window.location?.pathname ?? null

    // La marca de origen viaja en las props de cada evento, y no en una
    // columna propia, por una razón de costos: una columna obligaría a migrar
    // `analytics_events` y a tocar `/api/track`, y `props` ya es JSONB y ya se
    // consulta así en el panel (ver `props->>dispositivo`). El día que haya
    // muchos orígenes y la consulta pese, se agrega un índice en el SQL sin
    // tocar una línea de acá.
    //
    // No pisa una prop `origen` que venga del llamador. Hoy no hay ninguna,
    // pero el orden importa: lo que el evento dice de sí mismo gana sobre lo
    // que infiere la sesión.
    const origen = leerOrigen(sessionId)
    const propsFinales: EventProps =
      origen && props.origen === undefined ? { ...props, origen } : props

    // Se encola YA, con el user_id que haya cacheado. Si todavía no se resolvió,
    // se completa cuando llegue: encolar es sincrónico para que `track()` no
    // devuelva promesa y nadie tenga que await-earlo.
    const event: QueuedEvent = {
      name,
      props: propsFinales,
      path,
      user_id: cachedUserId,
      anon_id: anonId,
      session_id: sessionId,
      platform: 'web',
    }

    queue.push(event)

    if (!userIdResolved) {
      void resolveUserId().then(id => {
        if (id && event.user_id === null) event.user_id = id
      })
    }

    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE)

    if (queue.length >= BATCH_SIZE) flush()
    else scheduleFlush()
  } catch {
    // Nunca propagar. Un fallo de medición no puede volverse un error de la app.
  }
}

/** Fuerza el envío. Para casos donde la navegación se va a llevar la página. */
export function flushAnalytics(): void {
  try { flush(true) } catch { /* silencio */ }
}
