import { NextResponse } from "next/server"
import { CELEBRITY_BIRTHDAYS } from "@/lib/celebrity-birthdays"

const KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const month = parseInt(searchParams.get("month") ?? "0", 10)
  const day = parseInt(searchParams.get("day") ?? "0", 10)
  const year = new Date().getFullYear()

  if (!month || !day) return NextResponse.json({ birthdays: [] })

  const todayEntries = CELEBRITY_BIRTHDAYS.filter(c => {
    const parts = c.birthday.split("-")
    return Number(parts[1]) === month && Number(parts[2]) === day
  })

  if (todayEntries.length === 0) {
    return NextResponse.json({ birthdays: [] }, { headers: { "Cache-Control": "no-store" } })
  }

  const details = await Promise.all(
    todayEntries.map(c =>
      fetch(`https://api.themoviedb.org/3/person/${c.id}?api_key=${KEY}&language=es-AR`, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    )
  )

  const birthdays = details.map((d, i) => {
    const local = todayEntries[i]
    const birthYear = Number(local.birthday.split("-")[0])
    if (!d) return { id: local.id, name: local.name, profilePath: null, age: year - birthYear, popularity: local.popularity, deceased: false }
    const deceased = !!(d.deathday)
    const age = deceased ? Number(d.deathday.split("-")[0]) - birthYear : year - birthYear
    return { id: d.id, name: d.name, profilePath: d.profile_path ?? null, age, popularity: d.popularity ?? local.popularity, deceased }
  }).sort((a, b) => b.popularity - a.popularity)

  return NextResponse.json({ birthdays }, { headers: { "Cache-Control": "no-store" } })
}
