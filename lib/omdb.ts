const OMDB_KEY = process.env.OMDB_API_KEY

export interface OMDBRatings {
  imdbScore: string | null   // "8.1"
  imdbVotes: string | null   // "2,345,678"
  rtCritics: string | null   // "91%"  (critics Tomatometer — free tier only)
  metacritic: number | null  // 74
}

const EMPTY: OMDBRatings = {
  imdbScore: null,
  imdbVotes: null,
  rtCritics: null,
  metacritic: null,
}

export async function getOMDBRatings(imdbId: string | null | undefined): Promise<OMDBRatings> {
  if (!OMDB_KEY || !imdbId) return EMPTY

  try {
    const res = await fetch(
      `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${imdbId}`,
      { next: { revalidate: 86400 } }, // cache 24 h — ratings are stable
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

    return { imdbScore, imdbVotes, rtCritics, metacritic }
  } catch {
    return EMPTY
  }
}
