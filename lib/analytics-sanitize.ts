import type { EventProps } from '@/lib/analytics-events'

/**
 * Sanitizado de eventos. Funciones puras, sin nada de Next ni de Supabase.
 *
 * Está separado de `app/api/track/route.ts` por dos razones: es la parte que
 * garantiza que no se guarde nada personal, y esa garantía tiene que poder
 * ejercitarse sin levantar un servidor.
 */

/** ~2KB de props por evento. */
export const MAX_PROPS_BYTES = 2048

/** Corta strings absurdos. Un título o una búsqueda normal entran holgados. */
export const MAX_STRING_LENGTH = 500

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
 * Cadenas con pinta de credencial: JWT, `sb_secret_...`, claves de API.
 * El umbral de 40 caracteres para el caso genérico deja pasar texto normal —una
 * búsqueda, un título de película— y atrapa lo que es claramente una clave.
 */
const TOKEN_PATTERN = /\b(?:eyJ[\w-]{10,}|sb_[a-z]+_[\w-]{10,}|[A-Za-z0-9_-]{40,})\b/g

export function scrubString(value: string): string {
  return value
    .replace(EMAIL_PATTERN, '[email]')
    .replace(TOKEN_PATTERN, '[token]')
    .slice(0, MAX_STRING_LENGTH)
}

export function isBlockedKey(key: string): boolean {
  const lower = key.toLowerCase()
  return BLOCKED_KEY_PATTERNS.some(pattern => lower.includes(pattern))
}

/**
 * Deja `props` en algo seguro de guardar.
 *
 * - Descarta las claves de la lista negra.
 * - Limpia emails y tokens de todos los valores string.
 * - Aplana: sólo string, number, boolean y null. Un objeto o un array anidado se
 *   descarta, porque revisarlo en profundidad no es barato y no hay ningún
 *   evento que lo necesite.
 *
 * Devuelve `null` si, ya limpio, sigue pasándose de tamaño.
 */
export function sanitizeProps(raw: unknown): EventProps | null {
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
export function sanitizePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null
  const withoutQuery = raw.split('?')[0].split('#')[0]
  return withoutQuery.slice(0, MAX_STRING_LENGTH)
}

export function cleanId(raw: unknown, max = 100): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

/** Un uuid como los que manda el cliente. Cualquier otra cosa va como null. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function cleanUuid(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  return UUID_PATTERN.test(raw) ? raw : null
}
