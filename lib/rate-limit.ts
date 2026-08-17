import { NextResponse, type NextRequest } from 'next/server'

/**
 * Rate limit por IP, en memoria del proceso.
 *
 * Qué protege y qué no, para que no se confunda con lo que no es:
 *
 *   - Frena el abuso accidental y el scraping simple: un script que pide en
 *     loop se come el 429 enseguida.
 *   - NO es una defensa contra un atacante decidido. Vercel corre funciones
 *     serverless: cada instancia tiene su propio Map, así que el límite real es
 *     "60 por minuto por instancia", y con varias instancias calientes el techo
 *     efectivo es más alto. Un ataque distribuido lo pasa por arriba sin
 *     esfuerzo.
 *
 * Para un límite de verdad hace falta un contador compartido (Upstash Redis o
 * similar); los pasos están al pie de este archivo. Esto es la versión sin
 * dependencias, que cubre el 90% de los casos reales a costo cero.
 */

/** Requests permitidas por ventana. */
const LIMIT = 60

/** Largo de la ventana. */
const WINDOW_MS = 60_000

/**
 * Tope de IPs distintas en memoria.
 *
 * Sin esto, el Map crece con cada IP nueva y en una función de larga vida se
 * convierte en un leak. Al llegar al tope se descartan las entradas vencidas y,
 * si aun así no alcanza, se vacía entero: perder el estado del rate limit es
 * mucho menos grave que quedarse sin memoria.
 */
const MAX_TRACKED_IPS = 10_000

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/**
 * La IP del cliente.
 *
 * En Vercel el primer valor de `x-forwarded-for` es el cliente real; el resto
 * son los proxies. `x-real-ip` es el respaldo. Si no hay ninguno se agrupa todo
 * bajo `unknown`, que es conservador: prefiere limitar de más antes que dejar
 * pasar a cualquiera que sepa borrar un header.
 */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

function evictIfNeeded(now: number): void {
  if (buckets.size < MAX_TRACKED_IPS) return

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }

  if (buckets.size >= MAX_TRACKED_IPS) buckets.clear()
}

export type RateLimitResult = {
  ok: boolean
  remaining: number
  resetAt: number
}

/** Cuenta una request y dice si entra en el límite. */
export function checkRateLimit(
  req: NextRequest,
  limit: number = LIMIT
): RateLimitResult {
  const now = Date.now()
  const ip = clientIp(req)

  evictIfNeeded(now)

  const bucket = buckets.get(ip)

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + WINDOW_MS
    buckets.set(ip, { count: 1, resetAt })
    return { ok: true, remaining: limit - 1, resetAt }
  }

  bucket.count += 1

  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  }
}

/** Headers estándar, para que un cliente educado se autorregule. */
export function rateLimitHeaders(
  result: RateLimitResult,
  limit: number = LIMIT
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  }
}

/**
 * Guarda para el arranque de un handler.
 *
 * Devuelve la respuesta 429 si hay que cortar, o `null` para seguir. Se usa
 * así:
 *
 *     const limited = enforceRateLimit(req, CORS_HEADERS)
 *     if (limited) return limited
 */
export function enforceRateLimit(
  req: NextRequest,
  extraHeaders: Record<string, string> = {},
  limit: number = LIMIT
): NextResponse | null {
  const result = checkRateLimit(req, limit)
  if (result.ok) return null

  // Se loguea para poder detectar abuso en los logs de Vercel. Una línea por
  // request bloqueada, no por request permitida.
  console.warn('[rate-limit] blocked', {
    ip: clientIp(req),
    path: new URL(req.url).pathname,
  })

  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))

  return NextResponse.json(
    { error: 'rate_limited', message: 'Demasiadas solicitudes. Probá en un minuto.' },
    {
      status: 429,
      headers: {
        ...extraHeaders,
        ...rateLimitHeaders(result, limit),
        'Retry-After': String(retryAfter),
      },
    }
  )
}

/*
 * ── Si algún día hace falta un límite de verdad ──────────────────────────────
 *
 * El problema de esta versión es que el estado vive en la instancia. Para un
 * contador compartido entre todas:
 *
 *   1. Crear una base Redis en Upstash (tiene free tier) y conectarla al
 *      proyecto desde el dashboard de Vercel: eso define UPSTASH_REDIS_REST_URL
 *      y UPSTASH_REDIS_REST_TOKEN solas.
 *   2. npm i @upstash/ratelimit @upstash/redis
 *   3. Reemplazar `checkRateLimit` por:
 *
 *        const ratelimit = new Ratelimit({
 *          redis: Redis.fromEnv(),
 *          limiter: Ratelimit.slidingWindow(60, '1 m'),
 *          analytics: true,
 *        })
 *        const { success, remaining, reset } = await ratelimit.limit(ip)
 *
 *      `enforceRateLimit` pasa a ser async y los handlers le ponen await. El
 *      resto —headers, 429, log— no cambia.
 */
