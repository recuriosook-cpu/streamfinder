import { getTVDetails, getTVProviders, getBackdropUrl, getPosterUrl } from '@/lib/tmdb'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Star, Tv, Calendar } from 'lucide-react'
import ProviderBadge from '@/components/ProviderBadge'
import FavoriteButton from '@/components/FavoriteButton'

interface Props {
  params: Promise<{ id: string }>
}

export default async function TVPage({ params }: Props) {
  const { id } = await params
  const [show, watchData] = await Promise.all([
    getTVDetails(Number(id)),
    getTVProviders(Number(id)),
  ])

  const arProviders = watchData?.results?.AR ?? {}
  const backdrop = getBackdropUrl(show.backdrop_path)

  return (
    <div className="min-h-screen">
      {backdrop && (
        <div className="relative h-72 md:h-96 w-full">
          <Image src={backdrop} alt={show.name} fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent" />
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={16} /> Volver
        </Link>

        <div className="flex flex-col md:flex-row gap-8">
          <div className="shrink-0">
            <div className="relative w-48 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800">
              {show.poster_path ? (
                <Image src={getPosterUrl(show.poster_path, 'w342')} alt={show.name} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600">Sin imagen</div>
              )}
            </div>
          </div>

          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">{show.name}</h1>
            {show.tagline && <p className="text-zinc-400 italic mb-4">{show.tagline}</p>}

            <div className="flex flex-wrap gap-4 text-sm text-zinc-400 mb-4">
              {show.vote_average > 0 && (
                <span className="flex items-center gap-1">
                  <Star size={14} className="text-yellow-400" fill="currentColor" />
                  {show.vote_average.toFixed(1)} / 10
                </span>
              )}
              {show.number_of_seasons > 0 && (
                <span className="flex items-center gap-1">
                  <Tv size={14} />
                  {show.number_of_seasons} temporada{show.number_of_seasons !== 1 ? 's' : ''}
                </span>
              )}
              {show.first_air_date && (
                <span className="flex items-center gap-1">
                  <Calendar size={14} />
                  {show.first_air_date.slice(0, 4)}
                </span>
              )}
              {show.status && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  show.status === 'Ended' || show.status === 'Canceled' ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'
                }`}>
                  {show.status === 'Returning Series' ? 'En emisión' : show.status === 'Ended' ? 'Finalizada' : show.status}
                </span>
              )}
            </div>

            {show.genres?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {show.genres.map((g: { id: number; name: string }) => (
                  <span key={g.id} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-full">
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {show.overview && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2">Sinopsis</h2>
                <p className="text-zinc-300 leading-relaxed">{show.overview}</p>
              </div>
            )}

            {show.networks?.length > 0 && (
              <p className="text-sm text-zinc-400 mb-4">
                <span className="text-zinc-500">Red:</span>{' '}
                {show.networks.map((n: { name: string }) => n.name).join(', ')}
              </p>
            )}

            <FavoriteButton
              mediaId={show.id}
              mediaType="tv"
              title={show.name}
              posterPath={show.poster_path}
            />
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-xl font-bold mb-4">Disponible en streaming (Argentina)</h2>
          {!arProviders.flatrate && !arProviders.rent && !arProviders.buy ? (
            <p className="text-zinc-500">No hay información de streaming disponible para Argentina.</p>
          ) : (
            <div className="bg-zinc-900 rounded-xl p-6">
              <ProviderBadge providers={arProviders.flatrate} label="Incluido en suscripción" />
              <ProviderBadge providers={arProviders.rent} label="Alquiler" />
              <ProviderBadge providers={arProviders.buy} label="Compra" />
              {arProviders.link && (
                <a
                  href={arProviders.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-sm text-emerald-400 hover:text-emerald-300"
                >
                  Ver más opciones en JustWatch →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
