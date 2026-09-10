import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import { requireAdminClient } from '@/lib/service-role'
import {
  buildNotificationContent,
  type NotificationRow,
} from '@/lib/notification-content'
import { sendPushToUser } from '@/lib/send-push-notification'
import type { NotifType } from '@/lib/notify'

/**
 * POST /api/push/on-notification
 *
 * Disparador de push. Lo llama un Database Webhook de Supabase con cada INSERT
 * sobre `notifications`.
 *
 * Hasta ahora la fila se insertaba y ahí moría: la notificación sólo se veía si
 * el usuario entraba a la app y abría la campanita. Este endpoint es el puente
 * entre la fila y el teléfono.
 *
 * Regla de oro: **nunca devolver != 200**. Supabase reintenta ante un error, y
 * un reintento acá no significa "se arregla", significa que a la persona le
 * suena el teléfono cuatro veces por el mismo like. Si algo falla, se loguea y
 * se contesta 200 igual. La única excepción es el 401 de autenticación, donde
 * justamente queremos cortar.
 */

export const runtime = 'nodejs' // web-push necesita el crypto de Node

/** Header que tenés que configurar en el dashboard del webhook. */
const SECRET_HEADER = 'x-glynbox-push-secret'

// ── Autenticación ──────────────────────────────────────────────────────────

/**
 * Comparación en tiempo constante.
 *
 * `timingSafeEqual` explota si los buffers miden distinto, y la longitud del
 * secreto ya es información. Hashear los dos lados primero deja ambos en 32
 * bytes siempre, así que la comparación no filtra ni el contenido ni el largo.
 */
function secretMatches(received: string | null, expected: string): boolean {
  if (!received) return false
  const a = createHash('sha256').update(received).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

// ── Payload del webhook ────────────────────────────────────────────────────

interface WebhookPayload {
  type?: string
  table?: string
  schema?: string
  record?: NotificationRow | null
  old_record?: NotificationRow | null
}

// ── Idempotencia ───────────────────────────────────────────────────────────

/**
 * IDs ya procesados, para que un reintento del webhook no vuelva a mandar.
 *
 * Es caché de módulo: sobrevive entre invocaciones tibias de la misma instancia
 * y se pierde en un cold start. O sea, best-effort — no cubre el caso de dos
 * instancias en paralelo. Alcanza para lo que pasa en la práctica (Supabase
 * reintenta la misma request a los segundos) y no necesita tabla ni schema.
 */
const seen = new Map<string, number>()
const DEDUPE_TTL = 5 * 60_000

function alreadyHandled(id: string): boolean {
  const now = Date.now()
  // Barrido perezoso: sin esto el Map crece sin techo en una instancia longeva.
  if (seen.size > 500) {
    for (const [k, ts] of seen) if (now - ts > DEDUPE_TTL) seen.delete(k)
  }
  const hit = seen.get(id)
  if (hit != null && now - hit < DEDUPE_TTL) return true
  seen.set(id, now)
  return false
}

// ── Preferencias ───────────────────────────────────────────────────────────

/**
 * Tipo de notificación → clave dentro de `profiles.notification_preferences`.
 *
 * Las claves son las que están REALMENTE en la base (las 8 que escribe
 * `app/ajustes/notificaciones/page.tsx`), no las del tipo. Por eso `follow` va
 * contra `follows` y `review_like` contra `likes`.
 *
 * `list_like` y `list_comment` no existen hoy en el JSON de ningún perfil. Como
 * el chequeo es `=== false`, una clave ausente se interpreta como encendida,
 * que es el default correcto.
 */
const PREF_KEY_BY_TYPE: Record<string, string> = {
  follow:         'follows',
  review_like:    'likes',
  review_comment: 'comments',
  comment_reply:  'replies',
  mention:        'mentions',
  level_up:       'level_up',
  list_like:      'list_like',
  list_comment:   'list_comment',
  actor_birthday: 'actor_birthday',
  new_release:    'new_release',
}

/**
 * Tipos donde `actor_id === user_id` es legítimo y NO hay que descartar.
 *
 * `add_points()` inserta el level_up con `actor_id = p_user_id` (es el propio
 * usuario el que subió de nivel). Sin esta excepción, el filtro de
 * "no notificarse a uno mismo" se comería todos los level_up.
 */
const SELF_ADDRESSED_TYPES = new Set(['level_up', 'actor_birthday', 'new_release'])

// ── Handler ────────────────────────────────────────────────────────────────

/** Respuesta de "no hicimos nada, no reintentes". Siempre 200. */
function ok(reason: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, reason, ...extra })
}

export async function POST(req: Request) {
  // ── 1. Autenticar ────────────────────────────────────────────────────────
  const expected = process.env.PUSH_NOTIFY_SECRET
  if (!expected) {
    // Sin secreto configurado no se puede distinguir a Supabase de cualquiera.
    // Se rechaza en vez de quedar abierto.
    console.error('[on-notification] falta PUSH_NOTIFY_SECRET en el entorno')
    return NextResponse.json({ error: 'not_configured' }, { status: 401 })
  }
  if (!secretMatches(req.headers.get(SECRET_HEADER), expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── 2. Validar que sea un INSERT sobre notifications ─────────────────────
  const payload = (await req.json().catch(() => null)) as WebhookPayload | null
  if (!payload) return ok('body ilegible')

  if (payload.type !== 'INSERT') return ok(`ignorado: type=${payload.type}`)
  if (payload.table !== 'notifications') return ok(`ignorado: table=${payload.table}`)

  const row = payload.record
  if (!row?.user_id) return ok('sin user_id')

  // ── Idempotencia ─────────────────────────────────────────────────────────
  if (row.id && alreadyHandled(row.id)) return ok('duplicado', { id: row.id })

  // Normalizado porque en la base puede haber variantes de mayúsculas
  // ('Follow'), y son datos históricos que no se tocan.
  const rawType = row.type ?? ''
  const type = String(rawType).trim().toLowerCase()
  if (!type) return ok('sin type')

  // ── 3. No notificarse a uno mismo ────────────────────────────────────────
  if (row.actor_id && row.actor_id === row.user_id && !SELF_ADDRESSED_TYPES.has(type)) {
    return ok('auto-notificación', { type })
  }

  const { admin, failure } = requireAdminClient('push/on-notification')
  // Ni siquiera acá devolvemos error: sin service role no hay push, pero un 500
  // haría que Supabase reintente para siempre.
  if (failure) return ok('sin service role')

  try {
    // ── 4. Respetar las preferencias del destinatario ──────────────────────
    const prefKey = PREF_KEY_BY_TYPE[type]
    if (prefKey) {
      const { data } = await admin
        .from('profiles')
        .select('notification_preferences')
        .eq('id', row.user_id)
        .maybeSingle()

      const prefs =
        (data as { notification_preferences: Record<string, boolean> | null } | null)
          ?.notification_preferences ?? {}

      // Sólo un `false` explícito apaga. Clave ausente = encendida.
      if (prefs[prefKey] === false) return ok('preferencia apagada', { type, prefKey })
    }

    // ── 5. Armar el texto ──────────────────────────────────────────────────
    const text = await buildNotificationContent(admin, type, row)
    if (!text) {
      console.warn('[on-notification] tipo de notificación desconocido:', JSON.stringify(rawType))
      return ok('tipo desconocido', { type: rawType })
    }

    // ── 6 y 7. Mandar a los dos canales y limpiar lo muerto ────────────────
    // `sendPushToUser` ya hace web (VAPID sobre push_subscriptions) y móvil
    // (Expo sobre user_devices) en paralelo, y borra las suscripciones que
    // devuelven 404/410 y los tokens con DeviceNotRegistered. Es lo mismo que
    // usa /api/send-push: un solo lugar donde se envía.
    await sendPushToUser(
      row.user_id,
      { title: text.title, body: text.body, url: text.url, tag: type },
      { type: type as NotifType, entityId: row.entity_id ?? row.review_id ?? undefined }
    )

    // `dispatched`, no `sent`: `sendPushToUser` se traga los errores de cada
    // transporte a propósito, así que desde acá no se puede afirmar que la
    // notificación llegó — sólo que se despachó a los dos canales.
    return NextResponse.json({ ok: true, dispatched: true, type, url: text.url })
  } catch (err: unknown) {
    // ── 8. Un fallo de envío nunca es un error del webhook ─────────────────
    console.error('[on-notification] fallo enviando el push:', (err as Error).message)
    return ok('fallo de envío (logueado)')
  }
}
