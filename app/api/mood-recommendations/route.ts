import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

// ── Types ─────────────────────────────────────────────────────────────────────

interface WatchedRow { media_id: number; media_type: string }

interface Recommendation {
  title: string
  year: number
  reason: string
  platform: string
  duration: string
  tmdb_id: number
  media_type: 'movie' | 'tv'
  poster_path: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawResult = Record<string, any>

// ── Mood config ───────────────────────────────────────────────────────────────

const MOOD_GENRES: Record<string, number[]> = {
  laugh:  [35],
  cry:    [18, 10749],
  scare:  [27, 53],
  think:  [878, 53],
  action: [28, 12],
  calm:   [10749, 36, 99],
}

const MOOD_MIN_RATING: Record<string, number> = {
  laugh:  6.5,
  cry:    7.0,
  scare:  6.0,
  think:  7.0,
  action: 6.5,
  calm:   7.0,
}

// {rating} is replaced at runtime with the movie's vote_average
const REASON_TEMPLATES: Record<string, string[]> = {
  laugh: [
    'Una comedia bien valorada, ideal para distender.',
    'Risa garantizada — {rating} estrellas en TMDB.',
    'Comedia que no falla, para olvidarse de todo.',
    'Humor de calidad con {rating} de rating.',
  ],
  cry: [
    'Drama emotivo que vale cada minuto.',
    'Una historia que te va a llegar — {rating} estrellas.',
    'Emoción garantizada, prepará los pañuelos.',
    'Una de las más valoradas del género: {rating}.',
  ],
  scare: [
    'Terror con {rating} de rating — prepará la luz prendida.',
    'Una de las más temidas del catálogo.',
    'Suspenso y escalofríos de principio a fin.',
    'Calificada {rating} por los fanáticos del género.',
  ],
  think: [
    'Una historia que te va a dejar pensando.',
    'Ciencia ficción de primer nivel — {rating} estrellas.',
    'Para los que quieren más que entretenimiento.',
    'Reflexión garantizada, una de las mejor valuadas: {rating}.',
  ],
  action: [
    'Pura adrenalina — {rating} estrellas.',
    'Acción sin pausa, para no parpadear.',
    'Una de las más valoradas del género de acción.',
    'Velocidad y emoción, calificada {rating} en TMDB.',
  ],
  calm: [
    'Tranquila y bien valorada — perfecta para relajar.',
    'Sin sobresaltos, solo buen cine: {rating} estrellas.',
    'Para desconectarse con {rating} de calificación.',
    'Suave y disfrutable, ideal para descansar.',
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickReason(moodKey: string, rating: number, index: number): string {
  const templates = REASON_TEMPLATES[moodKey] ?? ['Una excelente opción para ver hoy.']
  return templates[index % templates.length].replace('{rating}', rating.toFixed(1))
}

function resolveGenres(moodKey: string, companyKey: string): number[] {
  if (companyKey === 'family') {
    if (moodKey === 'laugh') return [35, 10751]  // Comedy + Family
    if (moodKey === 'calm')  return [16, 10751]  // Animation + Family
  }
  if (companyKey === 'couple' && moodKey === 'calm')   return [10749, 18]  // Romance + Drama
  if (companyKey === 'friends' && moodKey === 'action') return [28, 35]    // Action + Comedy

  return MOOD_GENRES[moodKey] ?? [18]
}

function tmdbMediaType(durationKey: string): 'movie' | 'tv' {
  return durationKey === 'series' || durationKey === 'miniseries' ? 'tv' : 'movie'
}

function formatRuntime(minutes: number): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

async function getItemProvider(tmdbId: number, mediaType: 'movie' | 'tv', country: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/watch/providers?api_key=${TMDB_KEY}`
    )
    if (!res.ok) return 'Streaming'
    const data = await res.json()
    const countryData = data.results?.[country]
    const providers: { provider_name: string }[] = countryData?.flatrate ?? countryData?.buy ?? []
    return providers[0]?.provider_name ?? 'Streaming'
  } catch { return 'Streaming' }
}

function buildParams(
  moodKey: string,
  durationKey: string,
  companyKey: string,
  country: string,
  relax: boolean,
): URLSearchParams {
  const mediaType  = tmdbMediaType(durationKey)
  const minRating  = MOOD_MIN_RATING[moodKey] ?? 6.5
  const genres     = resolveGenres(moodKey, companyKey)

  const params = new URLSearchParams({
    api_key:            TMDB_KEY!,
    language:           'es-AR',
    with_genres:        genres[0].toString(),
    sort_by:            'popularity.desc',
    'vote_count.gte':   relax ? '200' : '500',
    'vote_average.gte': String(relax ? Math.max(5.0, minRating - 1) : minRating),
    watch_region:       country,
    include_adult:      'false',
    page:               '1',
  })

  // Runtime filters (movies only)
  if (mediaType === 'movie') {
    if (!relax) {
      if (durationKey === 'short')  params.set('with_runtime.lte', '90')
      if (durationKey === 'medium') { params.set('with_runtime.gte', '90'); params.set('with_runtime.lte', '150') }
      if (durationKey === 'long')   params.set('with_runtime.gte', '150')
    } else if (durationKey === 'short') {
      params.set('with_runtime.lte', '100')
    }
  }

  // Miniseries type (TMDB type 2 = Miniseries)
  if (durationKey === 'miniseries') params.set('with_type', '2')

  // Family-safe certification (movies only — TV cert varies too much by country)
  if (companyKey === 'family' && mediaType === 'movie') {
    params.set('certification_country', 'US')
    params.set('certification.lte', 'PG-13')
  }

  return params
}

async function discoverFiltered(
  moodKey: string,
  durationKey: string,
  companyKey: string,
  country: string,
  excludeSet: Set<string>,
  relax: boolean,
): Promise<RawResult[]> {
  const mediaType = tmdbMediaType(durationKey)
  const params    = buildParams(moodKey, durationKey, companyKey, country, relax)

  const res = await fetch(`https://api.themoviedb.org/3/discover/${mediaType}?${params}`)
  if (!res.ok) return []
  const data = await res.json()

  return ((data.results ?? []) as RawResult[])
    .filter(r => !r.adult)
    .filter(r => !excludeSet.has(`${mediaType}:${r.id}`))
}

async function enrich(
  items: RawResult[],
  moodKey: string,
  durationKey: string,
  country: string,
): Promise<Recommendation[]> {
  const mediaType = tmdbMediaType(durationKey)

  return Promise.all(
    items.map(async (r, index) => {
      const [detailRes, platform] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/${mediaType}/${r.id}?api_key=${TMDB_KEY}&language=es-AR`),
        getItemProvider(r.id, mediaType, country),
      ])
      const detail: RawResult = detailRes.ok ? await detailRes.json() : {}

      const title:  string = detail.title ?? detail.name ?? r.title ?? r.name ?? ''
      const yearStr: string = detail.release_date ?? detail.first_air_date ?? ''
      const year   = yearStr ? parseInt(yearStr.slice(0, 4)) : 2020
      const rating = (detail.vote_average ?? r.vote_average ?? 7.0) as number

      let duration = ''
      if (mediaType === 'movie') {
        duration = detail.runtime ? formatRuntime(detail.runtime as number) : '~2h'
      } else {
        const seasons = detail.number_of_seasons as number | undefined
        duration = seasons ? `Serie · ${seasons} temporada${seasons > 1 ? 's' : ''}` : 'Serie'
      }

      return {
        title,
        year,
        reason:      pickReason(moodKey, rating, index),
        platform,
        duration,
        tmdb_id:     r.id as number,
        media_type:  mediaType,
        poster_path: (detail.poster_path ?? r.poster_path ?? null) as string | null,
      }
    })
  )
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { moodKey, durationKey, companyKey, userId, country } = await req.json()
  const supabase = createServerClient()

  // 1. Fetch exclusion sets (watched + watchlist) — skip if unauthenticated
  const [watchedResult, watchlistResult] = await Promise.all([
    userId
      ? supabase.from('watched').select('media_id, media_type').eq('user_id', userId).limit(50)
      : { data: [] },
    userId
      ? supabase.from('watchlist').select('media_id, media_type').eq('user_id', userId).limit(200)
      : { data: [] },
  ])

  const toKey = (w: WatchedRow) => `${w.media_type}:${w.media_id}`
  const excludeSet = new Set([
    ...((watchedResult.data ?? []) as WatchedRow[]).map(toKey),
    ...((watchlistResult.data ?? []) as WatchedRow[]).map(toKey),
  ])

  // 2. Strict discovery
  const strict = await discoverFiltered(moodKey, durationKey, companyKey, country, excludeSet, false)
  let picked = strict.slice(0, 4)

  // 3. Relax filters if fewer than 4 results
  if (picked.length < 4) {
    const relaxed  = await discoverFiltered(moodKey, durationKey, companyKey, country, excludeSet, true)
    const pickedIds = new Set(picked.map(r => r.id as number))
    const extras   = relaxed.filter(r => !pickedIds.has(r.id as number))
    picked = [...picked, ...extras].slice(0, 4)
  }

  // 4. Enrich with details + streaming provider
  const recommendations = await enrich(picked, moodKey, durationKey, country)

  return NextResponse.json({ recommendations, source: 'tmdb' })
}
