import { createServerClient } from '@/lib/supabase-server'
import { getAdminClient } from '@/lib/service-role'
import { getMovieDetails, getTVDetails } from '@/lib/tmdb'
import type { ShareCalificacion, ShareLista, ShareMedia, ShareReview, ShareTop5 } from '@/lib/share-image'

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

// ── Compartir (octubre de 2026): calificación, lista y top 5 ─────────────────

/**
 * La calificación de quien pide, para "Compartí tu calificación". Las
 * calificaciones sólo las lee su dueño, así que siempre va con su sesión y la
 * imagen no se cachea. Si escribió una reseña sin spoilers, va la frase.
 */
export async function loadShareCalificacion(
  viewerId: string,
  kind: 'movie' | 'tv',
  id: number
): Promise<ShareCalificacion | null> {
  const admin = getAdminClient()
  const [{ data: nota }, { data: resena }, { data: autor }] = await Promise.all([
    admin.from('ratings').select('rating').eq('user_id', viewerId).eq('media_type', kind).eq('media_id', id)
      .maybeSingle<{ rating: number | string | null }>(),
    admin.from('reviews').select('body, has_spoiler').eq('user_id', viewerId).eq('media_type', kind).eq('media_id', id)
      .maybeSingle<{ body: string | null; has_spoiler: boolean | null }>(),
    admin.from('profiles').select('username, avatar_url').eq('id', viewerId)
      .maybeSingle<{ username: string; avatar_url: string | null }>(),
  ])
  const rating = Number(nota?.rating ?? 0)
  if (!rating || !autor?.username) return null
  const media = await loadShareMedia(kind, id)
  if (!media) return null
  return {
    media,
    rating,
    body: resena && !resena.has_spoiler ? resena.body : null,
    username: autor.username,
    avatarUrl: autor.avatar_url,
  }
}

/**
 * Una lista, para "Compartir lista". Pública: como visitante, y se cachea. Si
 * es privada, sólo la puede pedir su dueño (`privada`, sin caché).
 */
export async function loadShareLista(
  id: string,
  getViewerId: () => Promise<string | null>
): Promise<{ lista: ShareLista; privada: boolean } | null> {
  type ListaRow = { user_id: string; title: string; is_public: boolean | null }
  const supabase = createServerClient()
  let privada = false
  let { data: lista } = await supabase.from('lists').select('user_id, title, is_public').eq('id', id).maybeSingle<ListaRow>()
  let lector: ReturnType<typeof createServerClient> | ReturnType<typeof getAdminClient> = supabase

  if (!lista || !lista.is_public) {
    const viewerId = await getViewerId()
    if (!viewerId) return null
    const admin = getAdminClient()
    ;({ data: lista } = await admin.from('lists').select('user_id, title, is_public').eq('id', id).maybeSingle<ListaRow>())
    if (!lista || lista.user_id !== viewerId) return null
    lector = admin
    privada = true
  }

  const [{ data: items, count }, { data: autor }] = await Promise.all([
    lector.from('list_items').select('poster_path', { count: 'exact' }).eq('list_id', id)
      .order('position', { ascending: true }).limit(6),
    lector.from('profiles').select('username, avatar_url').eq('id', lista.user_id)
      .maybeSingle<{ username: string; avatar_url: string | null }>(),
  ])
  if (!autor?.username) return null
  return {
    privada,
    lista: {
      title: lista.title,
      username: autor.username,
      avatarUrl: autor.avatar_url,
      total: count ?? items?.length ?? 0,
      posters: ((items ?? []) as { poster_path: string | null }[]).map(i => i.poster_path),
    },
  }
}

/**
 * "Mi top 5" de quien pide: primero sus favoritas fijadas del perfil (hay 4
 * lugares), y se completa con lo que calificó más alto. Con su sesión, sin
 * caché. `null` si no tiene ni una.
 */
export async function loadShareTop5(viewerId: string): Promise<ShareTop5 | null> {
  const admin = getAdminClient()
  const [{ data: fijadas }, { data: notas }, { data: autor }] = await Promise.all([
    admin.from('pinned_favorites').select('media_id, media_type, poster_path, slot').eq('user_id', viewerId)
      .order('slot', { ascending: true }),
    admin.from('ratings').select('media_id, media_type, poster_path, rating, rated_at').eq('user_id', viewerId)
      .gte('rating', 4).order('rating', { ascending: false }).order('rated_at', { ascending: false }).limit(20),
    admin.from('profiles').select('username, avatar_url').eq('id', viewerId)
      .maybeSingle<{ username: string; avatar_url: string | null }>(),
  ])
  if (!autor?.username) return null

  type Fila = { media_id: number; media_type: string; poster_path: string | null }
  const vistos = new Set<string>()
  const posters: (string | null)[] = []
  for (const f of [...((fijadas ?? []) as Fila[]), ...((notas ?? []) as Fila[])]) {
    const clave = `${f.media_type}:${f.media_id}`
    if (vistos.has(clave) || !f.poster_path) continue
    vistos.add(clave)
    posters.push(f.poster_path)
    if (posters.length === 5) break
  }
  if (posters.length === 0) return null
  return { username: autor.username, avatarUrl: autor.avatar_url, posters }
}
