const OMDB_KEY = process.env.OMDB_API_KEY

export interface OMDBRatings {
  imdbScore: string | null
  imdbVotes: string | null
  rtCritics: string | null
  metacritic: number | null
  awards: string | null
}

const EMPTY: OMDBRatings = {
  imdbScore: null, imdbVotes: null,
  rtCritics: null, metacritic: null, awards: null,
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

    const imdbScore  = data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null
    const imdbVotes  = data.imdbVotes  && data.imdbVotes  !== 'N/A' ? data.imdbVotes  : null
    const rtEntry    = (data.Ratings as { Source: string; Value: string }[] | undefined)
      ?.find(r => r.Source === 'Rotten Tomatoes')
    const rtCritics  = rtEntry ? rtEntry.Value : null
    const metaRaw    = data.Metascore
    const metacritic = metaRaw && metaRaw !== 'N/A' ? Number(metaRaw) : null
    const awards     = data.Awards && data.Awards !== 'N/A' ? (data.Awards as string) : null

    return { imdbScore, imdbVotes, rtCritics, metacritic, awards }
  } catch {
    return EMPTY
  }
}

// ── Awards parsing ───────────────────────────────────────────────

export interface AwardEntry {
  name: string        // "Oscar", "BAFTA", "Golden Globe", …
  wins: number
  nominations: number
  isOscar: boolean
}

export interface ParsedAwards {
  entries: AwardEntry[]
  rawText: string
}

/** Map raw TMDB award strings to a canonical display name */
function normalizeAwardName(raw: string): string {
  const s = raw.trim()
  // Order matters: more specific patterns first
  if (/primetime emmy|emmy award|emmys?\b/i.test(s)) return 'Emmy'
  if (/oscar/i.test(s))                               return 'Oscar'
  if (/bafta/i.test(s))                               return 'BAFTA'
  if (/golden globe/i.test(s))                        return 'Golden Globe'
  if (/screen actors guild|sag award/i.test(s))       return 'SAG Award'
  if (/critics.?choice/i.test(s))                     return "Critics' Choice"
  if (/directors guild/i.test(s))                     return 'DGA Award'
  if (/writers guild/i.test(s))                       return 'WGA Award'
  if (/c[eé]sar/i.test(s))                            return 'César'
  if (/saturn award/i.test(s))                        return 'Saturn Award'
  if (/independent spirit/i.test(s))                  return 'Spirit Award'
  if (/peoples? choice/i.test(s))                     return "People's Choice"
  if (/mtv movie/i.test(s))                           return 'MTV Movie Award'
  if (/teen choice/i.test(s))                         return 'Teen Choice Award'
  if (/annie award/i.test(s))                         return 'Annie Award'
  if (/cannes/i.test(s))                              return 'Cannes'
  if (/venice/i.test(s))                              return 'Venecia'
  if (/berlin/i.test(s))                              return 'Berlín'
  // Fallback: strip generic suffixes, keep meaningful words
  const cleaned = s
    .replace(/\b(Award|Awards|Film|Films|Ceremonies?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || s
}

export function parseAwards(text: string | null): ParsedAwards | null {
  if (!text || text === 'N/A') return null

  const map = new Map<string, { wins: number; noms: number }>()

  const sentences = text.split(/\.(?:\s+|$)/).map(s => s.trim()).filter(Boolean)

  for (const sentence of sentences) {
    // "Won X [Award name]"  (e.g. "Won 4 Oscars")
    const wonNum = sentence.match(/^Won (\d+) (.+)$/i)
    if (wonNum) {
      const name = normalizeAwardName(wonNum[2])
      const cur = map.get(name) ?? { wins: 0, noms: 0 }
      map.set(name, { ...cur, wins: cur.wins + Number(wonNum[1]) })
      continue
    }

    // "Won a/an [Award name]"  (e.g. "Won a Golden Globe")
    const wonArticle = sentence.match(/^Won an? (.+)$/i)
    if (wonArticle) {
      const name = normalizeAwardName(wonArticle[1])
      const cur = map.get(name) ?? { wins: 0, noms: 0 }
      map.set(name, { ...cur, wins: cur.wins + 1 })
      continue
    }

    // "Nominated for X [Award name]"
    const nomNum = sentence.match(/^Nominated for (\d+) (.+)$/i)
    if (nomNum) {
      const name = normalizeAwardName(nomNum[2])
      const cur = map.get(name) ?? { wins: 0, noms: 0 }
      map.set(name, { ...cur, noms: cur.noms + Number(nomNum[1]) })
      continue
    }

    // "Nominated for a/an [Award name]"
    const nomArticle = sentence.match(/^Nominated for an? (.+)$/i)
    if (nomArticle) {
      const name = normalizeAwardName(nomArticle[1])
      const cur = map.get(name) ?? { wins: 0, noms: 0 }
      map.set(name, { ...cur, noms: cur.noms + 1 })
      continue
    }

    // "Another X wins & Y nominations" OR "X wins & Y nominations"
    // catch-all bucket for prizes OMDB doesn't name individually
    const otherMatch = sentence.match(/(?:Another )?(\d+) wins? & (\d+) nominations?/i)
    if (otherMatch) {
      const wins = Number(otherMatch[1])
      const noms = Number(otherMatch[2])
      if (wins > 0 || noms > 0) {
        const key = map.size > 0 ? 'Otros premios' : 'Premios'
        const cur = map.get(key) ?? { wins: 0, noms: 0 }
        map.set(key, { wins: cur.wins + wins, noms: cur.noms + noms })
      }
    }
  }

  if (map.size === 0) return null

  const entries: AwardEntry[] = Array.from(map.entries()).map(([name, { wins, noms }]) => ({
    name,
    wins,
    nominations: noms,
    isOscar: name === 'Oscar',
  }))

  // Sort: Oscar first, then by wins desc, nominations desc, "Otros" last
  entries.sort((a, b) => {
    if (a.isOscar && !b.isOscar) return -1
    if (!a.isOscar && b.isOscar) return 1
    if (a.name === 'Otros premios') return 1
    if (b.name === 'Otros premios') return -1
    if (b.wins !== a.wins) return b.wins - a.wins
    return b.nominations - a.nominations
  })

  return { entries, rawText: text }
}
