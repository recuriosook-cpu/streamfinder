import { NextResponse } from 'next/server'

const API_KEY  = process.env.NEXT_PUBLIC_TMDB_API_KEY
const BASE_URL = 'https://api.themoviedb.org/3'

export interface BirthdayPerson {
  id:          number
  name:        string
  profilePath: string | null
  age:         number
  popularity:  number
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Fetch with a per-call timeout so one slow TMDB call doesn't stall the batch. */
async function tmdb(path: string, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE_URL}${path}?api_key=${API_KEY}&language=es-AR`, {
      signal: controller.signal,
      cache:  'no-store', // always fresh — we cache at the response level below
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch one page of popular people and return the results array. */
async function fetchPopularPage(page: number): Promise<Array<{ id: number; popularity: number }>> {
  const data = await tmdb(`/person/popular?page=${page}`) as { results?: Array<{ id: number; popularity: number }> } | null
  return data?.results ?? []
}

/** Fetch a single person's details (birthday etc.). */
async function fetchPersonDetail(id: number): Promise<{
  id: number; name: string; profile_path: string | null
  birthday: string | null; popularity: number
} | null> {
  return tmdb(`/person/${id}`) as Promise<{
    id: number; name: string; profile_path: string | null
    birthday: string | null; popularity: number
  } | null>
}

/** Returns true when the birthday string (YYYY-MM-DD) matches the given month and day. */
function birthdayMatchesToday(birthday: string | null, month: number, day: number): boolean {
  if (!birthday) return false
  const parts = birthday.split('-')
  if (parts.length < 3) return false
  return Number(parts[1]) === month && Number(parts[2]) === day
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET() {
  const today      = new Date()
  const todayMonth = today.getMonth() + 1   // 1-indexed
  const todayDay   = today.getDate()
  const todayYear  = today.getFullYear()

  async function searchPages(pages: number[]): Promise<BirthdayPerson[]> {
    // Step 1 — fetch all requested popular-person pages in parallel
    const popularResults = await Promise.all(pages.map(fetchPopularPage))
    const people         = popularResults.flat()

    // Step 2 — fetch every person's detail in parallel (Promise.all, not sequential)
    const details = await Promise.all(people.map(p => fetchPersonDetail(p.id)))

    // Step 3 — filter by today's day + month, then sort and shape
    return details
      .filter(
        (p): p is NonNullable<typeof p> =>
          p !== null && birthdayMatchesToday(p.birthday, todayMonth, todayDay)
      )
      .map(p => ({
        id:          p.id,
        name:        p.name,
        profilePath: p.profile_path,
        popularity:  p.popularity,
        age:         todayYear - Number(p.birthday!.split('-')[0]),
      }))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 20)
  }

  // First attempt: pages 1-5 (~100 people)
  let birthdays = await searchPages([1, 2, 3, 4, 5])

  // Fallback: pages 6-10 if no matches found
  if (birthdays.length === 0) {
    birthdays = await searchPages([6, 7, 8, 9, 10])
  }

  return NextResponse.json(
    { birthdays },
    // Cache for 1 hour at the CDN; if still empty, re-check sooner via stale-while-revalidate
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=3600' } }
  )
}
