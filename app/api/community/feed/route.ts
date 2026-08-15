import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CORS_HEADERS,
  corsPreflight,
  getFollowingIds,
  getProfilesById,
  getSupabase,
  jsonError,
  privateCache,
  readPaging,
  requireUserId,
  type CommunityProfile,
} from '@/lib/community-api'

/**
 * Feed de comunidad para la app nativa.
 *
 * Junta lo que hicieron los usuarios que seguís en un solo stream ordenado por
 * fecha, igual que `app/comunidad/page.tsx` de la web, pero armado del lado del
 * servidor: la web dispara 6 consultas en paralelo desde el navegador y acá eso
 * sería 6 round-trips desde el teléfono.
 *
 * OJO con lo que RLS deja pasar (el proxy lee con la anon key, no saltea las
 * policies):
 *
 *   - `reviews`, `watchlist` y `lists` son de lectura pública → llegan.
 *   - `ratings` y `notifications` son de lectura sólo para su dueño → los tipos
 *     `rating` y `level_up` van a venir SIEMPRE vacíos hasta que se agregue una
 *     policy pública. Vale la pena saberlo: en la web pasa exactamente lo
 *     mismo, sólo que ahí no se nota porque el array vacío se mezcla con el
 *     resto. El código queda listo para cuando la policy exista.
 */

export const OPTIONS = corsPreflight

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

/** Cuántos ítems devuelve una página por defecto. */
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

/**
 * Votos mínimos en TMDB para que una película entre como recomendación.
 *
 * 500, exactamente el mismo valor que usa `loadRecommendations` en
 * `app/comunidad/page.tsx`. Con `sort_by=vote_average.desc` el filtro no es un
 * detalle: sin él, el top serían títulos con 3 votos y un 10 de promedio.
 *
 * Es el único `vote_count` que toca el feed. Las tablas de Supabase que arman
 * el resto del stream (reviews, watchlist, lists) no tienen esa columna.
 */
const RECOMMENDATION_MIN_VOTES = 500

/** Cuántas recomendaciones se traen por carga. Igual que la web. */
const RECOMMENDATION_COUNT = 8

/**
 * Cada cuántos ítems del feed se intercala una recomendación.
 *
 * La web las inyecta cada 4 después de mezclar. Se replica acá para que el
 * ritmo del feed sea el mismo en los dos lados.
 */
const RECOMMENDATION_EVERY = 4

/** Nombre de género (como lo guarda `profiles.favorite_genres`) → id de TMDB. */
const GENRE_TO_ID: Record<string, number> = {
  'Acción': 28, 'Comedia': 35, 'Drama': 18, 'Terror': 27,
  'Ciencia ficción': 878, 'Thriller': 53, 'Animación': 16,
  'Romance': 10749, 'Documental': 99, 'Aventura': 12,
  'Fantasía': 14, 'Misterio': 9648, 'Historia': 36,
  'Crimen': 80, 'Musical': 10402, 'Western': 37, 'Guerra': 10752,
  'Familia': 10751,
}

/**
 * Techo por fuente antes de mezclar.
 *
 * El feed no tiene cursor: se traen las ventanas más recientes de cada tabla,
 * se mezclan y se corta la página pedida. Es lo que hace la web y alcanza
 * porque nadie pagina 200 ítems hacia atrás en un feed social; pasada esa
 * profundidad, la respuesta se queda sin ítems y la app deja de pedir.
 */
const SOURCE_LIMIT = 60

/** Un minuto, como pide el brief. Privada: el feed depende de a quién seguís. */
const CACHE_SECONDS = 60

type FeedMode = 'all' | 'reviews' | 'lists' | 'activity'

const MODES: FeedMode[] = ['all', 'reviews', 'lists', 'activity']

/** Los tipos que tienen autor y fecha, o sea los que ordenan el stream. */
export type AuthoredItemType =
  | 'review'
  | 'rating'
  | 'watchlist'
  | 'list_created'
  | 'level_up'

export type FeedItemType = AuthoredItemType | 'recommendation'

interface BaseItem {
  /** Clave estable para el `keyExtractor` de la lista. */
  key: string
  type: AuthoredItemType
  userId: string
  /** ISO por el que se ordena todo el stream. */
  sortTime: string
}

export interface ReviewItem extends BaseItem {
  type: 'review'
  reviewId: string
  mediaId: number
  mediaType: 'movie' | 'tv'
  mediaTitle: string
  mediaPosterPath: string | null
  rating: number | null
  body: string | null
  hasSpoiler: boolean
  likeCount: number
  likedByMe: boolean
}

export interface RatingItem extends BaseItem {
  type: 'rating'
  mediaId: number
  mediaType: 'movie' | 'tv'
  mediaTitle: string
  mediaPosterPath: string | null
  rating: number
}

export interface WatchlistItem extends BaseItem {
  type: 'watchlist'
  mediaId: number
  mediaType: 'movie' | 'tv'
  mediaTitle: string
  mediaPosterPath: string | null
}

export interface ListItem extends BaseItem {
  type: 'list_created'
  listId: string
  listTitle: string
  listDescription: string | null
  previews: (string | null)[]
  itemCount: number
}

export interface LevelUpItem extends BaseItem {
  type: 'level_up'
  levelName: string
}

/**
 * Sugerencia de TMDB intercalada en el feed.
 *
 * No tiene autor ni fecha, así que no hereda `BaseItem`: no participa del orden
 * cronológico, se inserta después de ordenar.
 */
export interface RecommendationItem {
  key: string
  type: 'recommendation'
  movieId: number
  title: string
  year: string
  posterPath: string | null
  backdropPath: string | null
}

export type AuthoredItem =
  | ReviewItem
  | RatingItem
  | WatchlistItem
  | ListItem
  | LevelUpItem

export type FeedItem = AuthoredItem | RecommendationItem

export interface CommunityFeedResponse {
  items: FeedItem[]
  /** Autores de los ítems, para no repetir el perfil en cada uno. */
  profiles: CommunityProfile[]
  page: number
  limit: number
  /** Hay al menos una página más. */
  hasMore: boolean
  /** `true` cuando el usuario no sigue a nadie: la app muestra el CTA. */
  followsNobody: boolean
}

/** Qué fuentes entra a pedir cada modo. */
function sourcesFor(mode: FeedMode) {
  return {
    reviews: mode === 'all' || mode === 'reviews',
    ratings: mode === 'all' || mode === 'activity',
    watchlist: mode === 'all' || mode === 'activity',
    lists: mode === 'all' || mode === 'lists',
    levelUps: mode === 'all' || mode === 'activity',
  }
}

async function loadReviews(
  supabase: SupabaseClient,
  followIds: string[],
  userId: string
): Promise<ReviewItem[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(
      'id, user_id, media_id, media_type, title, poster_path, rating, body, has_spoiler, created_at, review_likes(user_id)'
    )
    .in('user_id', followIds)
    .order('created_at', { ascending: false })
    .limit(SOURCE_LIMIT)

  if (error) return []

  type Row = {
    id: string
    user_id: string
    media_id: number
    media_type: 'movie' | 'tv'
    title: string
    poster_path: string | null
    rating: number | null
    body: string | null
    has_spoiler: boolean | null
    created_at: string
    review_likes: { user_id: string }[] | null
  }

  return ((data ?? []) as Row[]).map((row) => ({
    key: `review-${row.id}`,
    type: 'review' as const,
    userId: row.user_id,
    sortTime: row.created_at,
    reviewId: row.id,
    mediaId: row.media_id,
    mediaType: row.media_type,
    mediaTitle: row.title,
    mediaPosterPath: row.poster_path,
    rating: row.rating,
    body: row.body,
    hasSpoiler: row.has_spoiler ?? false,
    likeCount: row.review_likes?.length ?? 0,
    likedByMe: (row.review_likes ?? []).some((like) => like.user_id === userId),
  }))
}

async function loadRatings(
  supabase: SupabaseClient,
  followIds: string[]
): Promise<RatingItem[]> {
  const { data, error } = await supabase
    .from('ratings')
    .select('id, user_id, media_id, media_type, title, poster_path, rating, rated_at')
    // Sólo lo que le gustó: un 2 de 5 en el feed de un amigo no es una
    // recomendación, es ruido. Mismo corte que usa la web.
    .gte('rating', 3.5)
    .in('user_id', followIds)
    .order('rated_at', { ascending: false })
    .limit(SOURCE_LIMIT)

  if (error) return []

  type Row = {
    id: string
    user_id: string
    media_id: number
    media_type: 'movie' | 'tv'
    title: string
    poster_path: string | null
    rating: number
    rated_at: string
  }

  return ((data ?? []) as Row[]).map((row) => ({
    key: `rating-${row.id}`,
    type: 'rating' as const,
    userId: row.user_id,
    sortTime: row.rated_at,
    mediaId: row.media_id,
    mediaType: row.media_type,
    mediaTitle: row.title,
    mediaPosterPath: row.poster_path,
    rating: row.rating,
  }))
}

async function loadWatchlist(
  supabase: SupabaseClient,
  followIds: string[]
): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from('watchlist')
    .select('id, user_id, media_id, media_type, title, poster_path, added_at')
    .in('user_id', followIds)
    .order('added_at', { ascending: false })
    .limit(SOURCE_LIMIT)

  if (error) return []

  type Row = {
    id: string
    user_id: string
    media_id: number
    media_type: 'movie' | 'tv'
    title: string
    poster_path: string | null
    added_at: string
  }

  return ((data ?? []) as Row[]).map((row) => ({
    key: `watchlist-${row.id}`,
    type: 'watchlist' as const,
    userId: row.user_id,
    sortTime: row.added_at,
    mediaId: row.media_id,
    mediaType: row.media_type,
    mediaTitle: row.title,
    mediaPosterPath: row.poster_path,
  }))
}

async function loadLists(
  supabase: SupabaseClient,
  followIds: string[]
): Promise<ListItem[]> {
  const { data, error } = await supabase
    .from('lists')
    .select('id, user_id, title, description, created_at')
    .in('user_id', followIds)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(SOURCE_LIMIT)

  if (error) return []

  type Row = {
    id: string
    user_id: string
    title: string
    description: string | null
    created_at: string
  }

  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return []

  // Portadas y conteos en una sola consulta para todas las listas de la página.
  const { data: itemsData } = await supabase
    .from('list_items')
    .select('list_id, poster_path')
    .in(
      'list_id',
      rows.map((row) => row.id)
    )
    .order('list_id', { ascending: true })
    .order('position', { ascending: true })
    .limit(1000)

  const previews = new Map<string, (string | null)[]>()
  const counts = new Map<string, number>()

  for (const item of (itemsData ?? []) as {
    list_id: string
    poster_path: string | null
  }[]) {
    counts.set(item.list_id, (counts.get(item.list_id) ?? 0) + 1)
    const bucket = previews.get(item.list_id) ?? []
    if (bucket.length < 4) {
      bucket.push(item.poster_path)
      previews.set(item.list_id, bucket)
    }
  }

  return rows.map((row) => ({
    key: `list-${row.id}`,
    type: 'list_created' as const,
    userId: row.user_id,
    sortTime: row.created_at,
    listId: row.id,
    listTitle: row.title,
    listDescription: row.description,
    previews: previews.get(row.id) ?? [],
    itemCount: counts.get(row.id) ?? 0,
  }))
}

async function loadLevelUps(
  supabase: SupabaseClient,
  followIds: string[]
): Promise<LevelUpItem[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, review_title, created_at')
    .in('user_id', followIds)
    .eq('type', 'level_up')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return []

  type Row = {
    id: string
    user_id: string
    review_title: string | null
    created_at: string
  }

  return ((data ?? []) as Row[]).map((row) => ({
    key: `levelup-${row.id}`,
    type: 'level_up' as const,
    userId: row.user_id,
    sortTime: row.created_at,
    // La web guarda el nombre del nivel en `review_title`, que es la columna
    // genérica de texto de `notifications`.
    levelName: row.review_title ?? 'un nuevo nivel',
  }))
}

/**
 * Recomendaciones de TMDB según los géneros favoritos del usuario.
 *
 * Calcado de `loadRecommendations` de la web: mismos parámetros, mismo tope de
 * 3 géneros y mismo `vote_count.gte`. Devuelve vacío ante cualquier fallo — es
 * relleno del feed, no puede voltear la respuesta.
 */
async function loadRecommendations(
  supabase: SupabaseClient,
  userId: string
): Promise<RecommendationItem[]> {
  if (!TMDB_KEY) return []

  const { data } = await supabase
    .from('profiles')
    .select('favorite_genres')
    .eq('id', userId)
    .maybeSingle()

  const favorites =
    (data as { favorite_genres: string[] | null } | null)?.favorite_genres ?? []

  const genreIds = favorites
    .map((name) => GENRE_TO_ID[name])
    .filter(Boolean)
    .slice(0, 3)

  const genreParam =
    genreIds.length > 0 ? `&with_genres=${genreIds.join(',')}` : ''

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}` +
        `&language=es-AR&sort_by=vote_average.desc` +
        `&vote_count.gte=${RECOMMENDATION_MIN_VOTES}&page=1${genreParam}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return []

    const body = (await res.json()) as {
      results?: {
        id: number
        title: string
        release_date?: string
        poster_path: string | null
        backdrop_path: string | null
      }[]
    }

    return (body.results ?? []).slice(0, RECOMMENDATION_COUNT).map((movie) => ({
      key: `rec-${movie.id}`,
      type: 'recommendation' as const,
      movieId: movie.id,
      title: movie.title,
      year: (movie.release_date ?? '').slice(0, 4),
      posterPath: movie.poster_path,
      backdropPath: movie.backdrop_path,
    }))
  } catch {
    return []
  }
}

/**
 * Intercala una recomendación cada `RECOMMENDATION_EVERY` ítems.
 *
 * Va después de cortar la página y no antes de ordenar: las recomendaciones no
 * tienen fecha, así que no pueden participar del orden cronológico sin
 * inventarles una.
 */
function interleave(
  items: AuthoredItem[],
  recommendations: RecommendationItem[]
): FeedItem[] {
  if (recommendations.length === 0) return items

  const result: FeedItem[] = []
  let next = 0

  items.forEach((item, index) => {
    result.push(item)
    if ((index + 1) % RECOMMENDATION_EVERY === 0 && next < recommendations.length) {
      result.push(recommendations[next++])
    }
  })

  // Página muy corta como para que caiga una por la regla de cada 4: se agrega
  // una igual, si no la sección quedaría sin ninguna.
  if (items.length > 0 && items.length < RECOMMENDATION_EVERY && next === 0) {
    result.push(recommendations[0])
  }

  return result
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase()
  if (!supabase) return jsonError('Server misconfigured', 500)

  const userId = await requireUserId(req, supabase)
  if (!userId) return jsonError('Unauthorized', 401)

  const rawMode = req.nextUrl.searchParams.get('mode') ?? 'all'
  const mode: FeedMode = (MODES as string[]).includes(rawMode)
    ? (rawMode as FeedMode)
    : 'all'

  const { page, limit } = readPaging(req, DEFAULT_LIMIT, MAX_LIMIT)

  const followIds = await getFollowingIds(supabase, userId)

  if (followIds.length === 0) {
    const empty: CommunityFeedResponse = {
      items: [],
      profiles: [],
      page,
      limit,
      hasMore: false,
      followsNobody: true,
    }
    return NextResponse.json(empty, {
      headers: { ...CORS_HEADERS, ...privateCache(CACHE_SECONDS) },
    })
  }

  const want = sourcesFor(mode)

  const [reviews, ratings, watchlist, lists, levelUps] = await Promise.all([
    want.reviews ? loadReviews(supabase, followIds, userId) : [],
    want.ratings ? loadRatings(supabase, followIds) : [],
    want.watchlist ? loadWatchlist(supabase, followIds) : [],
    want.lists ? loadLists(supabase, followIds) : [],
    want.levelUps ? loadLevelUps(supabase, followIds) : [],
  ])

  const merged: AuthoredItem[] = [
    ...reviews,
    ...ratings,
    ...watchlist,
    ...lists,
    ...levelUps,
  ].sort((a, b) => b.sortTime.localeCompare(a.sortTime))

  const from = page * limit
  const pageItems = merged.slice(from, from + limit)

  // Los perfiles se piden sólo para los ítems de esta página; las
  // recomendaciones no tienen autor, así que no entran en la consulta.
  const [profiles, recommendations] = await Promise.all([
    getProfilesById(
      supabase,
      pageItems.map((item) => item.userId)
    ),
    // Sólo en el modo completo: filtrando por "reseñas" o por "listas", meter
    // sugerencias de TMDB rompería el filtro que el usuario acaba de elegir.
    mode === 'all' ? loadRecommendations(supabase, userId) : [],
  ])

  const body: CommunityFeedResponse = {
    items: interleave(pageItems, recommendations),
    profiles: [...profiles.values()],
    page,
    limit,
    hasMore: from + limit < merged.length,
    followsNobody: false,
  }

  return NextResponse.json(body, {
    headers: { ...CORS_HEADERS, ...privateCache(CACHE_SECONDS) },
  })
}
