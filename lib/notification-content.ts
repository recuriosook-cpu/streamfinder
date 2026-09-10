import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tipo de notificación → a dónde lleva y qué dice.
 *
 * Este módulo existe porque ese mapeo estaba escrito tres veces:
 *
 *   - `app/api/push/on-notification/route.ts` — para el texto de la push.
 *   - `components/Navbar.tsx` → `handleNotifClick()` — para el dropdown de la web.
 *   - Y hacía falta una cuarta para la pantalla de notificaciones de la app.
 *
 * Tres copias de la misma tabla de decisiones es la forma garantizada de que
 * una push y la campanita terminen llevando a lugares distintos. De hecho ya
 * pasaba: para `review_like` la push abría `/review/{id}` y el dropdown de la
 * web abría `/{media_type}/{media_id}`. Misma notificación, dos destinos.
 *
 * ── Por qué está partido en dos ────────────────────────────────────────────
 *
 * `notificationUrl()` es **pura**: no hace I/O y no importa nada del servidor,
 * así que la puede usar un client component como el Navbar.
 *
 * `buildNotificationContent()` además arma el texto, y para eso necesita leer
 * la base con la service role (resolver el nombre del actor, el texto del
 * comentario, el título de la reseña). Sólo corre en el servidor.
 *
 * Si algún día hay que agregar un tipo nuevo, se agrega acá y aparece en los
 * tres lados solo.
 */

/** Una fila de `notifications`, con todo opcional: el webhook manda lo que hay. */
export interface NotificationRow {
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

/**
 * A dónde lleva una notificación. Ruta de glynbox.com, siempre.
 *
 * Devolver una ruta y no una pantalla es lo que permite que sirva para los tres
 * consumidores: la web hace `router.push()`, la app la resuelve con su parser
 * de deep links (el mismo que usa para los links compartidos), y el push la
 * manda en `data.url`. Un solo vocabulario.
 *
 * Nunca devuelve `null`: ante un tipo desconocido o datos incompletos cae a
 * `/comunidad`, que es un destino razonable y evita que un toque no haga nada.
 * Los datos incompletos son el caso normal, no el raro: `actor_birthday` y
 * `new_release` vienen sin `actor_id`, y las notificaciones viejas pueden venir
 * sin `entity_id`.
 */
export function notificationUrl(
  type: string,
  row: NotificationRow,
  username: string | null
): string {
  const profileUrl = username ? `/usuario/${username}` : '/comunidad'
  const reviewUrl = row.review_id ? `/review/${row.review_id}` : '/comunidad'
  const listUrl = row.entity_id ? `/listas/${row.entity_id}` : '/listas'

  switch (type) {
    case 'follow':
      return profileUrl
    case 'review_like':
    case 'review_comment':
    case 'comment_reply':
    case 'mention':
      return reviewUrl
    case 'level_up':
      return '/profile'
    case 'list_like':
    case 'list_comment':
      return listUrl
    case 'actor_birthday':
      return row.entity_id ? `/actor/${row.entity_id}` : '/comunidad'
    case 'new_release':
      return row.entity_id ? `/movie/${row.entity_id}` : '/'
    default:
      return '/comunidad'
  }
}

/** Los tipos que este módulo sabe redactar. Un tipo fuera de acá no tiene texto. */
export const KNOWN_TYPES = new Set([
  'follow', 'review_like', 'review_comment', 'comment_reply', 'mention',
  'level_up', 'list_like', 'list_comment', 'actor_birthday', 'new_release',
])

export interface NotificationContent {
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
export async function buildNotificationContent(
  admin: SupabaseClient,
  type: string,
  row: NotificationRow
): Promise<NotificationContent | null> {
  const { name: actor, username } = await resolveActor(admin, row)

  // El destino sale de `notificationUrl()`, que es la única tabla tipo → ruta
  // del proyecto. Acá sólo se redacta el texto.
  const url = notificationUrl(type, row, username)

  switch (type) {
    case 'follow':
      // Sin cuerpo: el título ya lo dice todo y una segunda línea vacía se ve mal.
      return { title: `${actor} te empezó a seguir`, body: '', url }

    case 'review_like': {
      const title = await resolveReviewTitle(admin, row)
      return {
        title: `A ${actor} le gustó tu reseña`,
        body:  title ? `Tu reseña de ${title}` : '',
        url,
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
        url,
      }
    }

    case 'comment_reply': {
      const comment = await resolveCommentText(admin, row)
      return {
        title: `${actor} respondió tu comentario`,
        body:  comment,
        url,
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
        url,
      }
    }

    case 'level_up': {
      // El nivel viaja en review_title (así lo inserta add_points) o en entity_title.
      const level = row.entity_title?.trim() || row.review_title?.trim() || ''
      return {
        title: '¡Subiste de nivel!',
        body:  level ? `Ahora sos ${level}` : '',
        url,
      }
    }

    case 'list_like':
      return {
        title: `A ${actor} le gustó tu lista`,
        body:  row.entity_title?.trim() ?? '',
        url,
      }

    case 'list_comment': {
      const comment = await resolveCommentText(admin, row)
      return {
        title: `${actor} comentó tu lista`,
        body:  comment || (row.entity_title?.trim() ?? ''),
        url,
      }
    }

    case 'actor_birthday': {
      const who = row.entity_title?.trim() || 'Alguien que seguís'
      return {
        title: `🎂 ${who} cumple años`,
        body:  '',
        url,
      }
    }

    case 'new_release': {
      const title = row.entity_title?.trim() || ''
      return {
        title: 'Nuevo estreno',
        body:  title,
        url,
      }
    }

    default:
      return null
  }
}
