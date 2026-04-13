import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ALL_PLATFORMS } from '@/lib/providers'
import {
  getARProviders,
  getProviderTopMovies,
  getProviderTopTV,
  getProviderCatalog,
} from '@/lib/tmdb'
import TopRankedCard from '@/components/TopRankedCard'
import MediaCard from '@/components/MediaCard'

export async function generateStaticParams() {
  return ALL_PLATFORMS.map(p => ({ slug: p.slug }))
}

interface RawItem {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  vote_average: number
  release_date?: string
  first_air_date?: string
}

export default async function PlatformPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const platform = ALL_PLATFORMS.find(p => p.slug === slug)
  if (!platform) notFound()

  const [topMoviesData, topTVData, catalogMoviesData, catalogTVData, arProviders] =
    await Promise.all([
      getProviderTopMovies(platform.id),
      getProviderTopTV(platform.id),
      getProviderCatalog(platform.id, 'movie', 1),
      getProviderCatalog(platform.id, 'tv', 1),
      getARProviders(),
    ])

  // Logo from TMDB provider list
  const providerInfo = arProviders.find(
    (p: { provider_id: number }) => p.provider_id === platform.id
  )
  const logoPath: string | null = (providerInfo as { logo_path?: string })?.logo_path ?? null

  const topMovies: RawItem[] = (topMoviesData.results ?? []).slice(0, 10)
  const topTV: RawItem[] = (topTVData.results ?? []).slice(0, 10)

  // Catalog: merge movies + TV sorted by release date desc
  const catalogMovies: RawItem[] = (catalogMoviesData.results ?? []).map((m: RawItem) => ({
    ...m,
    _mediaType: 'movie',
  }))
  const catalogTV: RawItem[] = (catalogTVData.results ?? []).map((t: RawItem) => ({
    ...t,
    _mediaType: 'tv',
  }))

  const catalog = [...catalogMovies, ...catalogTV].sort((a, b) => {
    const dateA = a.release_date ?? a.first_air_date ?? ''
    const dateB = b.release_date ?? b.first_air_date ?? ''
    return dateB.localeCompare(dateA)
  })

  return (
    <div className="min-h-screen">
      {/* Platform header */}
      <div className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-5 transition-colors"
          >
            <ArrowLeft size={15} /> Inicio
          </Link>
          <div className="flex items-center gap-4">
            {logoPath ? (
              <Image
                src={`https://image.tmdb.org/t/p/original${logoPath}`}
                alt={platform.name}
                width={64}
                height={64}
                className="rounded-xl shadow-lg"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-xs text-center px-2 leading-tight shadow-lg"
                style={{ backgroundColor: platform.color }}
              >
                {platform.name}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-white">{platform.name}</h1>
              <p className="text-zinc-400 text-sm mt-0.5">Disponible en Argentina</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10 space-y-14">
        {/* Top 10 Películas */}
        {topMovies.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
              <span
                className="w-1 h-6 rounded-full inline-block"
                style={{ backgroundColor: platform.color }}
              />
              Top 10 Películas
            </h2>
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-3">
              {topMovies.map((movie, i) => (
                <TopRankedCard
                  key={movie.id}
                  id={movie.id}
                  title={movie.title ?? movie.name ?? ''}
                  posterPath={movie.poster_path}
                  mediaType="movie"
                  rank={i + 1}
                />
              ))}
            </div>
          </section>
        )}

        {/* Top 10 Series */}
        {topTV.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
              <span
                className="w-1 h-6 rounded-full inline-block"
                style={{ backgroundColor: platform.color }}
              />
              Top 10 Series
            </h2>
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-3">
              {topTV.map((show, i) => (
                <TopRankedCard
                  key={show.id}
                  id={show.id}
                  title={show.name ?? show.title ?? ''}
                  posterPath={show.poster_path}
                  mediaType="tv"
                  rank={i + 1}
                />
              ))}
            </div>
          </section>
        )}

        {/* Catálogo completo */}
        <section>
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
            <span
              className="w-1 h-6 rounded-full inline-block"
              style={{ backgroundColor: platform.color }}
            />
            Catálogo completo
            <span className="text-zinc-500 text-sm font-normal">· ordenado por fecha de estreno</span>
          </h2>
          {catalog.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {catalog.map((item: RawItem & { _mediaType?: string }) => (
                <MediaCard
                  key={`${item._mediaType}-${item.id}`}
                  id={item.id}
                  title={item.title ?? item.name ?? ''}
                  posterPath={item.poster_path}
                  rating={item.vote_average}
                  year={(item.release_date ?? item.first_air_date ?? '').slice(0, 4)}
                  mediaType={item._mediaType === 'tv' ? 'tv' : 'movie'}
                />
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm">
              No se encontró contenido disponible en Argentina para esta plataforma.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
