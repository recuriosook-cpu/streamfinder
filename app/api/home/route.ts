import { NextRequest, NextResponse } from 'next/server'
import {
  getUpcomingMovies,
  getProviderMovies,
  getProviderTV,
  getRegionProviders,
} from '@/lib/tmdb'
import { ALL_PLATFORMS } from '@/lib/providers'
import { COUNTRIES } from '@/lib/countries'

const CAROUSEL_PLATFORMS = [
  { id: 8,   name: 'Netflix',      color: '#E50914' },
  { id: 337, name: 'Disney+',      color: '#113CCF' },
  { id: 119, name: 'Amazon Prime', color: '#00A8E0' },
  { id: 384, name: 'Max',          color: '#5822B4' },
  { id: 531, name: 'Paramount+',   color: '#0064FF' },
  { id: 350, name: 'Apple TV+',    color: '#444444' },
  { id: 283, name: 'Crunchyroll',  color: '#F47521' },
  { id: 300, name: 'Pluto TV',     color: '#00C8FA' },
  { id: 467, name: 'DIRECTV Go',   color: '#00A0D1' },
]

interface RawMovie {
  id: number; title: string; poster_path: string | null
  backdrop_path: string | null; release_date: string
  overview: string; vote_average: number
}
interface RawTV {
  id: number; name: string; poster_path: string | null
  first_air_date: string
}

export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get('country') ?? 'AR'

  // Validate country code — only allow known ones
  if (!COUNTRIES.find(c => c.code === country)) {
    return NextResponse.json({ error: 'Unknown country' }, { status: 400 })
  }

  // Use Promise.allSettled so one TMDB failure doesn't kill all platform data
  const [upcomingResult, platformResults, regionResult] = await Promise.all([
    getUpcomingMovies(country).catch(() => ({ results: [] })),
    Promise.allSettled(
      CAROUSEL_PLATFORMS.map(p =>
        Promise.all([getProviderMovies(p.id, country), getProviderTV(p.id, country)])
      )
    ),
    getRegionProviders(country).catch(() => []),
  ])

  const upcomingMovies = ((upcomingResult.results ?? []) as RawMovie[])
    .filter(m => m.backdrop_path)
    .slice(0, 10)

  const regionProviders = Array.isArray(regionResult) ? regionResult : []
  const logoMap = new Map<number, string>(
    regionProviders.map((p: { provider_id: number; logo_path: string }) => [p.provider_id, p.logo_path])
  )
  const platformsWithLogos = ALL_PLATFORMS.map(p => ({
    ...p,
    logoPath: logoMap.get(p.id) ?? p.fallbackLogoPath ?? null,
  }))

  const platformContent = CAROUSEL_PLATFORMS.map((platform, i) => {
    const result = platformResults[i]
    if (result.status === 'rejected') return { ...platform, items: [] }
    const [moviesData, tvData] = result.value
    const movies = ((moviesData.results ?? []) as RawMovie[]).map(m => ({
      id: m.id, title: m.title, posterPath: m.poster_path,
      mediaType: 'movie' as const, date: m.release_date ?? '',
    }))
    const tv = ((tvData.results ?? []) as RawTV[]).map(t => ({
      id: t.id, title: t.name, posterPath: t.poster_path,
      mediaType: 'tv' as const, date: t.first_air_date ?? '',
    }))
    const items = [...movies, ...tv]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20)
    return { ...platform, items }
  })

  return NextResponse.json({ upcomingMovies, platformsWithLogos, platformContent })
}
