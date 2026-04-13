import { getPopularMovies, getPopularTV } from '@/lib/tmdb'
import MediaCard from '@/components/MediaCard'
import Link from 'next/link'
import HomeFilters from '@/components/HomeFilters'

interface SearchParams {
  genre?: string
  provider?: string
  tab?: string
}

export default async function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const tab = sp.tab ?? 'movies'

  const [moviesData, tvData] = await Promise.all([
    getPopularMovies(),
    getPopularTV(),
  ])

  const movies = moviesData.results ?? []
  const tvShows = tvData.results ?? []

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Hero */}
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold mb-3">
          Encontrá dónde ver <span className="text-emerald-400">tus películas y series</span>
        </h1>
        <p className="text-zinc-400 text-lg">
          Descubrí en qué plataformas de streaming están disponibles en Argentina
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-zinc-800">
        <Link
          href="/?tab=movies"
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'movies' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Películas Populares
        </Link>
        <Link
          href="/?tab=tv"
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'tv' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Series Populares
        </Link>
        <Link
          href="/?tab=browse"
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            tab === 'browse' ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Explorar
        </Link>
      </div>

      {tab === 'browse' ? (
        <HomeFilters />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {(tab === 'tv' ? tvShows : movies).map((item: {
            id: number
            title?: string
            name?: string
            poster_path: string | null
            vote_average: number
            release_date?: string
            first_air_date?: string
          }) => (
            <MediaCard
              key={item.id}
              id={item.id}
              title={item.title ?? item.name ?? ''}
              posterPath={item.poster_path}
              rating={item.vote_average}
              year={(item.release_date ?? item.first_air_date ?? '').slice(0, 4)}
              mediaType={tab === 'tv' ? 'tv' : 'movie'}
            />
          ))}
        </div>
      )}
    </div>
  )
}
