/**
 * Tipo de notificación → a dónde lleva. La mitad pura de
 * `notification-content.ts`: no lee nada ni importa nada del servidor, así que
 * la puede usar un client component como el Navbar. La otra mitad (el texto)
 * lee la base y los archivos de las guías, y sólo corre en el servidor.
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
  /** Los avisos del cron de famosos y disponibilidad (desde 2026-10): ver `DatosAviso`. */
  datos?: unknown
}

/** La ficha de un aviso de película o serie. */
function fichaUrl(row: NotificationRow): string {
  if (!row.entity_id) return '/'
  return `/${row.entity_type === 'tv' ? 'tv' : 'movie'}/${row.entity_id}`
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
    case 'comment_reply':
      // Las respuestas en listas y guías llevan la lista o la guía en
      // `entity_*`; las de reseñas, la reseña en `review_id`.
      if (row.entity_type === 'list') return listUrl
      if (row.entity_type === 'guide') return row.entity_id ? `/guias/${row.entity_id}` : '/guias'
      return reviewUrl
    case 'review_like':
    case 'review_comment':
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
    case 'famoso_proyecto':
    case 'famoso_disponible':
    case 'watchlist_disponible':
      return fichaUrl(row)
    default:
      return '/comunidad'
  }
}
