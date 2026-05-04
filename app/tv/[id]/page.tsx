import { getTVDetails, getTVProviders, getTVExternalIds, getTVCredits, getBackdropUrl, getPosterUrl } from '@/lib/tmdb'
import { getOMDBRatings, parseAwards } from '@/lib/omdb'
import { createServerClient } from '@/lib/supabase-server'
import Image from 'next/image'
import Link from 'next/link'
import { Star, Tv, Calendar } from 'lucide-react'
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
    const show = await getTVDetails(Number(id))
    const posterUrl = show.poster_path
      ? `https://image.tmdb.org/t/p/w500${show.poster_path}`
      : 'https://glynbox.com/logo.png'
    const title       = show.name ?? show.title ?? 'Serie'
    const year        = (show.first_air_date ?? '').slice(0, 4)
    const description = show.overview?.slice(0, 160) ?? `Reseñas y recomendaciones de ${title} en Glynbox`
    const fullTitle   = year ? `${title} (${year}) — Glynbox` : `${title} — Glynbox`
    return {
      title:       fullTitle,
      description,
      openGraph: {
        title,
        description,
        images:      [{ url: posterUrl, width: 500, height: 750, alt: title }],
        url:         `https://glynbox.com/tv/${id}`,
        type:        'video.tv_show',
        siteName:    'Glynbox',
      },
      twitter: {
        card:        'summary_large_image',
        title:       `${title} — Glynbox`,
        description,
        images:      [posterUrl],
      },
      alternates: { canonical: `https://glynbox.com/tv/${id}` },
    }
  } catch { return {} }
}

export default async function TVPage({ params }: Props) {
  const { id } = await params
  const numId = Number(id)
  const [show, watchData, externalIds, credits, trailerKey, similar] = await Promise.all([
    getTVDetails(numId),
    getTVProviders(numId),
    getTVExternalIds(numId),
    getTVCredits(numId),
    getTrailerKey(numId, 'tv'),
    getSimilar(numId, 'tv'),
  ])
  if (!show || show.success === false || (!show.name && !show.title)) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex flex-col items-center justify-center gap-6 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Glynbox" style={{ height: '48px' }} />
        <div style={{ fontSize: '80px' }}>📺</div>
        <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 700, textAlign: 'center' }}>
          Esta serie no existe
        </h1>
        <p style={{ color: '#A0A0B0', textAlign: 'center', maxWidth: '400px' }}>
          No encontramos información sobre este título. Puede que el ID sea incorrecto o que la serie haya sido eliminada de nuestra base de datos.
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
  const [omdb, { count: watchedCount }] = await Promise.all([
    getOMDBRatings(externalIds?.imdb_id),
    supabase.from('watched').select('*', { count: 'exact', head: true }).eq('media_id', numId).eq('media_type', 'tv'),
  ])

  // Cast: top 10
  const cast = (credits.cast ?? [])
    .slice(0, 10)
    .map((p: { id: number; name: string; character: string; profile_path: string | null }) => ({
      id: p.id,
      name: p.name,
      character: p.character,
      profilePath: p.profile_path,
    }))

  // Crew: creators from show details (already in getTVDetails response)
  const creators = (show.created_by ?? [])
    .map((p: { id: number; name: string; profile_path: string | null }) => ({
      id: p.id,
      name: p.name,
      job: 'Creador/a',
      profilePath: p.profile_path,
    }))

  const parsedAwards = parseAwards(omdb.awards)

  const allProviders = watchData?.results ?? {}
  const backdrop = getBackdropUrl(show.backdrop_path)
  const firstProvider = (allProviders.AR?.flatrate ?? allProviders[Object.keys(allProviders)[0]]?.flatrate)?.[0]
  const genreIds: number[] = show.genres?.map((g: { id: number }) => g.id) ?? []

  const LANG: Record<string, string> = {
    en: 'Inglés', es: 'Español', fr: 'Francés', de: 'Alemán', it: 'Italiano',
    ja: 'Japonés', ko: 'Coreano', zh: 'Chino', pt: 'Portugués', ru: 'Ruso',
    ar: 'Árabe', hi: 'Hindi', tr: 'Turco', sv: 'Sueco', da: 'Danés',
  }
  const fmtCount = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n)

  return (
    <div className="min-h-screen">
      <HistoryTracker
        mediaId={show.id}
        mediaType="tv"
        title={show.name}
        posterPath={show.poster_path}
      />

      {backdrop && (
        <div className="relative h-64 sm:h-80 md:h-[500px] w-full overflow-hidden">
          <Image src={backdrop} alt={show.name} fill className="object-cover object-top" priority />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(10,10,15,0) 0%, rgba(10,10,15,0.35) 45%, rgba(10,10,15,0.95) 80%, #0A0A0F 100%)' }} />
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 pb-10 relative z-10" style={{ marginTop: backdrop ? '-130px' : '24px' }}>
        <Breadcrumb items={[
          { label: 'Qué ver', href: '/que-ver' },
          { label: show.name ?? show.title ?? 'Serie' },
        ]} />

        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          <div className="shrink-0 flex justify-center md:justify-start">
            <div className="relative w-40 sm:w-48 md:w-56 aspect-[2/3] rounded-xl overflow-hidden bg-[#1C1C27] shadow-2xl ring-1 ring-white/10">
              {show.poster_path ? (
                <Image src={getPosterUrl(show.poster_path, 'w342')} alt={show.name} fill className="object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm text-center px-2">Sin imagen</div>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 text-white">{show.name}</h1>
            {show.tagline && <p className="text-[#A0A0B0] italic mb-3 text-sm">{show.tagline}</p>}

            <div className="flex flex-wrap gap-3 text-sm text-[#A0A0B0] mb-3">
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
                  {show.number_of_episodes > 0 && ` · ${show.number_of_episodes} ep.`}
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
                  show.status === 'Ended' || show.status === 'Canceled'
                    ? 'bg-red-900/50 text-red-300'
                    : 'bg-[#FFFD02]/10 text-[#FFFD02]'
                }`}>
                  {show.status === 'Returning Series' ? 'En emisión'
                    : show.status === 'Ended' ? 'Finalizada'
                    : show.status === 'Canceled' ? 'Cancelada'
                    : show.status}
                </span>
              )}
            </div>

            {show.genres?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {show.genres.map((g: { id: number; name: string }) => (
                  <Link
                    key={g.id}
                    href={`/que-ver?genre=${g.id}&type=series`}
                    className="text-xs bg-[#1C1C27] hover:bg-zinc-700 text-zinc-300 hover:text-white px-2 py-1 rounded-full transition-colors"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            )}

            {show.overview && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2">Sinopsis</h2>
                <p className="text-zinc-300 leading-relaxed">{show.overview}</p>
              </div>
            )}

            {/* Extended info grid */}
            {(show.original_language || show.production_countries?.length > 0 || show.networks?.length > 0 || watchedCount) && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs mb-4 py-3 border-t border-[#2A2A3A]">
                {show.original_language && (
                  <div>
                    <p className="text-[#A0A0B0]">Idioma</p>
                    <p className="text-white font-medium mt-0.5">{LANG[show.original_language] ?? show.original_language.toUpperCase()}</p>
                  </div>
                )}
                {show.production_countries?.length > 0 && (
                  <div>
                    <p className="text-[#A0A0B0]">País</p>
                    <p className="text-white font-medium mt-0.5">
                      {(show.production_countries as { name: string }[]).slice(0, 2).map(c => c.name).join(', ')}
                    </p>
                  </div>
                )}
                {show.networks?.length > 0 && (
                  <div>
                    <p className="text-[#A0A0B0]">Red</p>
                    <p className="text-white font-medium mt-0.5">{(show.networks as { name: string }[]).slice(0,2).map(n => n.name).join(', ')}</p>
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

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 mb-4">
              <FavoriteButton
                mediaId={show.id}
                mediaType="tv"
                title={show.name}
                posterPath={show.poster_path}
                genreIds={genreIds}
                seasonsCount={show.number_of_seasons}
                providerId={firstProvider?.provider_id}
                providerName={firstProvider?.provider_name}
              />
              <WatchedButton
                mediaId={show.id}
                mediaType="tv"
                title={show.name}
                posterPath={show.poster_path}
                genreIds={genreIds}
                seasonsCount={show.number_of_seasons}
              />
              <WatchlistButton
                mediaId={show.id}
                mediaType="tv"
                title={show.name}
                posterPath={show.poster_path}
              />
              <MediaShareButton
                mediaId={show.id}
                mediaType="tv"
                title={show.name}
                year={show.first_air_date?.slice(0, 4)}
                score={show.vote_average}
              />
              <AddToListButton
                mediaId={show.id}
                mediaType="tv"
                title={show.name}
                posterPath={show.poster_path}
              />
            </div>

            <RatingStars
              mediaId={show.id}
              mediaType="tv"
              title={show.name}
              posterPath={show.poster_path}
            />
          </div>
        </div>

        {trailerKey && <TrailerSection videoKey={trailerKey} />}
        <CastCarousel cast={cast} />
        <CrewSection crew={creators} title="Creadores" />
        {parsedAwards && <AwardsSection awards={parsedAwards} />}
        <RatingsSection
          tmdbScore={show.vote_average}
          tmdbVotes={show.vote_count}
          omdb={omdb}
        />
        <StreamingSection results={allProviders} />
        <ReviewsSection
          mediaId={show.id}
          mediaType="tv"
          title={show.name}
          posterPath={show.poster_path}
        />
        <SimilarTitles items={similar} mediaType="tv" />
      </div>
    </div>
  )
}
