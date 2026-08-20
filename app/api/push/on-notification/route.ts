import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminClient } from '@/lib/service-role'
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

interface NotificationRow {
  id?: string
  user_id?: string
  actor_id?: string | null
  type?: string | null
  review_id?: string | null
  review_title?: string | null
  comment_id?: string | null
  entity_id?: string | null
  entity_type?: string | null
  entity_title?: string | null
  actor_username?: string | null
  created_at?: string | null
}

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

// ── Armado del texto ───────────────────────────────────────────────────────

interface PushText {
  title: string
  body: string
  url: string
}

/** Recorta en el espacio más cercano para no cortar una palabra al medio. */
function excerpt(text: string | null | undefined, max = 90): string {
  if (!text) return ''
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + '…'
}

/**
 * Nombre de quien disparó la notificación.
 *
 * `actor_username` viene NULL en el 100% de las filas de la base: los triggers
 * de Postgres (`notify_on_follow`, `notify_on_review_like`) insertan sólo
 * `user_id, actor_id, type`, y `sendNotification()` tampoco lo completa desde
 * el cliente. Si confiáramos en la columna, todas las notificaciones dirían
 * "Alguien". Por eso se resuelve contra `profiles` con el `actor_id`, que sí
 * está siempre.
 */
async function resolveActor(
  admin: SupabaseClient,
  row: NotificationRow
): Promise<{ name: string; username: string | null }> {
  if (!row.actor_id) return { name: 'Alguien', username: row.actor_username ?? null }

  const { data, error } = await admin
    .from('profiles')
    .select('username, display_name')
    .eq('id', row.actor_id)
    .maybeSingle()

  if (error) console.error('[on-notification] no se pudo leer el perfil del actor:', error.message)

  const profile = data as { username: string | null; display_name: string | null } | null
  const name =
    profile?.display_name?.trim() ||
    profile?.username?.trim() ||
    row.actor_username?.trim() ||
    'Alguien'

  return { name, username: profile?.username ?? row.actor_username ?? null }
}

/**
 * Texto del comentario que originó la notificación.
 *
 * `comment_id` también viene NULL en todas las filas actuales, así que el
 * camino principal es el fallback: el último comentario de ese actor en esa
 * reseña. Como el webhook dispara en el mismo instante del INSERT, es
 * prácticamente seguro que sea ése. Si algún día se empieza a completar
 * `comment_id`, ese camino tiene prioridad y deja de ser heurística.
 */
async function resolveCommentText(
  admin: SupabaseClient,
  row: NotificationRow
): Promise<string> {
  try {
    if (row.comment_id) {
      const { data } = await admin
        .from('review_comments')
        .select('content')
        .eq('id', row.comment_id)
        .maybeSingle()
      const content = (data as { content: string | null } | null)?.content
      if (content) return excerpt(content)
    }

    if (row.review_id && row.actor_id) {
      const { data } = await admin
        .from('review_comments')
        .select('content')
        .eq('review_id', row.review_id)
        .eq('user_id', row.actor_id)
        .order('created_at', { ascending: false })
        .limit(1)
      const content = (data as { content: string | null }[] | null)?.[0]?.content
      if (content) return excerpt(content)
    }
  } catch (err: unknown) {
    console.error('[on-notification] no se pudo leer el comentario:', (err as Error).message)
  }
  return ''
}

/** Título de la reseña, si la fila no lo trae. */
async function resolveReviewTitle(
  admin: SupabaseClient,
  row: NotificationRow
): Promise<string> {
  if (row.review_title?.trim()) return row.review_title.trim()
  if (!row.review_id) return ''
  const { data } = await admin
    .from('reviews')
    .select('title')
    .eq('id', row.review_id)
    .maybeSingle()
  return (data as { title: string | null } | null)?.title?.trim() ?? ''
}

/**
 * Tipo + fila → { title, body, url }.
 *
 * Los textos van en rioplatense, cortos y con el nombre adelante: en la bandeja
 * del teléfono se ven ~40 caracteres del título, así que lo primero tiene que
 * ser quién lo hizo.
 *
 * Las URLs son rutas reales de glynbox.com. El assetlinks.json declara
 * `handle_all_urls` para com.glynbox.app, así que en Android el link abre la app
 * directo; en la web el service worker las abre con `clients.openWindow`.
 *
 * Devuelve `null` para un tipo desconocido — y quien llama loguea cuál era.
 */
async function buildPushText(
  admin: SupabaseClient,
  type: string,
  row: NotificationRow
): Promise<PushText | null> {
  const { name: actor, username } = await resolveActor(admin, row)

  const profileUrl = username ? `/usuario/${username}` : '/comunidad'
  const reviewUrl  = row.review_id ? `/review/${row.review_id}` : '/comunidad'
  const listUrl    = row.entity_id ? `/listas/${row.entity_id}` : '/listas'

  switch (type) {
    case 'follow':
      // Sin cuerpo: el título ya lo dice todo y una segunda línea vacía se ve mal.
      return { title: `${actor} te empezó a seguir`, body: '', url: profileUrl }

    case 'review_like': {
      const title = await resolveReviewTitle(admin, row)
      return {
        title: `A ${actor} le gustó tu reseña`,
        body:  title ? `Tu reseña de ${title}` : '',
        url:   reviewUrl,
      }
    }

    case 'review_comment': {
      const [comment, reviewTitle] = await Promise.all([
        resolveCommentText(admin, row),
        resolveReviewTitle(admin, row),
      ])
      return {
        title: `${actor} comentó tu reseña`,
        body:  comment || (reviewTitle ? `Tu reseña de ${reviewTitle}` : ''),
        url:   reviewUrl,
      }
    }

    case 'comment_reply': {
      const comment = await resolveCommentText(admin, row)
      return {
        title: `${actor} respondió tu comentario`,
        body:  comment,
        url:   reviewUrl,
      }
    }

    case 'mention': {
      const [comment, reviewTitle] = await Promise.all([
        resolveCommentText(admin, row),
        resolveReviewTitle(admin, row),
      ])
      return {
        title: `${actor} te mencionó`,
        body:  comment || (reviewTitle ? `En su reseña de ${reviewTitle}` : ''),
        url:   reviewUrl,
      }
    }

    case 'level_up': {
      // El nivel viaja en review_title (así lo inserta add_points) o en entity_title.
      const level = row.entity_title?.trim() || row.review_title?.trim() || ''
      return {
        title: '¡Subiste de nivel!',
        body:  level ? `Ahora sos ${level}` : '',
        url:   '/profile',
      }
    }

    case 'list_like':
      return {
        title: `A ${actor} le gustó tu lista`,
        body:  row.entity_title?.trim() ?? '',
        url:   listUrl,
      }

    case 'list_comment': {
      const comment = await resolveCommentText(admin, row)
      return {
        title: `${actor} comentó tu lista`,
        body:  comment || (row.entity_title?.trim() ?? ''),
        url:   listUrl,
      }
    }

    case 'actor_birthday': {
      const who = row.entity_title?.trim() || 'Alguien que seguís'
      return {
        title: `🎂 ${who} cumple años`,
        body:  '',
        url:   row.entity_id ? `/actor/${row.entity_id}` : '/comunidad',
      }
    }

    case 'new_release': {
      const title = row.entity_title?.trim() || ''
      return {
        title: 'Nuevo estreno',
        body:  title,
        url:   row.entity_id ? `/movie/${row.entity_id}` : '/',
      }
    }

    default:
      return null
  }
}

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
    const text = await buildPushText(admin, type, row)
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
