import { getUpcomingMovies, getProviderMovies, getProviderTV, getARProviders } from '@/lib/tmdb'
import { ALL_PLATFORMS } from '@/lib/providers'
import HeroCarousel from '@/components/HeroCarousel'
import PlatformCarousel from '@/components/PlatformCarousel'
import PlatformLogoStrip from '@/components/PlatformLogoStrip'

const CAROUSEL_PLATFORMS = [
  { id: 8,   name: 'Netflix',       color: '#E50914' },
  { id: 337, name: 'Disney+',       color: '#113CCF' },
  { id: 119, name: 'Amazon Prime',  color: '#00A8E0' },
  { id: 384, name: 'Max',           color: '#5822B4' },
  { id: 531, name: 'Paramount+',    color: '#0064FF' },
  { id: 350, name: 'Apple TV+',     color: '#444444' },
]

interface RawMovie {
  id: number
  title: string
  poster_path: string | null
  release_date: string
}

interface RawTV {
  id: number
  name: string
  poster_path: string | null
  first_air_date: string
}

function processProviderContent(
  moviesData: { results?: RawMovie[] },
  tvData: { results?: RawTV[] }
) {
  const movies = (moviesData.results ?? []).map(m => ({
    id: m.id,
    title: m.title,
    posterPath: m.poster_path,
    mediaType: 'movie' as const,
    date: m.release_date ?? '',
  }))
  const tv = (tvData.results ?? []).map(t => ({
    id: t.id,
    title: t.name,
    posterPath: t.poster_path,
    mediaType: 'tv' as const,
    date: t.first_air_date ?? '',
  }))
  return [...movies, ...tv]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
}

export default async function Home() {
  const [upcomingData, platformData, arProviders] = await Promise.all([
    getUpcomingMovies(),
    Promise.all(
      CAROUSEL_PLATFORMS.map(p =>
        Promise.all([getProviderMovies(p.id), getProviderTV(p.id)])
      )
    ),
    getARProviders(),
  ])

  const upcomingMovies = (upcomingData.results ?? [])
    .filter((m: { backdrop_path: string | null }) => m.backdrop_path)
    .slice(0, 10)

  // Build logo map from TMDB providers
  const logoMap = new Map<number, string>(
    arProviders.map((p: { provider_id: number; logo_path: string }) => [p.provider_id, p.logo_path])
  )
  const platformsWithLogos = ALL_PLATFORMS.map(p => ({
    ...p,
    logoPath: logoMap.get(p.id) ?? null,
  }))

  const platformContent = CAROUSEL_PLATFORMS.map((platform, i) => {
    const [moviesData, tvData] = platformData[i]
    return {
      ...platform,
      items: processProviderContent(moviesData, tvData),
    }
  })

  return (
    <>
      <HeroCarousel movies={upcomingMovies} />

      <PlatformLogoStrip platforms={platformsWithLogos} />

      <div className="max-w-7xl mx-auto px-4 py-10">
        {platformContent.map(platform => (
          <PlatformCarousel
            key={platform.id}
            name={platform.name}
            color={platform.color}
            items={platform.items}
          />
        ))}
      </div>
    </>
  )
}
