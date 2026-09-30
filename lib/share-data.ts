import { createServerClient } from '@/lib/supabase-server'
import { getAdminClient } from '@/lib/service-role'
import { getMovieDetails, getTVDetails } from '@/lib/tmdb'
import type { ShareMedia, ShareReview } from '@/lib/share-image'

/**
 * Datos para las imágenes de compartir (lib/share-image.tsx).
 *
 * Se lee como visitante (lib/supabase-server usa la anon key): una reseña que
 * no se ve en el sitio tampoco se puede dibujar. La única excepción es quien la
 * escribió, que puede compartir la suya aunque tenga "Ocultar actividad".
 */

export async function loadShareMedia(kind: 'movie' | 'tv', id: number): Promise<ShareMedia | null> {
  try {
    const d = kind === 'movie' ? await getMovieDetails(id) : await getTVDetails(id)
    const date: string | undefined = kind === 'movie' ? d.release_date : d.first_air_date
    return {
      kind,
      title: (kind === 'movie' ? d.title : d.name) ?? '',
      year: date ? date.slice(0, 4) : null,
      posterPath: d.poster_path ?? null,
      backdropPath: d.backdrop_path ?? null,
      tmdbScore: d.vote_count > 0 && d.vote_average > 0 ? d.vote_average : null,
    }
  } catch {
    return null
  }
}

type ReviewRow = {
  user_id: string
  media_id: number | string
  media_type: string
  rating: number | string | null
  body: string | null
  has_spoiler: boolean | null
}
type AuthorRow = { username: string; avatar_url: string | null; hide_activity: boolean | null }

const REVIEW_COLS = 'user_id, media_id, media_type, rating, body, has_spoiler'
const AUTHOR_COLS = 'username, avatar_url, hide_activity'

/**
 * La reseña lista para dibujar, o `null` si no existe o quien pide no la puede
 * ver. `privada` es `true` cuando sólo se pudo leer por ser el autor: esa
 * imagen no se cachea en la CDN.
 *
 * `getViewerId` se llama sólo si la reseña está oculta para visitantes: en el
 * caso normal no hace falta saber quién pide.
 */
export async function loadShareReview(
  id: string,
  getViewerId: () => Promise<string | null>
): Promise<{ review: ShareReview; privada: boolean } | null> {
  const supabase = createServerClient()

  let privada = false
  let { data: row } = await supabase.from('reviews').select(REVIEW_COLS).eq('id', id).maybeSingle<ReviewRow>()
  let author: AuthorRow | null = null
  if (row) {
    ;({ data: author } = await supabase.from('profiles').select(AUTHOR_COLS).eq('id', row.user_id).maybeSingle<AuthorRow>())
  }

  // Oculta para visitantes: sólo el autor sigue, y leyendo con la service role.
  if (!row || !author || author.hide_activity) {
    const viewerId = await getViewerId()
    if (!viewerId) return null
    const admin = getAdminClient()
    ;({ data: row } = await admin.from('reviews').select(REVIEW_COLS).eq('id', id).maybeSingle<ReviewRow>())
    if (!row || row.user_id !== viewerId) return null
    ;({ data: author } = await admin.from('profiles').select(AUTHOR_COLS).eq('id', viewerId).maybeSingle<AuthorRow>())
    if (!author) return null
    privada = true
  }

  const media = await loadShareMedia(row.media_type === 'tv' ? 'tv' : 'movie', Number(row.media_id))
  if (!media) return null

  return {
    privada,
    review: {
      media,
      rating: row.rating === null ? null : Number(row.rating),
      body: row.body,
      hasSpoiler: row.has_spoiler === true,
      username: author.username,
      avatarUrl: author.avatar_url,
    },
  }
}
