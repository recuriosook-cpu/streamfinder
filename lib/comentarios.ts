import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Lo común a los comentarios de reseñas, listas y guías (desde 2026-10).
 *
 * Las tres tablas tienen la misma forma (`review_comments`, `list_comments`,
 * `guide_comments`: id, user_id, parent_id, content, created_at) y cambia sólo
 * la columna de a qué se comenta. Las respuestas son de un solo nivel: si se le
 * responde a una respuesta, la base la cuelga del comentario de arriba (ver
 * `supabase-comentarios-guias-2026-10.sql`).
 *
 * Los me gusta de los tres van a `comment_likes`, con el tipo al lado del id.
 * Los reportes, a `content_reports` con el `content_type` de `TIPO_REPORTE`.
 */

export type TipoComentario = 'review' | 'list' | 'guide'

export const TABLA_COMENTARIOS: Record<TipoComentario, 'review_comments' | 'list_comments' | 'guide_comments'> = {
  review: 'review_comments',
  list: 'list_comments',
  guide: 'guide_comments',
}

export const COLUMNA_DESTINO: Record<TipoComentario, 'review_id' | 'list_id' | 'guide_slug'> = {
  review: 'review_id',
  list: 'list_id',
  guide: 'guide_slug',
}

/** El `content_type` de `content_reports`. El de reseña quedó como `comment`. */
export const TIPO_REPORTE: Record<TipoComentario, 'comment' | 'list_comment' | 'guide_comment'> = {
  review: 'comment',
  list: 'list_comment',
  guide: 'guide_comment',
}

/**
 * Los me gusta de los comentarios que se están viendo: cuántos tiene cada uno
 * y cuáles son míos. Se piden de nuevo cuando cambia la lista de ids (llegó un
 * comentario, se borró otro): son pocas filas.
 *
 * `alternar` es optimista y vuelve atrás si la base lo rechaza.
 */
export function useMeGustaComentarios(tipo: TipoComentario, ids: string[], userId: string | null) {
  const [supabase] = useState(createClient)
  const [cuenta, setCuenta] = useState<Record<string, number>>({})
  const [mios, setMios] = useState<Set<string>>(new Set())
  const ocupados = useRef(new Set<string>())
  const clave = [...ids].sort().join(',')

  useEffect(() => {
    if (!clave) return
    let vivo = true
    supabase
      .from('comment_likes')
      .select('comment_id, user_id')
      .eq('comment_type', tipo)
      .in('comment_id', clave.split(','))
      .then(({ data, error }) => {
        if (!vivo) return
        if (error) {
          console.error('[comentarios] me gusta:', error.message)
          return
        }
        const filas = (data ?? []) as { comment_id: string; user_id: string }[]
        const nueva: Record<string, number> = {}
        for (const f of filas) nueva[f.comment_id] = (nueva[f.comment_id] ?? 0) + 1
        setCuenta(nueva)
        setMios(new Set(filas.filter(f => f.user_id === userId).map(f => f.comment_id)))
      })
    return () => { vivo = false }
  }, [supabase, tipo, clave, userId])

  const alternar = useCallback(async (commentId: string) => {
    if (!userId || ocupados.current.has(commentId)) return
    ocupados.current.add(commentId)
    const tenia = mios.has(commentId)
    const aplicar = (dar: boolean) => {
      setMios(prev => {
        const s = new Set(prev)
        if (dar) s.add(commentId)
        else s.delete(commentId)
        return s
      })
      setCuenta(prev => ({ ...prev, [commentId]: Math.max(0, (prev[commentId] ?? 0) + (dar ? 1 : -1)) }))
    }
    aplicar(!tenia)
    const { error } = tenia
      ? await supabase.from('comment_likes').delete()
          .eq('comment_type', tipo).eq('comment_id', commentId).eq('user_id', userId)
      : await supabase.from('comment_likes').insert({ comment_type: tipo, comment_id: commentId, user_id: userId })
    if (error) {
      console.error('[comentarios] me gusta:', error.message)
      aplicar(tenia)
    }
    ocupados.current.delete(commentId)
  }, [supabase, tipo, userId, mios])

  return { cuenta, mios, alternar }
}
