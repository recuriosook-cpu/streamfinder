import { NextResponse } from 'next/server'

const KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

export interface BirthdayPerson {
  id:          number
  name:        string
  profilePath: string | null
  age:         number
  popularity:  number
}

export async function GET() {
  const now   = new Date()
  const month = now.getMonth() + 1   // 1-indexed (1=Jan … 12=Dec)
  const day   = now.getDate()
  const year  = now.getFullYear()

  // ── Step 1: Fetch pages 1, 2, 3 of popular people in parallel ──
  const pageResults = await Promise.all(
    [1, 2, 3].map(page =>
      fetch(
        `https://api.themoviedb.org/3/person/popular?api_key=${KEY}&language=es-AR&page=${page}`
      )
        .then(r => r.json())
        .catch(() => ({ results: [] }))
    )
  )

  // Flatten to one array of ~60 people
  const people = pageResults.flatMap(
    p => (p.results ?? []) as Array<{ id: number; popularity: number }>
  )

  // ── Step 2: Fetch all ~60 person details simultaneously ─────────
  // The Next.js server has no browser-style rate limits, so 60
  // parallel outbound fetches to TMDB complete in one round-trip.
  const details = await Promise.all(
    people.map(p =>
      fetch(
        `https://api.themoviedb.org/3/person/${p.id}?api_key=${KEY}&language=es-AR`
      )
        .then(r => r.json())
        .catch(() => null)
    )
  )

  // ── Step 3: Filter by today's month + day (ignore year) ─────────
  // TMDB birthday format: "YYYY-MM-DD"
  const birthdays: BirthdayPerson[] = details
    .filter(p => {
      if (!p?.birthday) return false
      const parts = p.birthday.split('-')
      if (parts.length < 3) return false
      const [, m, d] = parts.map(Number)
      return m === month && d === day
    })
    .map(p => ({
      id:          p.id  as number,
      name:        p.name as string,
      profilePath: (p.profile_path as string | null) ?? null,
      age:         year - Number(p.birthday.split('-')[0]),
      popularity:  p.popularity as number,
    }))
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 20)

  return NextResponse.json({ birthdays })
}
