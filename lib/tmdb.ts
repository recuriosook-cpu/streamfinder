const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p'

export const getPosterUrl = (path: string | null | undefined, size = 'w342') =>
  path ? `${IMAGE_BASE}/${size}${path}` : '/no-poster.svg'

export const getBackdropUrl = (path: string | null, size = 'w1280') =>
  path ? `${IMAGE_BASE}/${size}${path}` : null

/**
 * El título original, sólo si es distinto del que se muestra.
 *
 * TMDB lo devuelve siempre (`original_title` / `original_name`), también
 * cuando coincide con el traducido. Se compara sin mayúsculas ni espacios de
 * más para que "Up" contra "UP" no aparezca como un título distinto.
 */
export function originalTitleIfDifferent(
  shown: string | null | undefined,
  original: string | null | undefined,
): string | null {
  const o = original?.trim()
  if (!o) return null
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
  return norm(o) === norm(shown ?? '') ? null : o
}

/** Cuánto vive en el Data Cache lo que pide `tmdbFetch` si nadie dice otra cosa. */
const DEFAULT_REVALIDATE = 3600

type FetchOptions = {
  /**
   * Segundos de cache. Sólo hace falta pasarlo cuando el dato tolera estar más
   * viejo que la hora por defecto y conviene que así sea — el mosaico de
   * `/descargar`, por ejemplo, que no gana nada con refrescarse seguido y sí
   * pierde si hace esperar a la landing.
   */
  revalidate?: number
}

async function tmdbFetch(
  endpoint: string,
  params: Record<string, string> = {},
  options: FetchOptions = {},
) {
  const url = new URL(`${BASE_URL}${endpoint}`)
  url.searchParams.set('api_key', TMDB_API_KEY!)
  url.searchParams.set('language', 'es-AR')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    next: { revalidate: options.revalidate ?? DEFAULT_REVALIDATE },
  })
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`)
  return res.json()
}

export async function getPopularMovies(page = 1, options?: FetchOptions) {
  return tmdbFetch('/movie/popular', { page: String(page) }, options)
}

export async function getPopularTV(page = 1, options?: FetchOptions) {
  return tmdbFetch('/tv/popular', { page: String(page) }, options)
}

export async function searchMulti(query: string, page = 1) {
  return tmdbFetch('/search/multi', { query, page: String(page) })
}

export async function getMovieDetails(id: number) {
  return tmdbFetch(`/movie/${id}`)
}

export async function getTVDetails(id: number) {
  return tmdbFetch(`/tv/${id}`)
}

export async function getTVExternalIds(id: number) {
  return tmdbFetch(`/tv/${id}/external_ids`)
}

export async function getMovieCredits(id: number) {
  return tmdbFetch(`/movie/${id}/credits`)
}

export async function getTVCredits(id: number) {
  return tmdbFetch(`/tv/${id}/credits`)
}

export async function getMovieProviders(id: number) {
  return tmdbFetch(`/movie/${id}/watch/providers`)
}

export async function getTVProviders(id: number) {
  return tmdbFetch(`/tv/${id}/watch/providers`)
}

export async function discoverMovies(params: Record<string, string>) {
  return tmdbFetch('/discover/movie', params)
}

export async function discoverTV(params: Record<string, string>) {
  return tmdbFetch('/discover/tv', params)
}

export async function getMovieGenres() {
  return tmdbFetch('/genre/movie/list')
}

export async function getTVGenres() {
  return tmdbFetch('/genre/tv/list')
}

export async function getRegionProviders(country = 'AR') {
  const [movies, tv] = await Promise.all([
    tmdbFetch('/watch/providers/movie', { watch_region: country }),
    tmdbFetch('/watch/providers/tv',    { watch_region: country }),
  ])
  const map = new Map<number, { provider_id: number; provider_name: string; logo_path: string }>()
  for (const p of [...(movies.results ?? []), ...(tv.results ?? [])]) {
    map.set(p.provider_id, p)
  }
  return Array.from(map.values())
}

/** @deprecated Use getRegionProviders(country) */
export async function getARProviders() {
  return getRegionProviders('AR')
}

export async function getProviderTopMovies(providerId: number, country = 'AR') {
  return tmdbFetch('/discover/movie', {
    with_watch_providers: String(providerId),
    watch_region: country,
    sort_by: 'popularity.desc',
    'vote_count.gte': '10',
  })
}

export async function getProviderTopTV(providerId: number, country = 'AR') {
  return tmdbFetch('/discover/tv', {
    with_watch_providers: String(providerId),
    watch_region: country,
    sort_by: 'popularity.desc',
    'vote_count.gte': '10',
  })
}

export async function getProviderCatalog(providerId: number, type: 'movie' | 'tv', page = 1, country = 'AR') {
  const today = new Date().toISOString().split('T')[0]
  if (type === 'movie') {
    return tmdbFetch('/discover/movie', {
      with_watch_providers: String(providerId),
      watch_region: country,
      sort_by: 'release_date.desc',
      'release_date.lte': today,
      'vote_count.gte': '5',
      page: String(page),
    })
  }
  return tmdbFetch('/discover/tv', {
    with_watch_providers: String(providerId),
    watch_region: country,
    sort_by: 'first_air_date.desc',
    'first_air_date.lte': today,
    'vote_count.gte': '5',
    page: String(page),
  })
}

export async function getPersonDetails(id: number) {
  return tmdbFetch(`/person/${id}`)
}

export async function getPersonCredits(id: number) {
  return tmdbFetch(`/person/${id}/combined_credits`)
}

export async function getUpcomingMovies(country = 'AR', page = 1) {
  return tmdbFetch('/movie/upcoming', { region: country, page: String(page) })
}

export async function getProviderMovies(providerId: number, country = 'AR') {
  const today = new Date().toISOString().split('T')[0]
  return tmdbFetch('/discover/movie', {
    with_watch_providers: String(providerId),
    watch_region: country,
    sort_by: 'release_date.desc',
    'release_date.lte': today,
    'vote_count.gte': '5',
  })
}

export async function getProviderTV(providerId: number, country = 'AR') {
  const today = new Date().toISOString().split('T')[0]
  return tmdbFetch('/discover/tv', {
    with_watch_providers: String(providerId),
    watch_region: country,
    sort_by: 'first_air_date.desc',
    'first_air_date.lte': today,
    'vote_count.gte': '5',
  })
}
