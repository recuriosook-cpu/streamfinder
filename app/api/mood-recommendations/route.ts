import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

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

interface TmdbProviderEntry { provider_id: number; provider_name: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawResult = Record<string, any>

// ── Mood / duration mappings ──────────────────────────────────────────────────

const MOOD_LABELS: Record<string, string> = {
  laugh:  'reírme (comedia, humor)',
  cry:    'emocionarme (drama, historia)',
  scare:  'asustarme (terror, suspenso)',
  think:  'pensar (sci-fi, thriller)',
  action: 'adrenalina (acción, aventura)',
  calm:   'algo tranquilo (romance, documental)',
}

const MOOD_GENRES: Record<string, number[]> = {
  laugh:  [35],
  cry:    [18],
  scare:  [27, 53],
  think:  [878, 53],
  action: [28, 12],
  calm:   [10749, 99],
}

const MOOD_REASONS: Record<string, string> = {
  laugh:  'Una comedia perfecta para reírse sin parar y olvidarse de todo.',
  cry:    'Una historia emocionante que te va a tocar el corazón.',
  scare:  'Ideal para una noche de suspenso y escalofríos garantizados.',
  think:  'Una propuesta que te hace reflexionar y te deja pensando.',
  action: 'Llena de adrenalina y acción de principio a fin.',
  calm:   'Una opción relajante y disfrutable, perfecta para desconectarse.',
}

const DURATION_LABELS: Record<string, string> = {
  short:      'menos de 1 hora y 30 minutos',
  medium:     '1h30 a 2h30',
  long:       'más de 2 horas 30 minutos',
  series:     'una serie completa',
  miniseries: 'una miniserie',
  any:        'cualquier duración',
}

const COMPANY_LABELS: Record<string, string> = {
  solo:    'solo/a',
  couple:  'en pareja',
  family:  'en familia',
  friends: 'con amigos',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmdbMediaType(durationKey: string): 'movie' | 'tv' {
  return durationKey === 'series' || durationKey === 'miniseries' ? 'tv' : 'movie'
}

function formatRuntime(minutes: number): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

async function getCountryProviders(country: string): Promise<TmdbProviderEntry[]> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/watch/providers/movie?api_key=${TMDB_KEY}&watch_region=${country}`,
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []) as TmdbProviderEntry[]
  } catch { return [] }
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

// ── TMDB fallback ─────────────────────────────────────────────────────────────

async function tmdbFallback(
  moodKey: string,
  durationKey: string,
  country: string,
  watchedSet: Set<string>,
): Promise<Recommendation[]> {
  const mediaType = tmdbMediaType(durationKey)
  const genres = MOOD_GENRES[moodKey] ?? [18]
  const endpoint = `/discover/${mediaType}`

  const params = new URLSearchParams({
    api_key: TMDB_KEY!,
    language: 'es-AR',
    with_genres: genres[0].toString(),
    sort_by: 'vote_average.desc',
    'vote_count.gte': '1000',
    watch_region: country,
    page: '1',
  })

  if (mediaType === 'movie' && durationKey === 'short') {
    params.set('with_runtime.lte', '90')
  }
  if (mediaType === 'movie' && durationKey === 'long') {
    params.set('with_runtime.gte', '150')
  }

  const res = await fetch(`https://api.themoviedb.org/3${endpoint}?${params}`)
  if (!res.ok) return []
  const data = await res.json()

  const filtered: RawResult[] = ((data.results ?? []) as RawResult[])
    .filter(r => !watchedSet.has(`${mediaType}:${r.id}`))
    .slice(0, 4)

  // Enrich in parallel: details + provider
  const enriched = await Promise.all(
    filtered.map(async (r) => {
      const [detailRes, platform] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/${mediaType}/${r.id}?api_key=${TMDB_KEY}&language=es-AR`),
        getItemProvider(r.id, mediaType, country),
      ])
      const detail: RawResult = detailRes.ok ? await detailRes.json() : {}

      const title: string = detail.title ?? detail.name ?? r.title ?? r.name ?? ''
      const yearStr: string = detail.release_date ?? detail.first_air_date ?? ''
      const year = yearStr ? parseInt(yearStr.slice(0, 4)) : 2020

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
        reason: MOOD_REASONS[moodKey] ?? 'Una excelente opción para ver hoy.',
        platform,
        duration,
        tmdb_id: r.id as number,
        media_type: mediaType,
        poster_path: (detail.poster_path ?? r.poster_path ?? null) as string | null,
      }
    })
  )

  return enriched
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { moodKey, durationKey, companyKey, userId, country } = await req.json()

  const supabase = createServerClient()

  // 1. Get last 50 watched titles
  const { data: watched } = await supabase
    .from('watched')
    .select('media_id, media_type')
    .eq('user_id', userId)
    .order('watched_at', { ascending: false })
    .limit(50)

  const rows: WatchedRow[] = (watched ?? []) as WatchedRow[]
  const watchedSet = new Set(rows.map(w => `${w.media_type}:${w.media_id}`))
  const watchedList = rows.length > 0
    ? rows.map(w => `${w.media_type}:${w.media_id}`).join(', ')
    : 'ninguno'

  // 2. Get country providers for Anthropic prompt
  const providers = await getCountryProviders(country)
  const platformNames = providers.slice(0, 15).map(p => p.provider_name).join(', ')
    || 'Netflix, Disney+, Amazon Prime, Max, Apple TV+'

  // 3. Try Anthropic
  const hasKey = ANTHROPIC_KEY && !ANTHROPIC_KEY.startsWith('sk-ant-placeholder')
  let recommendations: Recommendation[] = []
  let anthropicOk = false

  if (hasKey) {
    try {
      const moodLabel    = MOOD_LABELS[moodKey]    ?? moodKey
      const durationLabel = DURATION_LABELS[durationKey] ?? durationKey
      const companyLabel = COMPANY_LABELS[companyKey]  ?? companyKey

      const userPrompt = `El usuario quiere ver algo para ${moodLabel}. Tiene ${durationLabel} disponible. Va a ver ${companyLabel}.
País: ${country}.
Plataformas disponibles: ${platformNames}.
Ya vio estos títulos (no los recomiendes, identificados por tipo:tmdb_id): ${watchedList}.
Recomendá exactamente 4 títulos. Respondé con este JSON:
{
  "recommendations": [
    {
      "title": "string",
      "year": 2024,
      "reason": "string (max 2 oraciones explicando por qué es perfecta para este momento)",
      "platform": "string (nombre de la plataforma donde está disponible)",
      "duration": "string (ej: '1h 45m' para pelis o 'Serie · X temporadas')",
      "tmdb_id": 12345,
      "media_type": "movie"
    }
  ]
}`

      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          system: 'Sos un experto recomendador de películas y series. Respondé SOLO con un JSON válido, sin texto adicional, sin markdown, sin backticks.',
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (anthropicRes.ok) {
        const anthropicData = await anthropicRes.json()
        const rawText: string = anthropicData.content?.[0]?.text ?? '{}'
        const parsed = JSON.parse(rawText)
        const aiRecs: Recommendation[] = parsed.recommendations ?? []

        // Enrich with poster_path
        const enriched = await Promise.all(
          aiRecs.map(async (rec) => {
            try {
              const r = await fetch(
                `https://api.themoviedb.org/3/${rec.media_type}/${rec.tmdb_id}?api_key=${TMDB_KEY}&language=es-AR`
              )
              const d = await r.json()
              return { ...rec, poster_path: d.poster_path ?? null }
            } catch { return { ...rec, poster_path: null } }
          })
        )
        recommendations = enriched
        anthropicOk = true
      }
    } catch { /* fall through to TMDB fallback */ }
  }

  // 4. TMDB fallback when Anthropic unavailable or failed
  if (!anthropicOk) {
    recommendations = await tmdbFallback(moodKey, durationKey, country, watchedSet)
  }

  return NextResponse.json({ recommendations, source: anthropicOk ? 'ai' : 'tmdb' })
}
