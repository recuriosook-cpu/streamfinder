// ── Types ────────────────────────────────────────────────────────

export interface OMDBRatings {
  imdbScore: string | null
  imdbVotes: string | null
  rtCritics: string | null
  metacritic: number | null
  awards: string | null
}

export interface AwardEntry {
  name: string
  wins: number
  nominations: number
  isOscar: boolean
}

export interface ParsedAwards {
  entries: AwardEntry[]
  rawText: string
}

// ── Fetch via internal API route ─────────────────────────────────
// The actual OMDB_API_KEY lives in app/api/omdb/route.ts (server-only).
// Calling through the API route ensures the key is never bundled into
// client code, regardless of where getOMDBRatings is called from.

const EMPTY: OMDBRatings = {
  imdbScore: null, imdbVotes: null,
  rtCritics: null, metacritic: null, awards: null,
}

function baseUrl(): string {
  // Vercel sets VERCEL_URL (without protocol) for all deployments
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  // Custom domain / local dev
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  return 'http://localhost:3000'
}

export async function getOMDBRatings(
  imdbId: string | null | undefined,
): Promise<OMDBRatings> {
  if (!imdbId) return EMPTY
  try {
    const res = await fetch(
      `${baseUrl()}/api/omdb?imdbId=${encodeURIComponent(imdbId)}`,
      { next: { revalidate: 86400 } },
    )
    if (!res.ok) return EMPTY
    return (await res.json()) as OMDBRatings
  } catch {
    return EMPTY
  }
}

// ── Awards parsing ────────────────────────────────────────────────

function normalizeAwardName(raw: string): string {
  const s = raw.trim()
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
    const wonNum = sentence.match(/^Won (\d+) (.+)$/i)
    if (wonNum) {
      const name = normalizeAwardName(wonNum[2])
      const cur = map.get(name) ?? { wins: 0, noms: 0 }
      map.set(name, { ...cur, wins: cur.wins + Number(wonNum[1]) })
      continue
    }

    const wonArticle = sentence.match(/^Won an? (.+)$/i)
    if (wonArticle) {
      const name = normalizeAwardName(wonArticle[1])
      const cur = map.get(name) ?? { wins: 0, noms: 0 }
      map.set(name, { ...cur, wins: cur.wins + 1 })
      continue
    }

    const nomNum = sentence.match(/^Nominated for (\d+) (.+)$/i)
    if (nomNum) {
      const name = normalizeAwardName(nomNum[2])
      const cur = map.get(name) ?? { wins: 0, noms: 0 }
      map.set(name, { ...cur, noms: cur.noms + Number(nomNum[1]) })
      continue
    }

    const nomArticle = sentence.match(/^Nominated for an? (.+)$/i)
    if (nomArticle) {
      const name = normalizeAwardName(nomArticle[1])
      const cur = map.get(name) ?? { wins: 0, noms: 0 }
      map.set(name, { ...cur, noms: cur.noms + 1 })
      continue
    }

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
    name, wins, nominations: noms, isOscar: name === 'Oscar',
  }))

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
