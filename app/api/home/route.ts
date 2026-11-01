import { NextRequest, NextResponse } from 'next/server'
import {
  getUpcomingMovies,
  getProviderMovies,
  getProviderTV,
} from '@/lib/tmdb'
import { COUNTRIES } from '@/lib/countries'
import { PLATAFORMAS_DE_RESPALDO, plataformasParaOfrecer } from '@/lib/plataformas-pais'

/** Cuántas plataformas del país tienen carrusel en el inicio: las más populares. */
const CARRUSELES = 9

interface RawMovie {
  id: number; title: string; poster_path: string | null
  backdrop_path: string | null; release_date: string
  overview: string; vote_average: number
}
interface RawTV {
  id: number; name: string; poster_path: string | null
  first_air_date: string; vote_average?: number
}

export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get('country') ?? 'AR'

  // Validate country code — only allow known ones
  if (!COUNTRIES.find(c => c.code === country)) {
    return NextResponse.json({ error: 'Unknown country' }, { status: 400 })
  }

  const lista = (await plataformasParaOfrecer(country).catch(() => PLATAFORMAS_DE_RESPALDO)).filter(p => p.destacada)
  const carruseles = lista.slice(0, CARRUSELES)

  // Use Promise.allSettled so one TMDB failure doesn't kill all platform data
  const [upcomingResult, platformResults] = await Promise.all([
    getUpcomingMovies(country).catch(() => ({ results: [] })),
    Promise.allSettled(
      carruseles.map(p => {
        const ids = p.ids.join('|')
        return Promise.all([getProviderMovies(ids, country), getProviderTV(ids, country)])
      })
    ),
  ])

  const upcomingMovies = ((upcomingResult.results ?? []) as RawMovie[])
    .filter(m => m.backdrop_path)
    .slice(0, 10)

  const platformsWithLogos = lista.map(p => ({
    id: p.id, slug: p.slug, name: p.name, color: p.color,
    logoPath: p.logoPath ?? p.fallbackLogoPath ?? null,
  }))

  const platformContent = carruseles.map((p, i) => {
    const platform = { id: p.id, name: p.name, color: p.color }
    const result = platformResults[i]
    if (result.status === 'rejected') return { ...platform, items: [] }
    const [moviesData, tvData] = result.value
    const movies = ((moviesData.results ?? []) as RawMovie[]).map(m => ({
      id: m.id, title: m.title, posterPath: m.poster_path,
      mediaType: 'movie' as const, date: m.release_date ?? '',
      year: (m.release_date ?? '').slice(0, 4), voteAverage: m.vote_average ?? 0,
    }))
    const tv = ((tvData.results ?? []) as RawTV[]).map(t => ({
      id: t.id, title: t.name, posterPath: t.poster_path,
      mediaType: 'tv' as const, date: t.first_air_date ?? '',
      year: (t.first_air_date ?? '').slice(0, 4), voteAverage: t.vote_average ?? 0,
    }))
    const items = [...movies, ...tv]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20)
    return { ...platform, items }
  })

  return NextResponse.json(
    { upcomingMovies, platformsWithLogos, platformContent },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  )
}
