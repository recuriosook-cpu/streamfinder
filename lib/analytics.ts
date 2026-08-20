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
 */
let memorySessionId: string | null = null

function getSessionId(): string {
  const now = Date.now()
  const existing = readStore('session', SESSION_KEY)
  const lastRaw = readStore('session', SESSION_TS)
  const last = lastRaw ? Number(lastRaw) : 0

  if (existing && last && now - last < SESSION_TIMEOUT_MS) {
    writeStore('session', SESSION_TS, String(now))
    return existing
  }

  const fresh = uuid()
  memorySessionId = fresh
  writeStore('session', SESSION_KEY, fresh)
  writeStore('session', SESSION_TS, String(now))
  return memorySessionId
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

    // Se encola YA, con el user_id que haya cacheado. Si todavía no se resolvió,
    // se completa cuando llegue: encolar es sincrónico para que `track()` no
    // devuelva promesa y nadie tenga que await-earlo.
    const event: QueuedEvent = {
      name,
      props,
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
