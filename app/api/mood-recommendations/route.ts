import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

interface WatchedRow {
  media_id: number
  media_type: string
}

interface Recommendation {
  title: string
  year: number
  reason: string
  platform: string
  duration: string
  tmdb_id: number
  media_type: 'movie' | 'tv'
  poster_path?: string | null
}

interface TmdbProvider {
  provider_name: string
}

export async function POST(req: NextRequest) {
  const { mood, duration, company, userId, country } = await req.json()

  const supabase = createServerClient()

  // 1. Get last 50 watched titles
  const { data: watched } = await supabase
    .from('watched')
    .select('media_id, media_type')
    .eq('user_id', userId)
    .order('watched_at', { ascending: false })
    .limit(50)

  const rows: WatchedRow[] = (watched ?? []) as WatchedRow[]
  const watchedList = rows.length > 0
    ? rows.map(w => `${w.media_type}:${w.media_id}`).join(', ')
    : 'ninguno'

  // 2. Get available platforms in country
  let platforms = 'Netflix, Disney+, Amazon Prime, Max, Apple TV+'
  try {
    const provRes = await fetch(
      `https://api.themoviedb.org/3/watch/providers/movie?api_key=${TMDB_KEY}&watch_region=${country}`,
      { next: { revalidate: 86400 } }
    )
    if (provRes.ok) {
      const provData = await provRes.json()
      platforms = ((provData.results ?? []) as TmdbProvider[])
        .slice(0, 15)
        .map(p => p.provider_name)
        .join(', ')
    }
  } catch { /* use default platforms */ }

  // 3. Call Anthropic
  const userPrompt = `El usuario quiere ver algo para ${mood}. Tiene ${duration} disponible. Va a ver ${company}.
País: ${country}.
Plataformas disponibles: ${platforms}.
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
      'x-api-key': ANTHROPIC_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: 'Sos un experto recomendador de películas y series. Respondé SOLO con un JSON válido, sin texto adicional, sin markdown, sin backticks.',
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!anthropicRes.ok) {
    return NextResponse.json({ error: 'AI service unavailable' }, { status: 502 })
  }

  const anthropicData = await anthropicRes.json()
  const rawText: string = anthropicData.content?.[0]?.text ?? '{}'

  let recommendations: Recommendation[] = []
  try {
    const parsed = JSON.parse(rawText)
    recommendations = parsed.recommendations ?? []
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 })
  }

  // 4. Enrich with poster_path from TMDB
  const enriched = await Promise.all(
    recommendations.map(async (rec) => {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/${rec.media_type}/${rec.tmdb_id}?api_key=${TMDB_KEY}&language=es-AR`
        )
        const data = await res.json()
        return { ...rec, poster_path: data.poster_path ?? null }
      } catch {
        return { ...rec, poster_path: null }
      }
    })
  )

  return NextResponse.json({ recommendations: enriched })
}
