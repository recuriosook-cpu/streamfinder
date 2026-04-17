import { NextResponse } from 'next/server'
import { BIRTHDAYS } from '@/lib/celebrity-birthdays'

const KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

export interface BirthdayPerson {
  id:          number
  name:        string
  profilePath: string | null
  age:         number
  popularity:  number
  deceased:    boolean
}

export async function GET(request: Request) {
  // Use the client's local date (passed as query params) to avoid UTC offset issues
  const { searchParams } = new URL(request.url)
  const month = parseInt(searchParams.get('month') ?? '0', 10)
  const day   = parseInt(searchParams.get('day')   ?? '0', 10)
  const year  = new Date().getFullYear()

  if (!month || !day) return NextResponse.json({ birthdays: [] })

  // ── Step 1: Filter local index by today's month + day ─────────────────
  const todayEntries = BIRTHDAYS.filter(c => {
    const parts = c.birthday.split('-')
    return Number(parts[1]) === month && Number(parts[2]) === day
  })

  if (todayEntries.length === 0) {
    return NextResponse.json({ birthdays: [] })
  }

  // ── Step 2: Fetch TMDB details only for today's matches (usually 1-5) ──
  const details = await Promise.all(
    todayEntries.map(c =>
      fetch(
        `https://api.themoviedb.org/3/person/${c.id}?api_key=${KEY}&language=es-AR`
      )
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  )

  // ── Step 3: Shape results, falling back to local name if TMDB fails ────
  const birthdays: BirthdayPerson[] = details
    .map((d, i) => {
      const local = todayEntries[i]
      const birthYear = Number(local.birthday.split('-')[0])
      if (!d) {
        // TMDB unavailable — return local data with placeholder
        return {
          id:          local.id,
          name:        local.name,
          profilePath: null,
          age:         year - birthYear,
          popularity:  0,
          deceased:    false,
        }
      }
      const deceased = !!(d.deathday as string | null)
      const age = deceased
        ? Number((d.deathday as string).split('-')[0]) - birthYear
        : year - birthYear
      return {
        id:          d.id  as number,
        name:        d.name as string,
        profilePath: (d.profile_path as string | null) ?? null,
        age,
        popularity:  (d.popularity as number) ?? 0,
        deceased,
      }
    })
    .sort((a, b) => b.popularity - a.popularity)

  return NextResponse.json(
    { birthdays },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=3600' } }
  )
}
