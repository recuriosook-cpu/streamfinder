import { NextResponse } from 'next/server'

const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

export interface BirthdayPerson {
  id: number
  name: string
  profilePath: string | null
  age: number
  popularity: number
}

export async function GET() {
  const today      = new Date()
  const todayMonth = today.getMonth() + 1
  const todayDay   = today.getDate()
  const todayYear  = today.getFullYear()

  // ── Step 1: Fetch 5 pages of popular people ──────────────────
  const pageNums = [1, 2, 3, 4, 5]
  const pagesData = await Promise.all(
    pageNums.map(page =>
      fetch(
        `https://api.themoviedb.org/3/person/popular?api_key=${API_KEY}&language=es-AR&page=${page}`,
        { next: { revalidate: 43200 } } // 12 h
      )
        .then(r => r.json())
        .catch(() => ({ results: [] }))
    )
  )
  const people = pagesData.flatMap(d =>
    (d.results ?? []) as Array<{ id: number; name: string; profile_path: string | null; popularity: number }>
  )

  // ── Step 2: Fetch person details in parallel ─────────────────
  // Individual detail calls are cached 24 h, so after the first
  // daily request this endpoint is near-instant.
  const details = await Promise.all(
    people.map(p =>
      fetch(
        `https://api.themoviedb.org/3/person/${p.id}?api_key=${API_KEY}&language=es-AR`,
        { next: { revalidate: 86400 } } // 24 h
      )
        .then(r => r.json())
        .catch(() => null)
    )
  )

  // ── Step 3: Filter by today's day + month ────────────────────
  const birthdays: BirthdayPerson[] = details
    .filter(Boolean)
    .filter(p => {
      if (!p.birthday) return false
      const parts = p.birthday.split('-')
      if (parts.length < 3) return false
      return Number(parts[1]) === todayMonth && Number(parts[2]) === todayDay
    })
    .map(p => ({
      id:          p.id,
      name:        p.name,
      profilePath: p.profile_path,
      popularity:  p.popularity,
      age:         todayYear - Number(p.birthday.split('-')[0]),
    }))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 20)

  return NextResponse.json(
    { birthdays },
    { headers: { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400' } }
  )
}
