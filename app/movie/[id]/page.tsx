import { getMovieDetails, getMovieProviders, getMovieCredits, getBackdropUrl, getPosterUrl } from '@/lib/tmdb'
import { getOMDBRatings, parseAwards } from '@/lib/omdb'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Star, Clock, Calendar } from 'lucide-react'
import StreamingSection from '@/components/StreamingSection'
import RatingsSection from '@/components/RatingsSection'
import CastCarousel from '@/components/CastCarousel'
import CrewSection from '@/components/CrewSection'
import AwardsSection from '@/components/AwardsSection'
import FavoriteButton from '@/components/FavoriteButton'
import WatchedButton from '@/components/WatchedButton'
import WatchlistButton from '@/components/WatchlistButton'
import RatingStars from '@/components/RatingStars'
import HistoryTracker from '@/components/HistoryTracker'
import ReviewsSection from '@/components/ReviewsSection'
import TrailerSection from '@/components/TrailerSection'
import SimilarTitles from '@/components/SimilarTitles'
import MediaShareButton from '@/components/MediaShareButton'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

async function getTrailerKey(id: number, type: 'movie' | 'tv'): Promise<string | null> {
  try {
    const r1 = await fetch(`https://api.themoviedb.org/3/${type}/${id}/videos?api_key=${TMDB_KEY}&language=es-AR`, { next: { revalidate: 3600 } })
    if (r1.ok) {
      const d1 = await r1.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t1 = (d1.results ?? []).find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')
      if (t1) return t1.key as string
    }
    const r2 = await fetch(`https://api.themoviedb.org/3/${type}/${id}/videos?api_key=${TMDB_KEY}&language=en-US`, { next: { revalidate: 3600 } })
    if (!r2.ok) return null
    const d2 = await r2.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t2 = (d2.results ?? []).find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')
    return t2?.key ?? null
  } catch { return null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSimilar(id: number, type: 'movie' | 'tv'): Promise<any[]> {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${type}/${id}/similar?api_key=${TMDB_KEY}&language=es-AR`, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).slice(0, 10)
  } catch { return [] }
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function MoviePage({ params }: Props) {
  const { id } = await params
  const numId = Number(id)
  const [movie, watchData, credits, trailerKey, similar] = await Promise.all([
    getMovieDetails(numId),
    getMovieProviders(numId),
    getMovieCredits(numId),
    getTrailerKey(numId, 'movie'),
    getSimilar(numId, 'movie'),
  ])
  const omdb = await getOMDBRatings(movie.imdb_id)

  // Cast: top 10 billed actors
  const cast = (credits.cast ?? [])
    .slice(0, 10)
    .map((p: { id: number; name: string; character: string; profile_path: string | null }) => ({
      id: p.id,
      name: p.name,
      character: p.character,
      profilePath: p.profile_path,
    }))

  // Crew: director(s) + writers (Screenplay / Story / Writer)
  const WRITER_JOBS = new Set(['Screenplay', 'Story', 'Writer', 'Novel', 'Characters'])
  const directors = (credits.crew ?? [])
    .filter((p: { job: string }) => p.job === 'Director')
    .map((p: { id: number; name: string; job: string; profile_path: string | null }) => ({
      id: p.id, name: p.name, job: 'Director', profilePath: p.profile_path,
    }))
  const writers = (credits.crew ?? [])
    .filter((p: { job: string }) => WRITER_JOBS.has(p.job))
    // deduplicate by person id
    .filter((p: { id: number }, i: number, arr: { id: number }[]) => arr.findIndex(x => x.id === p.id) === i)
    .slice(0, 3)
    .map((p: { id: number; name: string; job: string; profile_path: string | null }) => ({
      id: p.id, name: p.name, job: p.job, profilePath: p.profile_path,
    }))
  const crew = [...directors, ...writers]

  const parsedAwards = parseAwards(omdb.awards)

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
        <Link href="/" className="inline-flex items-center gap-2 text-[#A0A0B0] hover:text-white mb-6 transition-colors">
          <ArrowLeft size={16} /> Volver
        </Link>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Poster */}
          <div className="shrink-0">
            <div className="relative w-48 aspect-[2/3] rounded-xl overflow-hidden bg-[#1C1C27]">
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
            {movie.tagline && <p className="text-[#A0A0B0] italic mb-4">{movie.tagline}</p>}

            <div className="flex flex-wrap gap-4 text-sm text-[#A0A0B0] mb-4">
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
                  <Link
                    key={g.id}
                    href={`/que-ver?genre=${g.id}&type=movies`}
                    className="text-xs bg-[#1C1C27] hover:bg-zinc-700 text-zinc-300 hover:text-white px-2 py-1 rounded-full transition-colors"
                  >
                    {g.name}
                  </Link>
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
              <MediaShareButton
                mediaId={movie.id}
                mediaType="movie"
                title={movie.title}
                year={movie.release_date?.slice(0, 4)}
                score={movie.vote_average}
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

        {trailerKey && <TrailerSection videoKey={trailerKey} />}
        <CastCarousel cast={cast} />
        <CrewSection crew={crew} />
        {parsedAwards && <AwardsSection awards={parsedAwards} />}
        <RatingsSection
          tmdbScore={movie.vote_average}
          tmdbVotes={movie.vote_count}
          omdb={omdb}
        />
        <StreamingSection results={allProviders} />
        <ReviewsSection
          mediaId={movie.id}
          mediaType="movie"
          title={movie.title}
          posterPath={movie.poster_path}
        />
        <SimilarTitles items={similar} mediaType="movie" />
      </div>
    </div>
  )
}
