import type { SupabaseClient } from '@supabase/supabase-js'
import type { Idioma } from './idioma'
import { getGuideBySlug } from './guides'
import { notificationUrl, type NotificationRow } from './notification-url'

export { notificationUrl, type NotificationRow }

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
 * así que la puede usar un client component como el Navbar. Vive aparte, en
 * `notification-url.ts`, porque este módulo lee los archivos de las guías y no
 * puede ir al navegador.
 *
 * `buildNotificationContent()` además arma el texto, y para eso necesita leer
 * la base con la service role (resolver el nombre del actor, el texto del
 * comentario, el título de la reseña). Sólo corre en el servidor.
 *
 * Si algún día hay que agregar un tipo nuevo, se agrega acá y aparece en los
 * tres lados solo.
 */

/**
 * Lo que guarda el cron en `notifications.datos` para redactar en cada
 * idioma. `entity_title` igual lleva la frase en castellano, para la
 * campanita de la web, que arma su propio texto.
 */
export interface DatosAviso {
  /** El famoso. */
  persona?: string
  /** 'cast' = actúa; 'crew' = dirige, escribe o creó la serie. */
  rol?: 'cast' | 'crew'
  titulo_es?: string
  titulo_en?: string | null
  /** El nombre de la plataforma, para la disponibilidad. */
  plataforma?: string
}

function datosDe(row: NotificationRow): DatosAviso {
  return row.datos && typeof row.datos === 'object' ? (row.datos as DatosAviso) : {}
}

/** Los tipos que este módulo sabe redactar. Un tipo fuera de acá no tiene texto. */
export const KNOWN_TYPES = new Set([
  'follow', 'review_like', 'review_comment', 'comment_reply', 'mention',
  'level_up', 'list_like', 'list_comment', 'actor_birthday', 'new_release',
  'famoso_proyecto', 'famoso_disponible', 'watchlist_disponible',
])

export interface NotificationContent {
  title: string
  body: string
  url: string
  /**
   * Lo que hizo el actor, sin su nombre ("comentó tu reseña"), en las que
   * tienen actor. La bandeja de la app muestra el nombre aparte, con el tilde
   * de verificado, y esto al lado. El push sigue usando `title`.
   */
  accion?: string
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
  row: NotificationRow,
  alguien: string
): Promise<{ name: string; username: string | null }> {
  if (!row.actor_id) return { name: alguien, username: row.actor_username ?? null }

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
    alguien

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
 *
 * El comentario tiene que ser del actor. `comment_id` lo manda el cliente: sin
 * ese filtro, alguien podía apuntarlo al comentario de otra persona y hacerlo
 * aparecer en el push bajo su nombre. (En `comment_reply` la web manda el
 * comentario *respondido*, que es del destinatario: con el filtro cae al
 * fallback y el push muestra la respuesta, que es lo que tenía que mostrar.)
 */
async function resolveCommentText(
  admin: SupabaseClient,
  row: NotificationRow
): Promise<string> {
  try {
    if (row.comment_id && row.actor_id) {
      const { data } = await admin
        .from('review_comments')
        .select('content')
        .eq('id', row.comment_id)
        .eq('user_id', row.actor_id)
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

/**
 * Título de la reseña (el de la película o serie), leído de la base.
 *
 * No se usa `row.review_title`: lo manda el cliente, y alguien podía poner
 * cualquier texto y hacerlo llegar como "Tu reseña de {texto}".
 */
async function resolveReviewTitle(
  admin: SupabaseClient,
  row: NotificationRow
): Promise<string> {
  if (!row.review_id) return ''
  const { data } = await admin
    .from('reviews')
    .select('title')
    .eq('id', row.review_id)
    .maybeSingle()
  return (data as { title: string | null } | null)?.title?.trim() ?? ''
}

/**
 * Nombre de la lista, leído de la base. Mismo motivo que `resolveReviewTitle`:
 * `entity_title` lo manda el cliente y llegaba tal cual al push.
 */
async function resolveListTitle(
  admin: SupabaseClient,
  row: NotificationRow
): Promise<string> {
  if (!row.entity_id) return ''
  const { data } = await admin
    .from('lists')
    .select('title')
    .eq('id', row.entity_id)
    .maybeSingle()
  return (data as { title: string | null } | null)?.title?.trim() ?? ''
}

/** Último comentario del actor en la lista, de la base. */
async function resolveListCommentText(
  admin: SupabaseClient,
  row: NotificationRow
): Promise<string> {
  if (!row.entity_id || !row.actor_id) return ''
  const { data } = await admin
    .from('list_comments')
    .select('content')
    .eq('list_id', row.entity_id)
    .eq('user_id', row.actor_id)
    .order('created_at', { ascending: false })
    .limit(1)
  return excerpt((data as { content: string | null }[] | null)?.[0]?.content)
}

/**
 * Título de la guía, de sus archivos y no de `entity_title`, que lo manda el
 * cliente (mismo motivo que `resolveReviewTitle`).
 */
function resolveGuideTitle(row: NotificationRow): string {
  if (!row.entity_id) return ''
  return getGuideBySlug(row.entity_id)?.title?.trim() ?? ''
}

/** Último comentario del actor en la guía, de la base. */
async function resolveGuideCommentText(
  admin: SupabaseClient,
  row: NotificationRow
): Promise<string> {
  if (!row.entity_id || !row.actor_id) return ''
  const { data } = await admin
    .from('guide_comments')
    .select('content')
    .eq('guide_slug', row.entity_id)
    .eq('user_id', row.actor_id)
    .order('created_at', { ascending: false })
    .limit(1)
  return excerpt((data as { content: string | null }[] | null)?.[0]?.content)
}

/**
 * Los nombres de los niveles, como los escribe `add_points` en la fila
 * ("🎬 Cinéfilo"). En inglés se cambia sólo el nombre y queda el emoji.
 */
const NIVELES_EN: Record<string, string> = {
  Espectador: 'Viewer',
  Cinéfilo: 'Film Buff',
  Crítico: 'Critic',
  Experto: 'Expert',
  Maestro: 'Master',
}

function nivelEn(nivel: string): string {
  return nivel.replace(/Espectador|Cinéfilo|Crítico|Experto|Maestro/, (n) => NIVELES_EN[n] ?? n)
}

/** "Con Ricardo Darín" si actúa, "De Lucrecia Martel" si dirige o escribe. */
function conQuien(d: DatosAviso, en: boolean): string {
  if (!d.persona) return ''
  if (d.rol === 'crew') return en ? `From ${d.persona}` : `De ${d.persona}`
  return en ? `With ${d.persona}` : `Con ${d.persona}`
}

/**
 * Tipo + fila → { title, body, url }.
 *
 * Los textos van cortos y con el nombre adelante: en la bandeja del teléfono
 * se ven ~40 caracteres del título, así que lo primero tiene que ser quién lo
 * hizo. En rioplatense, o en inglés para quien tiene la app en inglés (ver
 * `lib/idioma.ts`). Sin `idioma`, español: la web es sólo en castellano.
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
  row: NotificationRow,
  idioma: Idioma = 'es'
): Promise<NotificationContent | null> {
  const en = idioma === 'en'
  const { name: actor, username } = await resolveActor(admin, row, en ? 'Someone' : 'Alguien')

  // El destino sale de `notificationUrl()`, que es la única tabla tipo → ruta
  // del proyecto. Acá sólo se redacta el texto.
  const url = notificationUrl(type, row, username)

  switch (type) {
    case 'follow':
      // Sin cuerpo: el título ya lo dice todo y una segunda línea vacía se ve mal.
      return { title: en ? `${actor} started following you` : `${actor} te empezó a seguir`, accion: en ? 'started following you' : 'te empezó a seguir', body: '', url }

    case 'review_like': {
      const title = await resolveReviewTitle(admin, row)
      return {
        title: en ? `${actor} liked your review` : `A ${actor} le gustó tu reseña`,
        accion: en ? 'liked your review' : 'le gustó tu reseña',
        body:  title ? (en ? `Your review of ${title}` : `Tu reseña de ${title}`) : '',
        url,
      }
    }

    case 'review_comment': {
      const [comment, reviewTitle] = await Promise.all([
        resolveCommentText(admin, row),
        resolveReviewTitle(admin, row),
      ])
      return {
        title: en ? `${actor} commented on your review` : `${actor} comentó tu reseña`,
        accion: en ? 'commented on your review' : 'comentó tu reseña',
        body:  comment || (reviewTitle ? (en ? `Your review of ${reviewTitle}` : `Tu reseña de ${reviewTitle}`) : ''),
        url,
      }
    }

    case 'comment_reply': {
      // En una lista o una guía (desde 2026-10) el lugar va en `entity_*`; en
      // una reseña, en `review_id`.
      if (row.entity_type === 'list' || row.entity_type === 'guide') {
        const guia = row.entity_type === 'guide'
        const [comment, lugar] = await Promise.all([
          guia ? resolveGuideCommentText(admin, row) : resolveListCommentText(admin, row),
          guia ? Promise.resolve(resolveGuideTitle(row)) : resolveListTitle(admin, row),
        ])
        return {
          title: lugar
            ? (en ? `${actor} replied to your comment on ${lugar}` : `${actor} respondió tu comentario en ${lugar}`)
            : (en ? `${actor} replied to your comment` : `${actor} respondió tu comentario`),
          accion: en ? 'replied to your comment' : 'respondió tu comentario',
          body:  comment,
          url,
        }
      }
      const comment = await resolveCommentText(admin, row)
      return {
        title: en ? `${actor} replied to your comment` : `${actor} respondió tu comentario`,
        accion: en ? 'replied to your comment' : 'respondió tu comentario',
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
        title: en ? `${actor} mentioned you` : `${actor} te mencionó`,
        accion: en ? 'mentioned you' : 'te mencionó',
        body:  comment || (reviewTitle ? (en ? `In their review of ${reviewTitle}` : `En su reseña de ${reviewTitle}`) : ''),
        url,
      }
    }

    case 'level_up': {
      // El nivel viaja en review_title (así lo inserta add_points) o en entity_title.
      const level = row.entity_title?.trim() || row.review_title?.trim() || ''
      return {
        title: en ? 'You leveled up!' : '¡Subiste de nivel!',
        body:  level ? (en ? `You're now ${nivelEn(level)}` : `Ahora sos ${level}`) : '',
        url,
      }
    }

    case 'list_like':
      return {
        title: en ? `${actor} liked your list` : `A ${actor} le gustó tu lista`,
        accion: en ? 'liked your list' : 'le gustó tu lista',
        body:  await resolveListTitle(admin, row),
        url,
      }

    case 'list_comment': {
      // Antes buscaba el comentario en `review_comments` (tabla equivocada:
      // nunca lo encontraba) y caía al nombre de lista que mandaba el cliente.
      const [comment, listTitle] = await Promise.all([
        resolveListCommentText(admin, row),
        resolveListTitle(admin, row),
      ])
      return {
        title: en ? `${actor} commented on your list` : `${actor} comentó tu lista`,
        accion: en ? 'commented on your list' : 'comentó tu lista',
        body:  comment || listTitle,
        url,
      }
    }

    case 'actor_birthday': {
      const who = row.entity_title?.trim() || (en ? 'Someone you follow' : 'Alguien que seguís')
      return {
        title: en ? `🎂 It's ${who}'s birthday` : `🎂 ${who} cumple años`,
        body:  '',
        url,
      }
    }

    case 'new_release': {
      const d = datosDe(row)
      // Las filas de antes de 2026-10 no tienen `datos`: traen la frase
      // armada en castellano en `entity_title` ("Nueva de X: título").
      if (!d.titulo_es) {
        return { title: en ? 'New release' : 'Nuevo estreno', body: row.entity_title?.trim() || '', url }
      }
      const titulo = (en && d.titulo_en) || d.titulo_es
      return { title: en ? `Out now: ${titulo}` : `Estreno: ${titulo}`, body: conQuien(d, en), url }
    }

    case 'famoso_proyecto': {
      const d = datosDe(row)
      const persona = d.persona || (en ? 'Someone you follow' : 'Alguien que seguís')
      return {
        title: en ? `New project from ${persona}` : `Proyecto nuevo de ${persona}`,
        body:  (en && d.titulo_en) || d.titulo_es || row.entity_title?.trim() || '',
        url,
      }
    }

    case 'famoso_disponible':
    case 'watchlist_disponible': {
      const d = datosDe(row)
      const titulo = (en && d.titulo_en) || d.titulo_es || ''
      const plataforma = d.plataforma || (en ? 'your platforms' : 'tus plataformas')
      return {
        title: en ? `Now on ${plataforma}: ${titulo}` : `Ya está en ${plataforma}: ${titulo}`,
        body:  type === 'watchlist_disponible'
          ? (en ? 'From your watchlist' : 'Lo tenías en "Ver después"')
          : conQuien(d, en),
        url,
      }
    }

    default:
      return null
  }
}
