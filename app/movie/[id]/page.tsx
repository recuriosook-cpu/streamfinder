import { getMovieDetails, getMovieProviders, getBackdropUrl, getPosterUrl } from '@/lib/tmdb'
import { getOMDBRatings } from '@/lib/omdb'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Star, Clock, Calendar } from 'lucide-react'
import StreamingSection from '@/components/StreamingSection'
import RatingsSection from '@/components/RatingsSection'
import FavoriteButton from '@/components/FavoriteButton'
import WatchedButton from '@/components/WatchedButton'
import WatchlistButton from '@/components/WatchlistButton'
import RatingStars from '@/components/RatingStars'
import HistoryTracker from '@/components/HistoryTracker'

interface Props {
  params: Promise<{ id: string }>
}

export default async function MoviePage({ params }: Props) {
  const { id } = await params
  const [movie, watchData] = await Promise.all([
    getMovieDetails(Number(id)),
    getMovieProviders(Number(id)),
  ])
  const omdb = await getOMDBRatings(movie.imdb_id)

  const allProviders = watchData?.results ?? {}
  const backdrop = getBackdropUrl(movie.backdrop_path)
  const firstProvider = (allProviders.AR?.flatrate ?? allProviders[Object.keys(allProviders)[0]]?.flatrate)?.[0]
  const genreIds: number[] = movie.genres?.map((g: { id: number }) => g.id) ?? []

  return (
    <div className="min-h-screen">
      {/* Records visit to watch_history for logged-in users */}
      <HistoryTracker
        mediaId={movie.id}
        mediaType="movie"
        title={movie.title}
        posterPath={movie.poster_path}
      />

      {/* Backdrop */}
      {backdrop && (
        <div className="relative h-72 md:h-96 w-full">
          <Image src={backdrop} alt={movie.title} fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent" />
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6">
        <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={16} /> Volver
        </Link>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Poster */}
          <div className="shrink-0">
            <div className="relative w-48 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800">
              {movie.poster_path ? (
                <Image src={getPosterUrl(movie.poster_path, 'w342')} alt={movie.title} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600">Sin imagen</div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2">{movie.title}</h1>
            {movie.tagline && <p className="text-zinc-400 italic mb-4">{movie.tagline}</p>}

            <div className="flex flex-wrap gap-4 text-sm text-zinc-400 mb-4">
              {movie.vote_average > 0 && (
                <span className="flex items-center gap-1">
                  <Star size={14} className="text-yellow-400" fill="currentColor" />
                  {movie.vote_average.toFixed(1)} / 10
                </span>
              )}
              {movie.runtime > 0 && (
                <span className="flex items-center gap-1">
                  <Clock size={14} />
                  {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
                </span>
              )}
              {movie.release_date && (
                <span className="flex items-center gap-1">
                  <Calendar size={14} />
                  {movie.release_date.slice(0, 4)}
                </span>
              )}
            </div>

            {/* Genres */}
            {movie.genres?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {movie.genres.map((g: { id: number; name: string }) => (
                  <span key={g.id} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-full">
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {/* Synopsis */}
            {movie.overview && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2">Sinopsis</h2>
                <p className="text-zinc-300 leading-relaxed">{movie.overview}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3 mb-4">
              <FavoriteButton
                mediaId={movie.id}
                mediaType="movie"
                title={movie.title}
                posterPath={movie.poster_path}
                genreIds={genreIds}
                runtime={movie.runtime}
                providerId={firstProvider?.provider_id}
                providerName={firstProvider?.provider_name}
              />
              <WatchedButton
                mediaId={movie.id}
                mediaType="movie"
                title={movie.title}
                posterPath={movie.poster_path}
                genreIds={genreIds}
                runtime={movie.runtime}
              />
              <WatchlistButton
                mediaId={movie.id}
                mediaType="movie"
                title={movie.title}
                posterPath={movie.poster_path}
              />
            </div>

            <RatingStars
              mediaId={movie.id}
              mediaType="movie"
              title={movie.title}
              posterPath={movie.poster_path}
            />
          </div>
        </div>

        <RatingsSection
          tmdbScore={movie.vote_average}
          tmdbVotes={movie.vote_count}
          omdb={omdb}
        />
        <StreamingSection results={allProviders} />
      </div>
    </div>
  )
}
