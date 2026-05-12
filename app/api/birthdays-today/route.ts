import { NextResponse } from 'next/server'

const KEY   = process.env.NEXT_PUBLIC_TMDB_API_KEY
const PAGES = 10   // 10 pages × 20 = 200 popular persons
const BATCH = 20   // parallel detail requests per batch
const MAX   = 10   // max birthdays to return

// ── Types ─────────────────────────────────────────────────────────────────────

interface PersonSummary {
  id:           number
  popularity:   number
  profile_path: string | null
}

interface PersonDetail {
  id:           number
  name:         string
  birthday:     string | null
  deathday:     string | null
  profile_path: string | null
  popularity:   number
}

// ── TMDB helpers ──────────────────────────────────────────────────────────────

async function fetchPopularPage(page: number): Promise<PersonSummary[]> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/person/popular?api_key=${KEY}&language=es-AR&page=${page}`,
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []) as PersonSummary[]
  } catch { return [] }
}

async function fetchPersonDetail(id: number): Promise<PersonDetail | null> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/person/${id}?api_key=${KEY}&language=es-AR`,
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) return null
    return res.json() as Promise<PersonDetail>
  } catch { return null }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const now     = new Date()
  const year    = now.getFullYear()
  const todayMD = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // 1. Fetch all 10 popular pages in parallel (each cached 24h by Next.js)
  const pages = await Promise.all(
    Array.from({ length: PAGES }, (_, i) => fetchPopularPage(i + 1))
  )

  // 2. Flatten + deduplicate (TMDB returns them sorted by popularity already)
  const seen    = new Set<number>()
  const persons: PersonSummary[] = []
  for (const page of pages) {
    for (const p of page) {
      if (!seen.has(p.id)) { seen.add(p.id); persons.push(p) }
    }
  }

  // 3. Fetch person details in batches of 20 to avoid rate-limit bursts
  //    Each individual person fetch is cached 24h by Next.js
  const details: (PersonDetail | null)[] = []
  for (let i = 0; i < persons.length; i += BATCH) {
    const batch = await Promise.all(
      persons.slice(i, i + BATCH).map(p => fetchPersonDetail(p.id))
    )
    details.push(...batch)
  }

  // 4. Filter: birthday matches today AND has a profile photo
  const birthdays = details
    .filter((d): d is PersonDetail =>
      !!d && !!d.birthday && !!d.profile_path && d.birthday.slice(5) === todayMD
    )
    .map(d => {
      const birthYear = parseInt(d.birthday!.slice(0, 4))
      const deceased  = !!d.deathday
      const age       = deceased
        ? parseInt(d.deathday!.slice(0, 4)) - birthYear
        : year - birthYear
      return {
        id:          d.id,
        name:        d.name,
        profilePath: d.profile_path,
        age,
        popularity:  d.popularity,
        deceased,
      }
    })
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, MAX)

  return NextResponse.json(
    { birthdays },
    { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400' } }
  )
}
