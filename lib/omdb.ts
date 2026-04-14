const OMDB_KEY = process.env.OMDB_API_KEY

export interface OMDBRatings {
  imdbScore: string | null   // "8.1"
  imdbVotes: string | null   // "2,345,678"
  rtCritics: string | null   // "91%"  (critics Tomatometer — free tier only)
  metacritic: number | null  // 74
  awards: string | null      // "Won 4 Oscars. 152 wins & 234 nominations."
}

const EMPTY: OMDBRatings = {
  imdbScore: null,
  imdbVotes: null,
  rtCritics: null,
  metacritic: null,
  awards: null,
}

export async function getOMDBRatings(imdbId: string | null | undefined): Promise<OMDBRatings> {
  if (!OMDB_KEY || !imdbId) return EMPTY

  try {
    const res = await fetch(
      `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${imdbId}`,
      { next: { revalidate: 86400 } },
    )
    if (!res.ok) return EMPTY
    const data = await res.json()
    if (data.Response === 'False') return EMPTY

    const imdbScore =
      data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null
    const imdbVotes =
      data.imdbVotes && data.imdbVotes !== 'N/A' ? data.imdbVotes : null

    const rtEntry = (data.Ratings as { Source: string; Value: string }[] | undefined)
      ?.find(r => r.Source === 'Rotten Tomatoes')
    const rtCritics = rtEntry ? rtEntry.Value : null

    const metaRaw = data.Metascore
    const metacritic =
      metaRaw && metaRaw !== 'N/A' ? Number(metaRaw) : null

    const awards =
      data.Awards && data.Awards !== 'N/A' ? (data.Awards as string) : null

    return { imdbScore, imdbVotes, rtCritics, metacritic, awards }
  } catch {
    return EMPTY
  }
}

// ── Awards parsing ───────────────────────────────────────────────

export interface ParsedAwards {
  oscarWins: number
  oscarNominations: number
  totalWins: number
  totalNominations: number
  rawText: string
}

export function parseAwards(text: string | null): ParsedAwards | null {
  if (!text) return null

  // "Won 4 Oscars." or "Won 1 Oscar."
  const oscarWinsMatch = text.match(/Won (\d+) Oscar/i)
  // "Nominated for 3 Oscars." or "Nominated for 1 Oscar."
  const oscarNomsMatch = text.match(/Nominated for (\d+) Oscar/i)
  // "152 wins" — also catches the Oscar wins themselves
  const totalWinsMatch = text.match(/(\d+)\s+win/i)
  // "234 nominations"
  const totalNomsMatch = text.match(/(\d+)\s+nomination/i)

  const oscarWins = oscarWinsMatch ? Number(oscarWinsMatch[1]) : 0
  const oscarNominations = oscarNomsMatch ? Number(oscarNomsMatch[1]) : 0
  // OMDB "X wins" count already includes Oscar wins in the total
  const totalWins = totalWinsMatch ? Number(totalWinsMatch[1]) : oscarWins
  const totalNominations = totalNomsMatch ? Number(totalNomsMatch[1]) : oscarNominations

  if (totalWins === 0 && totalNominations === 0 && oscarWins === 0 && oscarNominations === 0) {
    return null
  }

  return { oscarWins, oscarNominations, totalWins, totalNominations, rawText: text }
}
