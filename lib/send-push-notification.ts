// SERVER-ONLY — do not import from client components.
// Uses web-push (Node.js crypto) and VAPID_PRIVATE_KEY.

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import type { NotifType } from './notify'

let vapidInitialised = false
function initVapid() {
  if (vapidInitialised) return
  const subject = process.env.VAPID_SUBJECT
  const pubKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !pubKey || !privKey) {
    console.warn('[push] VAPID keys not configured — push disabled')
    return
  }
  webpush.setVapidDetails(subject, pubKey, privKey)
  vapidInitialised = true
}

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Map notification type → PREF key (mirrors lib/notify.ts)
const PREF_KEY: Partial<Record<NotifType, string>> = {
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

export interface PushPayload {
  title: string
  body:  string
  icon?: string
  url?:  string
  tag?:  string
}

export function buildPushPayload(
  type: NotifType,
  actorName?: string,
  entityTitle?: string,
  entityId?: string
): PushPayload | null {
  const actor = actorName || 'Alguien'
  switch (type) {
    case 'follow':
      return { title: '🤝 Nuevo seguidor', body: `${actor} empezó a seguirte`, url: '/comunidad', tag: 'follow' }
    case 'review_like':
      return { title: '❤️ Me gusta en tu reseña', body: `A ${actor} le gustó tu reseña de ${entityTitle || ''}`, url: '/comunidad', tag: 'review-like' }
    case 'review_comment':
      return { title: '💬 Comentaron tu reseña', body: `${actor} comentó tu reseña de ${entityTitle || ''}`, url: '/comunidad', tag: 'review-comment' }
    case 'comment_reply':
      return { title: '↩️ Respondieron tu comentario', body: `${actor} respondió tu comentario`, url: '/comunidad', tag: 'comment-reply' }
    case 'mention':
      return { title: '👋 Te mencionaron', body: `${actor} te mencionó en una reseña`, url: '/comunidad', tag: 'mention' }
    case 'level_up':
      return { title: '🏆 ¡Subiste de nivel!', body: `Ahora sos ${entityTitle || ''}`, url: '/profile', tag: 'level-up' }
    case 'list_like':
      return { title: '❤️ Me gusta en tu lista', body: `A ${actor} le gustó "${entityTitle || ''}"`, url: entityId ? `/listas/${entityId}` : '/', tag: 'list-like' }
    case 'list_comment':
      return { title: '💬 Comentaron tu lista', body: `${actor} comentó "${entityTitle || ''}"`, url: entityId ? `/listas/${entityId}` : '/', tag: 'list-comment' }
    case 'actor_birthday':
      return { title: '🎂 ¡Hoy cumple años!', body: `${entityTitle || ''} cumple años hoy`, url: entityId ? `/actor/${entityId}` : '/', tag: 'birthday' }
    case 'new_release':
      return { title: '🎬 Nueva película', body: entityTitle || '', url: entityId ? `/movie/${entityId}` : '/', tag: 'new-release' }
    default:
      return null
  }
}

export async function sendPushToUser(
  userId: string,
  pushPayload: PushPayload
): Promise<void> {
  initVapid()
  if (!vapidInitialised) {
    console.warn('[push] skipping sendPushToUser — VAPID not initialised (check VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_SUBJECT in env)')
    return
  }

  const admin = adminSupabase()

  const { data: subs, error: subsError } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh_key, auth_key')
    .eq('user_id', userId)

  if (subsError) {
    console.error('[push] error fetching subscriptions:', subsError.message)
    return
  }
  if (!subs?.length) {
    console.log('[push] no subscriptions found for user:', userId)
    return
  }
  console.log(`[push] sending to ${subs.length} subscription(s) for user ${userId}`)

  const expiredIds: string[] = []

  await Promise.allSettled(
    subs.map(async (sub: { id: string; endpoint: string; p256dh_key: string; auth_key: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
          JSON.stringify({
            title: pushPayload.title,
            body:  pushPayload.body,
            icon:  pushPayload.icon ?? '/icon-192.png',
            url:   pushPayload.url  ?? '/',
            tag:   pushPayload.tag,
          })
        )
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 410 || code === 404) {
          expiredIds.push(sub.id)
        } else {
          console.error('[push] send error:', (err as Error).message)
        }
      }
    })
  )

  if (expiredIds.length) {
    await admin.from('push_subscriptions').delete().in('id', expiredIds)
  }
}

export { PREF_KEY }
