import { ALL_PLATFORMS, type PlatformConfig } from '@/lib/providers'

/**
 * Onboarding de cuenta nueva, flujo corto (2026-10).
 *
 * Port de `src/lib/onboarding.ts` de glynbox-mobile: los mismos tres pasos
 * —plataformas, géneros y una grilla de pósters para marcar lo que vio y le
 * gustó— y la misma pantalla de "Tus primeras recomendaciones" al final. Si se
 * cambia algo de la lógica acá, va también allá, y al revés.
 *
 * Guarda en las mismas columnas de `profiles` que siempre:
 *
 *   favorite_genres    → nombres en castellano, NO ids de TMDB
 *                        ["Acción","Ciencia ficción","Thriller"]
 *   favorite_platforms → ids de provider como STRINGS
 *                        ["8","337","1899"]
 *
 * Lo que se marca en la grilla va a `ratings` y `watched`, como cualquier
 * calificación.
 */

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB = 'https://api.themoviedb.org/3'

async function tmdb<T>(endpoint: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const url = new URL(`${TMDB}${endpoint}`)
  url.searchParams.set('api_key', TMDB_KEY ?? '')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return res.json() as Promise<T>
}

// ── Géneros ──────────────────────────────────────────────────────────────────

/** Los 18 géneros del paso 2, con su id de TMDB para consultar `/discover`. */
export const ONBOARDING_GENRES: { id: number; name: string }[] = [
  { id: 28, name: 'Acción' },
  { id: 35, name: 'Comedia' },
  { id: 18, name: 'Drama' },
  { id: 27, name: 'Terror' },
  { id: 878, name: 'Ciencia ficción' },
  { id: 53, name: 'Thriller' },
  { id: 16, name: 'Animación' },
  { id: 10749, name: 'Romance' },
  { id: 99, name: 'Documental' },
  { id: 12, name: 'Aventura' },
  { id: 14, name: 'Fantasía' },
  { id: 9648, name: 'Misterio' },
  { id: 36, name: 'Historia' },
  { id: 80, name: 'Crimen' },
  { id: 10402, name: 'Musical' },
  { id: 37, name: 'Western' },
  { id: 10752, name: 'Guerra' },
  { id: 10751, name: 'Familia' },
]

/** Mínimo para seguir: el paso siguiente ya muestra pósters de esos géneros. */
export const MIN_GENRES = 1

export function genreIdsFromNames(names: string[]): number[] {
  return names
    .map(name => ONBOARDING_GENRES.find(g => g.name === name)?.id)
    .filter((id): id is number => id !== undefined)
}

// ── Plataformas ──────────────────────────────────────────────────────────────

/**
 * Ids viejos de una plataforma → el de hoy.
 *
 * Max es 1899; el 384 es el viejo "HBO Max". Hay perfiles que lo tienen
 * guardado y TMDB todavía lo devuelve en algunos títulos, así que se reconocen
 * los dos: al precargar lo guardado y al buscar dónde está cada título.
 * Mismo criterio que `providerIds: [1899, 384]` de la app.
 */
const OLD_PROVIDER_IDS: Record<number, number> = { 384: 1899 }

export function canonicalProviderId(id: number): number {
  return OLD_PROVIDER_IDS[id] ?? id
}

/** Todos los ids con que TMDB puede nombrar a la plataforma: el de hoy y los viejos. */
export function providerIdsOf(platform: PlatformConfig): number[] {
  return [
    platform.id,
    ...Object.entries(OLD_PROVIDER_IDS).filter(([, now]) => now === platform.id).map(([old]) => Number(old)),
  ]
}

/** Lo guardado en el perfil, con los ids de hoy y sin repetidos. */
export function normalizeSavedPlatforms(saved: (string | number)[] | null | undefined): number[] {
  return [...new Set((saved ?? []).map(id => canonicalProviderId(Number(id))).filter(Number.isFinite))]
}

// ── Paso 3: la grilla de gusto ───────────────────────────────────────────────

/** Cuántas hay que marcar para seguir. El contador dice "3 de 5". */
export const TASTE_TO_CONTINUE = 5

/**
 * La nota que deja cada póster tocado. 4 y no 5: "la vi y me gustó" es
 * positivo, no "es de mis favoritas".
 */
export const TASTE_RATING = 4

/** Desde qué nota una calificación previa cuenta como "le gustó". */
export const LIKED_FROM = 3.5

export type TasteItem = {
  id: number
  type: 'movie' | 'tv'
  title: string
  posterPath: string | null
  genreIds: number[]
}

export const keyOf = (item: { type: string; id: number }) => `${item.type}:${item.id}`

/** 12 filas de 3. */
const TASTE_POOL_SIZE = 36

/**
 * El equivalente de serie de cada género del paso 2. Los que no tienen
 * —Terror, Thriller, Romance, Historia, Musical— no traen series.
 */
const TV_GENRE_OF: Record<number, number> = {
  28: 10759, 12: 10759, 878: 10765, 14: 10765, 10752: 10768,
  35: 35, 18: 18, 16: 16, 99: 99, 9648: 9648, 80: 80, 10751: 10751, 37: 37,
}

/** Noticias, reality, talk shows, infantiles y novelas. */
const TV_EXCLUDED_GENRES = '10763|10764|10767|10762|10766'

type RawMovie = { id: number; title: string; poster_path: string | null; genre_ids?: number[] }
type RawTv = { id: number; name: string; poster_path: string | null; genre_ids?: number[] }
type Page<T> = { results?: T[] }

const fromMovie = (m: RawMovie): TasteItem =>
  ({ id: m.id, type: 'movie', title: m.title, posterPath: m.poster_path, genreIds: m.genre_ids ?? [] })
const fromTv = (t: RawTv): TasteItem =>
  ({ id: t.id, type: 'tv', title: t.name, posterPath: t.poster_path, genreIds: t.genre_ids ?? [] })

/**
 * Películas y series populares de los géneros elegidos, para la grilla.
 *
 * Con muchos votos para que sean títulos que la gente reconoce. Dos películas
 * por cada serie, alternadas. Sin géneros, populares a secas; si las series
 * fallan, sólo películas.
 */
export async function getTasteGrid(genreNames: string[]): Promise<TasteItem[]> {
  const movieGenres = genreIdsFromNames(genreNames)
  const tvGenres = [...new Set(movieGenres.map(id => TV_GENRE_OF[id]).filter(Boolean))]
  const withoutShows = movieGenres.length > 0 && tvGenres.length === 0

  const movieParams: Record<string, string | number | boolean> = {
    language: 'es-AR', include_adult: false, sort_by: 'popularity.desc', 'vote_count.gte': 1000,
  }
  if (movieGenres.length > 0) movieParams.with_genres = movieGenres.join('|')

  const tvParams: Record<string, string | number | boolean> = {
    language: 'es-AR', sort_by: 'popularity.desc', 'vote_count.gte': 500, without_genres: TV_EXCLUDED_GENRES,
  }
  if (tvGenres.length > 0) tvParams.with_genres = tvGenres.join('|')

  const noMovies: Page<RawMovie> = { results: [] }
  const noShows: Page<RawTv> = { results: [] }
  const [m1, m2, t1] = await Promise.all([
    tmdb<Page<RawMovie>>('/discover/movie', { ...movieParams, page: 1 }),
    tmdb<Page<RawMovie>>('/discover/movie', { ...movieParams, page: 2 }).catch(() => noMovies),
    withoutShows ? Promise.resolve(noShows) : tmdb<Page<RawTv>>('/discover/tv', { ...tvParams, page: 1 }).catch(() => noShows),
  ])

  const movies = [...(m1.results ?? []), ...(m2.results ?? [])].map(fromMovie)
  const shows = (t1.results ?? []).map(fromTv)

  const mixed: TasteItem[] = []
  while (movies.length > 0 || shows.length > 0) {
    mixed.push(...movies.splice(0, 2))
    mixed.push(...shows.splice(0, 1))
  }

  const seen = new Set<string>()
  return mixed
    .filter(item => {
      if (!item.posterPath || seen.has(keyOf(item))) return false
      seen.add(keyOf(item))
      return true
    })
    .slice(0, TASTE_POOL_SIZE)
}

// ── Las primeras recomendaciones ─────────────────────────────────────────────

export type FirstRecommendation = TasteItem & {
  /** En cuál de sus plataformas está. `null` si no eligió ninguna. */
  platform: PlatformConfig | null
}

const FIRST_RECS_SIZE = 12
/** Cuántos de los marcados se usan como semilla: los últimos. */
const SEED_LIMIT = 8
/** Cuántas candidatas se buscan en sus plataformas, un pedido por candidata. */
const PROVIDER_CHECKS = 30
/** Lo que cuenta como "está en tu plataforma". Alquilar o comprar no. */
const INCLUDED_OFFERS = ['flatrate', 'free', 'ads'] as const
const RECOMMENDATION_MIN = 6
const RECOMMENDATION_LIMIT = 12

/** `/recommendations`, con `/similar` de respaldo si trae pocas. Como la ficha de la app. */
async function recommendationsOf(item: TasteItem): Promise<TasteItem[]> {
  const map = (rows: (RawMovie | RawTv)[]) =>
    rows.map(r => (item.type === 'movie' ? fromMovie(r as RawMovie) : fromTv(r as RawTv)))

  const rec = await tmdb<Page<RawMovie | RawTv>>(`/${item.type}/${item.id}/recommendations`, { language: 'es-AR', page: 1 })
  const withPoster = map(rec.results ?? []).filter(r => r.posterPath)
  if (withPoster.length >= RECOMMENDATION_MIN) return withPoster.slice(0, RECOMMENDATION_LIMIT)

  const similar = await tmdb<Page<RawMovie | RawTv>>(`/${item.type}/${item.id}/similar`, { language: 'es-AR', page: 1 }).catch(() => null)
  if (!similar) return withPoster
  const already = new Set(withPoster.map(r => r.id))
  const extra = map(similar.results ?? []).filter(r => r.posterPath && !already.has(r.id))
  return [...withPoster, ...extra].slice(0, RECOMMENDATION_LIMIT)
}

/** La plataforma del usuario en la que está el título en ese país, o `null`. */
async function platformFor(item: TasteItem, platforms: PlatformConfig[], country: string): Promise<PlatformConfig | null> {
  try {
    const data = await tmdb<{ results: Record<string, Record<string, { provider_id: number }[] | undefined>> }>(
      `/${item.type}/${item.id}/watch/providers`,
    )
    const region = data.results?.[country]
    if (!region) return null
    const ids = new Set(INCLUDED_OFFERS.flatMap(offer => region[offer] ?? []).map(p => p.provider_id))
    return platforms.find(p => providerIdsOf(p).some(id => ids.has(id))) ?? null
  } catch {
    return null
  }
}

/**
 * Películas y series parecidas a las que marcó, que estén en sus plataformas.
 *
 * Las candidatas se ordenan por cuántos de los marcados las recomiendan. Sin
 * plataformas no se filtra. Si con el filtro quedan pocas, se completa con lo
 * más popular de sus géneros en sus plataformas. Nunca tira.
 */
export async function getFirstRecommendations(input: {
  liked: TasteItem[]
  platformIds: number[]
  genreNames: string[]
  country: string
}): Promise<FirstRecommendation[]> {
  const platforms = ALL_PLATFORMS.filter(p => input.platformIds.includes(p.id))
  const excluded = new Set(input.liked.map(keyOf))

  const lists = await Promise.all(
    input.liked.slice(-SEED_LIMIT).map(seed => recommendationsOf(seed).catch(() => [] as TasteItem[])),
  )

  // Puntaje: cuántas semillas la traen, y como desempate lo arriba que vino.
  const scored = new Map<string, { item: TasteItem; score: number }>()
  for (const list of lists) {
    list.forEach((item, position) => {
      if (excluded.has(keyOf(item)) || !item.posterPath) return
      const entry = scored.get(keyOf(item)) ?? { item, score: 0 }
      entry.score += 1 + (list.length - position) / (list.length * 10)
      scored.set(keyOf(item), entry)
    })
  }
  const candidates = [...scored.values()].sort((a, b) => b.score - a.score).map(e => e.item)

  if (platforms.length === 0) {
    return candidates.slice(0, FIRST_RECS_SIZE).map(item => ({ ...item, platform: null }))
  }

  const withPlatform = async (item: TasteItem): Promise<FirstRecommendation> =>
    ({ ...item, platform: await platformFor(item, platforms, input.country) })

  const checked = await Promise.all(candidates.slice(0, PROVIDER_CHECKS).map(withPlatform))
  const result = checked.filter(item => item.platform !== null).slice(0, FIRST_RECS_SIZE)
  if (result.length >= FIRST_RECS_SIZE / 2) return result

  // Relleno. TMDB ignora `with_watch_providers` sin `watch_region`.
  try {
    const genres = genreIdsFromNames(input.genreNames)
    const params: Record<string, string | number | boolean> = {
      language: 'es-AR',
      include_adult: false,
      sort_by: 'popularity.desc',
      'vote_count.gte': 300,
      watch_region: input.country,
      with_watch_providers: platforms.flatMap(providerIdsOf).join('|'),
      with_watch_monetization_types: 'flatrate|free|ads',
    }
    if (genres.length > 0) params.with_genres = genres.join('|')

    const page = await tmdb<Page<RawMovie>>('/discover/movie', params)
    const taken = new Set([...excluded, ...result.map(keyOf)])
    const extra = (page.results ?? [])
      .map(fromMovie)
      .filter(item => item.posterPath && !taken.has(keyOf(item)))
      .slice(0, FIRST_RECS_SIZE - result.length)
    const extraChecked = await Promise.all(extra.map(withPlatform))
    return [...result, ...extraChecked.filter(item => item.platform !== null)]
  } catch {
    return result
  }
}
