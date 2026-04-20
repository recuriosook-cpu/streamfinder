import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

// ── Genre id → Spanish name ────────────────────────────────────────────────
const GENRE_MAP: Record<number, string> = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
  14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia ficción',
  10770: 'Película de TV', 53: 'Suspenso', 10752: 'Bélica', 37: 'Western',
  10759: 'Acción y aventura', 10762: 'Infantil', 10763: 'Noticias',
  10764: 'Reality', 10765: 'Sci-Fi y fantasía', 10766: 'Telenovela',
  10767: 'Talk show', 10768: 'Guerra y política',
}

// ── Simple concurrency limiter ─────────────────────────────────────────────
async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0

  async function worker() {
    while (next < tasks.length) {
      const idx = next++
      results[idx] = await tasks[idx]()
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

// ── Safe TMDB fetch (returns null on error) ────────────────────────────────
async function tmdb(path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3${path}?api_key=${KEY}&language=es-AR`,
      { next: { revalidate: 3600 } },
    )
    return res.ok ? res.json() : null
  } catch {
    return null
  }
}

interface WatchedRow {
  media_id: number
  media_type: 'movie' | 'tv'
  watched_at: string
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 })

  const supabase = createServerClient()

  // ── Fetch watched list ────────────────────────────────────────────────────
  const { data: watched } = await supabase
    .from('watched')
    .select('media_id, media_type, watched_at')
    .eq('user_id', userId)
    .order('watched_at', { ascending: false })

  const rows: WatchedRow[] = (watched ?? []) as WatchedRow[]

  if (rows.length < 3) {
    return NextResponse.json({ tooFew: true })
  }

  const now       = new Date()
  const thisYear  = now.getFullYear()
  const thisMonth = now.getMonth() // 0-indexed
  const yearStr   = `${thisYear}-01-01`
  const monthStr  = `${thisYear}-${String(thisMonth + 1).padStart(2, '0')}-01`

  // ── Fetch TMDB details + credits for every item in parallel ──────────────
  type ItemData = {
    row: WatchedRow
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    credits: any
  }

  const tasks = rows.map(row => async (): Promise<ItemData> => {
    const [details, credits] = await Promise.all([
      tmdb(`/${row.media_type}/${row.media_id}`),
      tmdb(`/${row.media_type}/${row.media_id}/credits`),
    ])
    return { row, details, credits }
  })

  const items = await withConcurrency(tasks, 15)

  // ── Compute metrics ───────────────────────────────────────────────────────
  let totalMinutes   = 0
  let minutesMonth   = 0
  let minutesYear    = 0

  const genreCount:    Record<string, number> = {}
  const decadeCount:   Record<string, number> = {}
  const langCount:     Record<string, number> = {}
  const actorCount:    Record<string, { name: string; profilePath: string | null; count: number }> = {}
  const actressCount:  Record<string, { name: string; profilePath: string | null; count: number }> = {}
  const directorCount: Record<string, { name: string; profilePath: string | null; count: number }> = {}

  const LANG_MAP: Record<string, string> = {
    en: 'Inglés', es: 'Español', fr: 'Francés', ko: 'Coreano',
    ja: 'Japonés', it: 'Italiano', de: 'Alemán', pt: 'Portugués',
    zh: 'Chino', hi: 'Hindi',
  }

  for (const { row, details, credits } of items) {
    if (!details) continue

    // ── Runtime ──────────────────────────────────────────────────
    let minutes = 0
    if (row.media_type === 'movie') {
      minutes = (details.runtime as number) ?? 0
    } else {
      const epTime   = (details.episode_run_time as number[])?.[0] ?? 0
      const epCount  = (details.number_of_episodes as number) ?? 0
      minutes = epTime * epCount
    }

    totalMinutes += minutes

    const watchedAt = row.watched_at
    if (watchedAt >= yearStr)  minutesYear  += minutes
    if (watchedAt >= monthStr) minutesMonth += minutes

    // ── Genres ───────────────────────────────────────────────────
    const genres = (details.genres as { id: number; name: string }[]) ?? []
    for (const g of genres) {
      const name = GENRE_MAP[g.id] ?? g.name
      genreCount[name] = (genreCount[name] ?? 0) + 1
    }

    // ── Decade ───────────────────────────────────────────────────
    const releaseDate = (details.release_date ?? details.first_air_date ?? '') as string
    if (releaseDate.length >= 4) {
      const year = parseInt(releaseDate.slice(0, 4))
      if (!isNaN(year)) {
        const decade = `${Math.floor(year / 10) * 10}s`
        decadeCount[decade] = (decadeCount[decade] ?? 0) + 1
      }
    }

    // ── Language ──────────────────────────────────────────────────
    const lang = (details.original_language as string) ?? ''
    if (lang) {
      const langName = LANG_MAP[lang] ?? 'Otro'
      langCount[langName] = (langCount[langName] ?? 0) + 1
    }

    // ── Cast & crew ───────────────────────────────────────────────
    if (!credits) continue

    const cast = (credits.cast as {
      id: number; name: string; profile_path: string | null
      gender: number; order: number
    }[]) ?? []

    for (const member of cast) {
      if (member.order >= 10) continue
      const key = String(member.id)
      if (member.gender === 2) {
        const prev = actorCount[key]
        actorCount[key] = { name: member.name, profilePath: member.profile_path ?? null, count: (prev?.count ?? 0) + 1 }
      } else if (member.gender === 1) {
        const prev = actressCount[key]
        actressCount[key] = { name: member.name, profilePath: member.profile_path ?? null, count: (prev?.count ?? 0) + 1 }
      }
    }

    const crew = (credits.crew as {
      id: number; name: string; profile_path: string | null; job: string
    }[]) ?? []

    for (const member of crew) {
      if (member.job !== 'Director') continue
      const key = String(member.id)
      const prev = directorCount[key]
      directorCount[key] = { name: member.name, profilePath: member.profile_path ?? null, count: (prev?.count ?? 0) + 1 }
    }
  }

  // ── Top genres (top 3) ────────────────────────────────────────────────────
  const topGenres = Object.entries(genreCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  // ── Decades (all, sorted desc by count) ──────────────────────────────────
  const topDecades = Object.entries(decadeCount)
    .map(([decade, count]) => ({ decade, count }))
    .sort((a, b) => b.count - a.count)

  // ── Languages (top 5 + Otros) ─────────────────────────────────────────────
  const totalLangItems = Object.values(langCount).reduce((a, b) => a + b, 0)
  const sortedLangs = Object.entries(langCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  const top5 = sortedLangs.slice(0, 5)
  const othersCount = sortedLangs.slice(5).reduce((s, l) => s + l.count, 0)
  if (othersCount > 0) top5.push({ name: 'Otros', count: othersCount })

  const topLanguages = top5.map(l => ({
    name: l.name,
    count: l.count,
    pct: Math.round((l.count / totalLangItems) * 100),
  }))

  // ── Top actor / actress / director ────────────────────────────────────────
  function topEntry(map: typeof actorCount) {
    const entries = Object.entries(map)
    if (entries.length === 0) return null
    const [id, data] = entries.sort((a, b) => b[1].count - a[1].count)[0]
    return { id: Number(id), ...data }
  }

  const topActor    = topEntry(actorCount)
  const topActress  = topEntry(actressCount)
  const topDirector = topEntry(directorCount)

  return NextResponse.json({
    tooFew:       false,
    totalMinutes,
    minutesMonth,
    minutesYear,
    topGenres,
    topDecades,
    topLanguages,
    topActor,
    topActress,
    topDirector,
  }, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
