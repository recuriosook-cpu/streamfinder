import { getMovieDetails, getMovieProviders, getMovieCredits, getBackdropUrl, getPosterUrl } from '@/lib/tmdb'
import { getOMDBRatings, parseAwards } from '@/lib/omdb'
import { createServerClient } from '@/lib/supabase-server'
import Image from 'next/image'
import Link from 'next/link'
import { Star, Clock, Calendar } from 'lucide-react'
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
import AddToListButton from '@/components/AddToListButton'
import CollectionSection, { type CollectionData } from '@/components/CollectionSection'
import Breadcrumb from '@/components/Breadcrumb'
import type { Metadata } from 'next'

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

async function getCollection(collectionId: number): Promise<CollectionData | null> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${TMDB_KEY}&language=es-AR`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return null
    return res.json()
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    const movie = await getMovieDetails(Number(id))
    const year = movie.release_date?.slice(0, 4)
    const posterUrl = movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : 'https://glynbox.com/logo.png'
    const description = movie.overview?.slice(0, 160) ?? `Reseñas y recomendaciones de ${movie.title} en Glynbox`
    const fullTitle = year ? `${movie.title} (${year}) — Glynbox` : `${movie.title} — Glynbox`
    return {
      title:       fullTitle,
      description,
      openGraph: {
        title:       movie.title,
        description,
        images:      [{ url: posterUrl, width: 500, height: 750, alt: movie.title }],
        url:         `https://glynbox.com/movie/${id}`,
        type:        'video.movie',
        siteName:    'Glynbox',
      },
      twitter: {
        card:        'summary_large_image',
        title:       `${movie.title} — Glynbox`,
        description,
        images:      [posterUrl],
      },
      alternates: { canonical: `https://glynbox.com/movie/${id}` },
    }
  } catch { return {} }
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
  if (!movie || movie.success === false || !movie.title) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex flex-col items-center justify-center gap-6 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Glynbox" style={{ height: '48px' }} />
        <div style={{ fontSize: '80px' }}>🎬</div>
        <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 700, textAlign: 'center' }}>
          Esta película no existe
        </h1>
        <p style={{ color: '#A0A0B0', textAlign: 'center', maxWidth: '400px' }}>
          No encontramos información sobre este título. Puede que el ID sea incorrecto o que la película haya sido eliminada de nuestra base de datos.
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="/" style={{ background: '#FFFD02', color: '#000', padding: '12px 24px', borderRadius: '50px', fontWeight: 600, textDecoration: 'none' }}>
            Volver al inicio
          </a>
          <a href="/que-ver" style={{ border: '1px solid #2A2A3A', color: '#fff', padding: '12px 24px', borderRadius: '50px', textDecoration: 'none' }}>
            Explorar títulos
          </a>
        </div>
      </div>
    )
  }

  const supabase = createServerClient()
  const [omdbResult, collectionData, { count: watchedCount }] = await Promise.all([
    getOMDBRatings(movie.imdb_id),
    movie.belongs_to_collection?.id ? getCollection(movie.belongs_to_collection.id) : Promise.resolve(null),
    supabase.from('watched').select('*', { count: 'exact', head: true }).eq('media_id', numId).eq('media_type', 'movie'),
  ])
  const omdb = omdbResult

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

  const LANG: Record<string, string> = {
    en: 'Inglés', es: 'Español', fr: 'Francés', de: 'Alemán', it: 'Italiano',
    ja: 'Japonés', ko: 'Coreano', zh: 'Chino', pt: 'Portugués', ru: 'Ruso',
    ar: 'Árabe', hi: 'Hindi', tr: 'Turco', sv: 'Sueco', da: 'Danés',
  }
  const fmtMoney = (n: number) => n >= 1e9 ? `$${(n/1e9).toFixed(1)}B` : `$${(n/1e6).toFixed(0)}M`
  const fmtCount = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: movie.title,
    description: movie.overview,
    image: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
    datePublished: movie.release_date,
    ...(movie.vote_average > 0 && movie.vote_count > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: movie.vote_average,
        ratingCount: movie.vote_count,
        bestRating: 10,
        worstRating: 0,
      },
    }),
  }

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Records visit to watch_history for logged-in users */}
      <HistoryTracker
        mediaId={movie.id}
        mediaType="movie"
        title={movie.title}
        posterPath={movie.poster_path}
      />

      {/* Cinematic backdrop */}
      {backdrop && (
        <div className="relative h-64 sm:h-80 md:h-[500px] w-full overflow-hidden">
          <Image src={backdrop} alt={movie.title} fill className="object-cover object-top" priority />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(10,10,15,0) 0%, rgba(10,10,15,0.35) 45%, rgba(10,10,15,0.95) 80%, #0A0A0F 100%)' }} />
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 pb-10 relative z-10" style={{ marginTop: backdrop ? '-130px' : '24px' }}>
        <Breadcrumb items={[
          { label: 'Qué ver', href: '/que-ver' },
          { label: movie.title },
        ]} />

        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          {/* Poster */}
          <div className="shrink-0 flex justify-center md:justify-start">
            <div className="relative w-40 sm:w-48 md:w-56 aspect-[2/3] rounded-xl overflow-hidden bg-[#1C1C27] shadow-2xl ring-1 ring-white/10">
              {movie.poster_path ? (
                <Image src={getPosterUrl(movie.poster_path, 'w342')} alt={movie.title} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm text-center px-2">Sin imagen</div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 text-white">{movie.title}</h1>
            {movie.tagline && <p className="text-[#A0A0B0] italic mb-3 text-sm">{movie.tagline}</p>}

            <div className="flex flex-wrap gap-3 text-sm text-[#A0A0B0] mb-3">
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
              {movie.status && movie.status !== 'Released' && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  movie.status === 'Canceled' ? 'bg-red-900/50 text-red-300' : 'bg-[#FFFD02]/10 text-[#FFFD02]'
                }`}>
                  {movie.status === 'Released' ? 'Estrenada'
                    : movie.status === 'In Production' ? 'En producción'
                    : movie.status === 'Post Production' ? 'Post producción'
                    : movie.status === 'Canceled' ? 'Cancelada' : movie.status}
                </span>
              )}
            </div>

            {/* Genres */}
            {movie.genres?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
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

            {/* Extended info grid */}
            {(movie.original_language || movie.production_countries?.length > 0 || movie.budget > 0 || movie.revenue > 0) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs mb-4 py-3 border-t border-[#2A2A3A]">
                {movie.original_language && (
                  <div>
                    <p className="text-[#A0A0B0]">Idioma</p>
                    <p className="text-white font-medium mt-0.5">{LANG[movie.original_language] ?? movie.original_language.toUpperCase()}</p>
                  </div>
                )}
                {movie.production_countries?.length > 0 && (
                  <div>
                    <p className="text-[#A0A0B0]">País</p>
                    <p className="text-white font-medium mt-0.5">
                      {(movie.production_countries as { name: string }[]).slice(0, 2).map(c => c.name).join(', ')}
                    </p>
                  </div>
                )}
                {movie.budget > 0 && (
                  <div>
                    <p className="text-[#A0A0B0]">Presupuesto</p>
                    <p className="text-white font-medium mt-0.5">{fmtMoney(movie.budget)}</p>
                  </div>
                )}
                {movie.revenue > 0 && (
                  <div>
                    <p className="text-[#A0A0B0]">Recaudación</p>
                    <p className="text-white font-medium mt-0.5">{fmtMoney(movie.revenue)}</p>
                  </div>
                )}
                {watchedCount != null && watchedCount > 0 && (
                  <div>
                    <p className="text-[#A0A0B0]">En Glynbox</p>
                    <p className="text-white font-medium mt-0.5">👁 {fmtCount(watchedCount)} la vieron</p>
                  </div>
                )}
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
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 mb-4">
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
              <AddToListButton
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

        {trailerKey && <TrailerSection videoKey={trailerKey} />}
        {collectionData && collectionData.parts?.length > 1 && (
          <CollectionSection collection={collectionData} currentMovieId={movie.id} />
        )}
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
