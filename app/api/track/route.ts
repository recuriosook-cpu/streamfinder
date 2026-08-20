import { NextResponse, type NextRequest } from 'next/server'
import { enforceRateLimit } from '@/lib/rate-limit'
import { requireAdminClient } from '@/lib/service-role'
import { isKnownEvent, type EventProps } from '@/lib/analytics-events'

/**
 * POST /api/track — ingesta de eventos.
 *
 * Recibe uno o varios eventos en un solo request. El cliente los junta y los
 * manda de a lotes: una request cada 5 segundos vale mucho menos que una por
 * click.
 *
 * Dos reglas mandan sobre el resto:
 *
 *   1. **Siempre 200.** Un evento perdido no vale nada; una navegación rota
 *      vale mucho. Si el insert falla, se loguea y se contesta 200 igual. El
 *      cliente ni siquiera mira la respuesta.
 *   2. **Nada de datos personales en `props`.** Ver `sanitizeProps`: las claves
 *      que huelen a credencial se descartan enteras y los valores que parecen
 *      email o token se reemplazan por un marcador.
 */

export const runtime = 'nodejs'

/** Tope de eventos por request. Un lote normal trae 10. */
const MAX_EVENTS_PER_BATCH = 50

/** ~2KB de props por evento. Lo que pase, se descarta. */
const MAX_PROPS_BYTES = 2048

/** Un nombre de evento nunca llega ni cerca; corta strings absurdos. */
const MAX_STRING_LENGTH = 500

/** Igual que el resto de los endpoints proxy. */
const RATE_LIMIT = 60

// ── Sanitización ───────────────────────────────────────────────────────────

/**
 * Claves que nunca se guardan, pase lo que pase.
 *
 * Se compara por substring y en minúsculas, así que `userEmail`, `EMAIL` y
 * `email_address` caen los tres. Es deliberadamente exagerado: el costo de
 * descartar una prop de más es cero, el de guardar un token es un incidente.
 */
const BLOCKED_KEY_PATTERNS = [
  'email', 'mail',
  'password', 'passwd', 'pass',
  'token', 'jwt', 'bearer',
  'secret', 'apikey', 'api_key',
  'auth', 'session', 'cookie',
  'credential', 'phone', 'telefono',
  'dni', 'address', 'direccion',
]

/** Cualquier cosa con forma de mail. */
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

/**
 * Cadenas largas con pinta de credencial: JWT, `sb_secret_...`, claves de API.
 * El umbral de 20 caracteres deja pasar texto normal (una búsqueda, un título)
 * y atrapa lo que es claramente una clave.
 */
const TOKEN_PATTERN = /\b(?:eyJ[\w-]{10,}|sb_[a-z]+_[\w-]{10,}|[A-Za-z0-9_-]{40,})\b/g

function scrubString(value: string): string {
  return value
    .replace(EMAIL_PATTERN, '[email]')
    .replace(TOKEN_PATTERN, '[token]')
    .slice(0, MAX_STRING_LENGTH)
}

function isBlockedKey(key: string): boolean {
  const lower = key.toLowerCase()
  return BLOCKED_KEY_PATTERNS.some(pattern => lower.includes(pattern))
}

/**
 * Deja `props` en algo seguro de guardar.
 *
 * - Descarta las claves de la lista negra.
 * - Limpia emails y tokens de todos los valores string.
 * - Aplana: sólo string, number, boolean y null. Un objeto o un array anidado se
 *   descarta, porque no se puede revisar en profundidad de forma barata y no
 *   hay ningún evento que lo necesite.
 *
 * Devuelve `null` si, ya limpio, sigue pasándose de tamaño.
 */
function sanitizeProps(raw: unknown): EventProps | null {
  if (raw == null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) return {}

  const out: EventProps = {}

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isBlockedKey(key)) continue
    if (key.length > 64) continue

    if (typeof value === 'string') {
      out[key] = scrubString(value)
    } else if (typeof value === 'number') {
      // NaN e Infinity no son JSON válido y rompen el insert.
      if (Number.isFinite(value)) out[key] = value
    } else if (typeof value === 'boolean' || value === null) {
      out[key] = value
    }
    // Todo lo demás (objetos, arrays, undefined, funciones) se ignora.
  }

  // El límite se mide sobre lo ya sanitizado: es lo que realmente se guarda.
  const size = Buffer.byteLength(JSON.stringify(out), 'utf8')
  if (size > MAX_PROPS_BYTES) return null

  return out
}

/** Sólo el pathname. Un `?q=` o un `?token=` no tienen por qué quedar guardados. */
function sanitizePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  const withoutQuery = raw.split('?')[0].split('#')[0]
  return withoutQuery.slice(0, MAX_STRING_LENGTH)
}

function cleanId(raw: unknown, max = 100): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

/** Un uuid v4 como los que manda el cliente. Cualquier otra cosa va como null. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cleanUuid(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  return UUID_PATTERN.test(raw) ? raw : null
}

// ── Tipos ──────────────────────────────────────────────────────────────────

interface IncomingEvent {
  name?: unknown
  props?: unknown
  path?: unknown
  user_id?: unknown
  anon_id?: unknown
  session_id?: unknown
  platform?: unknown
}

interface EventRow {
  user_id: string | null
  anon_id: string
  session_id: string
  name: string
  props: EventProps
  platform: string
  path: string | null
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // El 429 es la única respuesta que no es 200. Es la que corta el abuso, y a
  // esa altura todavía no se tocó la base.
  const limited = enforceRateLimit(req, {}, RATE_LIMIT)
  if (limited) return limited

  // A partir de acá, pase lo que pase, se contesta 200.
  try {
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: true, accepted: 0 })

    // Acepta `{ events: [...] }`, un array pelado, o un evento suelto.
    const rawEvents: unknown[] = Array.isArray(body)
      ? body
      : Array.isArray((body as { events?: unknown }).events)
        ? ((body as { events: unknown[] }).events)
        : [body]

    if (rawEvents.length === 0) return NextResponse.json({ ok: true, accepted: 0 })

    const rows: EventRow[] = []
    let discarded = 0

    for (const raw of rawEvents.slice(0, MAX_EVENTS_PER_BATCH)) {
      if (!raw || typeof raw !== 'object') { discarded++; continue }
      const ev = raw as IncomingEvent

      // Lista blanca. Un nombre que no está se descarta sin decir nada: si el
      // endpoint contestara "nombre inválido", le estaría explicando a quien lo
      // sondea cómo mandar algo que sí entre.
      if (!isKnownEvent(ev.name)) { discarded++; continue }

      const anonId = cleanId(ev.anon_id)
      const sessionId = cleanId(ev.session_id)
      if (!anonId || !sessionId) { discarded++; continue }

      const props = sanitizeProps(ev.props)
      if (props === null) { discarded++; continue }  // se pasó de 2KB

      rows.push({
        // Sin verificar contra la sesión a propósito: el user_id acá es una
        // pista para agrupar, no una credencial. Nada se autoriza en base a
        // esta columna, así que un valor falseado sólo ensucia la métrica de
        // quien lo mande. Verificarlo costaría una lectura de cookies por
        // request y no compraría nada.
        user_id:    cleanUuid(ev.user_id),
        anon_id:    anonId,
        session_id: sessionId,
        name:       ev.name,
        props,
        platform:   ev.platform === 'mobile' ? 'mobile' : 'web',
        path:       sanitizePath(ev.path),
      })
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, accepted: 0, discarded })
    }

    const { admin, failure } = requireAdminClient('track')
    if (failure) {
      // `requireAdminClient` devuelve un 500 ya armado. Acá no sirve: perder un
      // evento no puede verse como un error del lado del navegador.
      console.error('[track] sin service role — se descartaron', rows.length, 'eventos')
      return NextResponse.json({ ok: true, accepted: 0, reason: 'not_configured' })
    }

    const { error } = await admin.from('analytics_events').insert(rows)
    if (error) {
      console.error('[track] insert falló:', error.message)
      return NextResponse.json({ ok: true, accepted: 0, reason: 'insert_failed' })
    }

    return NextResponse.json({ ok: true, accepted: rows.length, discarded })
  } catch (err: unknown) {
    console.error('[track] error inesperado:', (err as Error).message)
    return NextResponse.json({ ok: true, accepted: 0 })
  }
}
