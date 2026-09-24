import type { SupabaseClient } from '@supabase/supabase-js'
import type { NotificationRow } from '@/lib/notification-content'

/**
 * ¿Pasó de verdad lo que dice esta notificación?
 *
 * La web y la app crean las notificaciones desde el cliente, así que una fila
 * de `notifications` es sólo lo que alguien dijo que pasó. La política de
 * INSERT (`supabase-notifications-insert-2026-09.sql`) garantiza que el
 * `actor_id` sea quien la insertó, pero no que haya hecho la acción: cualquiera
 * podía hacerle llegar a otro "Fulano te empezó a seguir" sin seguirlo, siendo
 * él Fulano. Antes de mandar un push, `/api/push/on-notification` confirma acá
 * que la acción existe y que el destinatario es a quien le corresponde (el
 * dueño de la reseña, de la lista, del comentario respondido, el mencionado).
 *
 * Todo se lee con la service role, de la base: nada de lo que viene en la fila
 * se toma por cierto salvo los ids que hay que verificar.
 *
 * El webhook corre después del INSERT de la notificación, y todos los clientes
 * guardan la acción (el follow, el like, el comentario) antes de crearla, así
 * que cuando se consulta ya está.
 *
 * Ojo con el alcance: esto decide si sale el push, no si la fila existe. Una
 * notificación que no pasa igual queda en la campanita. Para sacarla de ahí
 * hace falta hacer lo mismo en la base, antes del INSERT.
 */

export type Verificacion =
  | { ok: true }
  | { ok: false; motivo: string }

const OK: Verificacion = { ok: true }
const no = (motivo: string): Verificacion => ({ ok: false, motivo })

/** Tipos que se crean sin actor de usuario, sólo desde la base o el cron. */
const TIPOS_DE_SISTEMA = new Set(['level_up', 'actor_birthday', 'new_release'])

async function existe(
  consulta: PromiseLike<{ count: number | null; error: { message: string } | null }>
): Promise<boolean> {
  const { count, error } = await consulta
  if (error) throw new Error(error.message)
  return (count ?? 0) > 0
}

async function duenioDeResena(admin: SupabaseClient, reviewId: string): Promise<string | null> {
  const { data, error } = await admin.from('reviews').select('user_id').eq('id', reviewId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { user_id: string } | null)?.user_id ?? null
}

async function duenioDeLista(admin: SupabaseClient, listId: string): Promise<string | null> {
  const { data, error } = await admin.from('lists').select('user_id').eq('id', listId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { user_id: string } | null)?.user_id ?? null
}

async function usernameDe(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from('profiles').select('username').eq('id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { username: string | null } | null)?.username ?? null
}

/** Para ILIKE: el usuario sólo tiene letras, números y `_`, pero `_` es comodín. */
const escaparLike = (s: string) => s.replace(/[\\%_]/g, c => `\\${c}`)

/**
 * `OK` si la notificación corresponde a algo que pasó, o el motivo por el que
 * no. Si la base falla, tira: quien llama decide (el webhook no manda el push).
 */
export async function verificarNotificacion(
  admin: SupabaseClient,
  type: string,
  row: NotificationRow,
): Promise<Verificacion> {
  // Los de sistema no los puede crear un cliente (política de INSERT); los
  // crean `add_points` y el cron. No hay acción de usuario que verificar.
  if (TIPOS_DE_SISTEMA.has(type)) return OK

  const actor = row.actor_id
  const destino = row.user_id
  if (!actor || !destino) return no('sin actor o sin destinatario')

  switch (type) {
    case 'follow': {
      const sigue = await existe(
        admin.from('follows').select('*', { count: 'exact', head: true })
          .eq('follower_id', actor).eq('following_id', destino),
      )
      return sigue ? OK : no('no lo sigue')
    }

    case 'review_like': {
      if (!row.review_id) return no('sin review_id')
      if (await duenioDeResena(admin, row.review_id) !== destino) return no('la reseña no es del destinatario')
      const likeo = await existe(
        admin.from('review_likes').select('*', { count: 'exact', head: true })
          .eq('review_id', row.review_id).eq('user_id', actor),
      )
      return likeo ? OK : no('no hay like')
    }

    case 'review_comment': {
      if (!row.review_id) return no('sin review_id')
      if (await duenioDeResena(admin, row.review_id) !== destino) return no('la reseña no es del destinatario')
      const comento = await existe(
        admin.from('review_comments').select('*', { count: 'exact', head: true })
          .eq('review_id', row.review_id).eq('user_id', actor),
      )
      return comento ? OK : no('no hay comentario')
    }

    case 'comment_reply': {
      if (!row.review_id) return no('sin review_id')
      // La web manda en `comment_id` el comentario respondido, que tiene que
      // ser del destinatario; y el actor tiene que haberle respondido.
      if (row.comment_id) {
        const { data, error } = await admin.from('review_comments')
          .select('user_id, review_id').eq('id', row.comment_id).maybeSingle()
        if (error) throw new Error(error.message)
        const padre = data as { user_id: string; review_id: string } | null
        if (!padre || padre.user_id !== destino || padre.review_id !== row.review_id) {
          return no('el comentario respondido no es del destinatario')
        }
        const respondio = await existe(
          admin.from('review_comments').select('*', { count: 'exact', head: true })
            .eq('review_id', row.review_id).eq('user_id', actor).eq('parent_id', row.comment_id),
        )
        return respondio ? OK : no('no hay respuesta')
      }
      // Sin `comment_id`: alguna respuesta del actor a un comentario del destinatario en esa reseña.
      const { data, error } = await admin.from('review_comments')
        .select('id').eq('review_id', row.review_id).eq('user_id', destino)
      if (error) throw new Error(error.message)
      const ids = (data as { id: string }[]).map(c => c.id)
      if (ids.length === 0) return no('el destinatario no comentó esa reseña')
      const respondio = await existe(
        admin.from('review_comments').select('*', { count: 'exact', head: true })
          .eq('review_id', row.review_id).eq('user_id', actor).in('parent_id', ids),
      )
      return respondio ? OK : no('no hay respuesta')
    }

    case 'mention': {
      if (!row.review_id) return no('sin review_id')
      const username = await usernameDe(admin, destino)
      if (!username) return no('el destinatario no tiene usuario')
      const patron = `%@${escaparLike(username)}%`
      // La mención puede estar en la reseña del actor o en un comentario suyo en esa reseña.
      const [enResena, enComentario] = await Promise.all([
        existe(
          admin.from('reviews').select('*', { count: 'exact', head: true })
            .eq('id', row.review_id).eq('user_id', actor).ilike('body', patron),
        ),
        existe(
          admin.from('review_comments').select('*', { count: 'exact', head: true })
            .eq('review_id', row.review_id).eq('user_id', actor).ilike('content', patron),
        ),
      ])
      return enResena || enComentario ? OK : no('no lo menciona')
    }

    case 'list_like': {
      if (!row.entity_id) return no('sin entity_id')
      if (await duenioDeLista(admin, row.entity_id) !== destino) return no('la lista no es del destinatario')
      const likeo = await existe(
        admin.from('list_likes').select('*', { count: 'exact', head: true })
          .eq('list_id', row.entity_id).eq('user_id', actor),
      )
      return likeo ? OK : no('no hay like')
    }

    case 'list_comment': {
      if (!row.entity_id) return no('sin entity_id')
      if (await duenioDeLista(admin, row.entity_id) !== destino) return no('la lista no es del destinatario')
      const comento = await existe(
        admin.from('list_comments').select('*', { count: 'exact', head: true })
          .eq('list_id', row.entity_id).eq('user_id', actor),
      )
      return comento ? OK : no('no hay comentario')
    }

    default:
      // Tipos sin texto de push (list_duplicate, nombres viejos): el webhook no
      // los manda igual. No hay nada que verificar.
      return OK
  }
}
