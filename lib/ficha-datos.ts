import { cache } from 'react'
import { createServerClient } from '@/lib/supabase-server'
import { getMovieDetails, getTVDetails } from '@/lib/tmdb'
import type { NotaGlynbox, ResenaFicha, ResenasIniciales } from '@/components/ReviewsSection'

/**
 * Lo propio de Glynbox que la ficha manda ya escrito en el HTML: la nota de la
 * comunidad y las primeras reseñas. Antes lo pedía sólo el navegador y Google
 * veía una ficha igual a la de cualquier otro sitio con datos de TMDB.
 *
 * Con `cache()` de React: `generateMetadata` (la nota va en la descripción) y
 * la página lo piden una sola vez por render. La ficha queda 24 h en la CDN,
 * así que esto corre una vez por ficha y por día, no por visita; el cliente
 * igual vuelve a pedirlo al cargar, como antes.
 */

type Tipo = 'movie' | 'tv'

/** Cuántas reseñas van en el HTML. El cliente después completa hasta 10. */
export const RESENAS_EN_HTML = 5

export const notaGlynbox = cache(async (tipo: Tipo, id: number): Promise<NotaGlynbox | null> => {
  const { data, error } = await createServerClient()
    .from('ratings').select('rating').eq('media_id', id).eq('media_type', tipo)
  if (error || !data?.length) return null
  const dist: Record<number, number> = {}
  let sum = 0
  for (const r of data) {
    const star = Math.round(r.rating)
    dist[star] = (dist[star] ?? 0) + 1
    sum += r.rating
  }
  return { avg: sum / data.length, count: data.length, dist }
})

/** Las más recientes, con el mismo pedido que hace `ReviewsSection`: al completar la lista no cambia el orden. */
export const resenasIniciales = cache(async (tipo: Tipo, id: number): Promise<Omit<ResenasIniciales, 'stats'> | null> => {
  const supabase = createServerClient()
  const { data: raw, error, count } = await supabase
    .from('reviews')
    .select('*, review_likes(user_id)', { count: 'exact' })
    .eq('media_id', id)
    .eq('media_type', tipo)
    .order('created_at', { ascending: false })
    .limit(RESENAS_EN_HTML)
  if (error || !raw) return null
  const filas = raw as Omit<ResenaFicha, 'profile'>[]
  const userIds = [...new Set(filas.map(r => r.user_id))]
  const perfiles = new Map<string, ResenaFicha['profile']>()
  if (userIds.length) {
    const { data } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', userIds)
    for (const p of (data ?? []) as ResenaFicha['profile'][]) perfiles.set(p.id, p)
  }
  return {
    reviews: filas.map(r => ({ ...r, profile: perfiles.get(r.user_id) ?? { id: r.user_id, username: null, display_name: null, avatar_url: null } })),
    total: count ?? filas.length,
  }
})

/**
 * La sinopsis en castellano o, si TMDB no tiene, la de inglés. `ingles` avisa
 * para marcar el párrafo con `lang="en"`.
 */
export const sinopsis = cache(async (tipo: Tipo, id: number, enCastellano: string | null | undefined): Promise<{ texto: string; ingles: boolean } | null> => {
  if (enCastellano?.trim()) return { texto: enCastellano.trim(), ingles: false }
  try {
    const en = await (tipo === 'movie' ? getMovieDetails(id, 'en-US') : getTVDetails(id, 'en-US'))
    const texto = (en?.overview as string | undefined)?.trim()
    return texto ? { texto, ingles: true } : null
  } catch {
    return null
  }
})
