import { NextRequest, NextResponse } from 'next/server'
import {
  CORS_HEADERS,
  corsPreflight,
  getSupabase,
  getSupabaseAsUser,
  getProfilesById,
  jsonError,
  privateCache,
  readBearer,
  requireUserId,
  type CommunityProfile,
} from '@/lib/community-api'
import { enforceRateLimit } from '@/lib/rate-limit'
import { requireAdminClient } from '@/lib/service-role'
import {
  buildNotificationContent,
  notificationUrl,
  type NotificationRow,
} from '@/lib/notification-content'

/**
 * GET /api/notifications — la campanita de la app nativa.
 *
 * Devuelve las notificaciones del usuario ya redactadas: título, cuerpo y la
 * ruta a la que lleva cada una. La app sólo dibuja y navega.
 *
 * ── Por qué esto existe en vez de que la app lea Supabase directo ──────────
 *
 * Porque el mapeo "tipo de notificación → texto y destino" es una tabla de
 * decisiones que ya estaba escrita tres veces (el push, el `handleNotifClick`
 * del Navbar, y su propio JSX), y una cuarta copia en la app garantizaba que
 * tarde o temprano una push y la campanita llevaran a lugares distintos. De
 * hecho ya pasaba entre las dos que existían.
 *
 * Ahora esa tabla vive sólo en `lib/notification-content.ts` y este endpoint la
 * expone. Es el mismo motivo por el que existe `/api/community/feed`: armar del
 * lado del servidor lo que si no serían varios round-trips desde el teléfono.
 *
 * ── Quién puede leer qué ───────────────────────────────────────────────────
 *
 * Las filas se leen con el **token del usuario**, no con la service role. La
 * policy de `notifications` es `SELECT USING (auth.uid() = user_id)`, así que
 * es Postgres el que garantiza que nadie vea las de otro — y no un `.eq()` que
 * alguien podría borrar sin querer en un refactor.
 *
 * La service role se usa sólo para *redactar*: resolver el nombre del actor, el
 * texto del comentario, el título de la reseña. Nunca para elegir qué filas.
 */

export const runtime = 'nodejs'

export const OPTIONS = corsPreflight

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

/**
 * Cache privada y corta.
 *
 * Treinta segundos: una notificación que tarda medio minuto en aparecer no
 * molesta a nadie, y evita que abrir y cerrar la pantalla pegue de nuevo.
 * `private` es obligatorio — el CDN cachea por URL y esta respuesta depende de
 * quién pregunta.
 */
const CACHE_SECONDS = 30

export interface NotificationItem {
  id: string
  type: string
  read: boolean
  createdAt: string
  /** Ya redactado por el servidor. */
  title: string
  body: string
  /** Ruta de glynbox.com. La app la resuelve con su parser de deep links. */
  url: string
  /** `null` en las de sistema: actor_birthday y new_release no tienen actor. */
  actorId: string | null
}

export interface NotificationsResponse {
  items: NotificationItem[]
  /** Los autores, para no repetir el perfil en cada item. */
  profiles: CommunityProfile[]
  unreadCount: number
  hasMore: boolean
}

/** Lo que se pide de la tabla. */
const COLUMNS =
  'id, user_id, type, read, created_at, actor_id, review_id, review_title, comment_id, entity_id, entity_type, entity_title'

/** Una fila tal como vuelve de la tabla: `NotificationRow` más `read`. */
type Row = NotificationRow & { read?: boolean | null }

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, CORS_HEADERS)
  if (limited) return limited

  const anon = getSupabase()
  if (!anon) return jsonError('Server misconfigured', 500)

  const userId = await requireUserId(req, anon)
  if (!userId) return jsonError('Unauthorized', 401)

  const token = readBearer(req)
  const asUser = token ? getSupabaseAsUser(token) : null
  if (!asUser) return jsonError('Unauthorized', 401)

  const rawLimit = Number.parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10)
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT

  // Se pide una fila de más para saber si hay página siguiente sin contar todo.
  const { data, error } = await asUser
    .from('notifications')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (error) {
    console.error('[notifications] lectura:', error.message)
    return jsonError('No se pudieron leer las notificaciones', 500)
  }

  const all = (data ?? []) as Row[]
  const hasMore = all.length > limit
  const rows = hasMore ? all.slice(0, limit) : all

  // El contador va aparte y sobre TODAS las no leídas, no sólo las de esta
  // página: es un `count` sin filas, así que da igual que haya 3 o 3000.
  const { count: unreadRaw } = await asUser
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)

  const unreadCount = unreadRaw ?? 0

  if (rows.length === 0) {
    const empty: NotificationsResponse = {
      items: [],
      profiles: [],
      unreadCount,
      hasMore: false,
    }
    return NextResponse.json(empty, {
      headers: { ...CORS_HEADERS, ...privateCache(CACHE_SECONDS) },
    })
  }

  const { admin, failure } = requireAdminClient('notifications')

  /**
   * Sin service role igual se contesta, con el texto degradado.
   *
   * `buildNotificationContent` necesita el admin para resolver nombres y
   * títulos. Si no está, se cae al destino —que es puro y no necesita leer
   * nada— y a un texto genérico. Una campanita que dice poco es mucho mejor que
   * un 500: la persona igual puede tocar y llegar a donde va.
   */
  function fallbackItem(row: Row): NotificationItem {
    const type = String(row.type ?? '').trim().toLowerCase()
    return {
      id: String(row.id),
      type,
      read: row.read === true,
      createdAt: String(row.created_at ?? ''),
      title: 'Tenés una novedad',
      body: '',
      url: notificationUrl(type, row, null),
      actorId: row.actor_id ?? null,
    }
  }

  let items: NotificationItem[]

  if (failure) {
    console.warn('[notifications] sin service role: se devuelve texto degradado')
    items = rows.map(fallbackItem)
  } else {
    // En paralelo y no en serie: cada fila puede costar hasta dos lecturas (el
    // perfil del actor, el texto del comentario) y en serie 20 filas serían 40
    // viajes encadenados a Postgres.
    items = await Promise.all(
      rows.map(async (row) => {
        const type = String(row.type ?? '').trim().toLowerCase()

        try {
          const content = await buildNotificationContent(admin, type, row)

          // Un tipo desconocido no descarta la fila: se muestra con texto
          // neutro. Descartarla dejaría un hueco silencioso justo cuando
          // alguien agrega un tipo nuevo y se olvida del texto.
          if (!content) return fallbackItem(row)

          return {
            id: String(row.id),
            type,
            read: row.read === true,
            createdAt: String(row.created_at ?? ''),
            title: content.title,
            body: content.body,
            url: content.url,
            actorId: row.actor_id ?? null,
          }
        } catch (err: unknown) {
          // Una fila que no se pudo redactar no puede voltear la pantalla
          // entera: se degrada esa sola y las demás salen bien.
          console.error('[notifications] redacción:', (err as Error).message)
          return fallbackItem(row)
        }
      })
    )
  }

  // Los perfiles de los actores, en una sola consulta. `actor_id` viene null en
  // actor_birthday y new_release, así que se filtran antes de preguntar.
  const actorIds = items
    .map((item) => item.actorId)
    .filter((id): id is string => Boolean(id))

  const profiles = await getProfilesById(anon, actorIds)

  const body: NotificationsResponse = {
    items,
    profiles: [...profiles.values()],
    unreadCount,
    hasMore,
  }

  return NextResponse.json(body, {
    headers: { ...CORS_HEADERS, ...privateCache(CACHE_SECONDS) },
  })
}
