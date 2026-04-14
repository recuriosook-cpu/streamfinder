import { NextRequest, NextResponse } from 'next/server'
import type { OMDBRatings } from '@/lib/omdb'

// OMDB_API_KEY lives here — server-side only, never sent to the browser.
const OMDB_KEY = process.env.OMDB_API_KEY

const EMPTY: OMDBRatings = {
  imdbScore: null, imdbVotes: null,
  rtCritics: null, metacritic: null, awards: null,
}

export async function GET(req: NextRequest) {
  const imdbId = req.nextUrl.searchParams.get('imdbId')

  if (!OMDB_KEY || !imdbId) {
    return NextResponse.json(EMPTY)
  }

  try {
    const res = await fetch(
      `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${imdbId}`,
      { next: { revalidate: 86400 } },
    )
    if (!res.ok) return NextResponse.json(EMPTY)

    const data = await res.json()
    if (data.Response === 'False') return NextResponse.json(EMPTY)

    const imdbScore  = data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null
    const imdbVotes  = data.imdbVotes  && data.imdbVotes  !== 'N/A' ? data.imdbVotes  : null
    const rtEntry    = (data.Ratings as { Source: string; Value: string }[] | undefined)
      ?.find(r => r.Source === 'Rotten Tomatoes')
    const rtCritics  = rtEntry ? rtEntry.Value : null
    const metaRaw    = data.Metascore
    const metacritic = metaRaw && metaRaw !== 'N/A' ? Number(metaRaw) : null
    const awards     = data.Awards && data.Awards !== 'N/A' ? (data.Awards as string) : null

    const result: OMDBRatings = { imdbScore, imdbVotes, rtCritics, metacritic, awards }
    return NextResponse.json(result)
  } catch {
    return NextResponse.json(EMPTY)
  }
}
