import { NextResponse } from 'next/server'
import { BIRTHDAYS } from '@/lib/celebrity-birthdays'

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
  const month = now.getMonth() + 1   // 1-indexed
  const day   = now.getDate()
  const year  = now.getFullYear()

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
      if (!d) {
        // TMDB unavailable — return local data with placeholder
        return {
          id:          local.id,
          name:        local.name,
          profilePath: null,
          age:         year - Number(local.birthday.split('-')[0]),
          popularity:  0,
        }
      }
      return {
        id:          d.id  as number,
        name:        d.name as string,
        profilePath: (d.profile_path as string | null) ?? null,
        age:         year - Number(local.birthday.split('-')[0]),
        popularity:  (d.popularity as number) ?? 0,
      }
    })
    .sort((a, b) => b.popularity - a.popularity)

  return NextResponse.json(
    { birthdays },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=3600' } }
  )
}
