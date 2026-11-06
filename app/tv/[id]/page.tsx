import { getTVDetails, originalTitleIfDifferent, getTVProviders, getTVExternalIds, getTVCredits, getBackdropUrl, getPosterUrl } from '@/lib/tmdb'
import { parseAwards } from '@/lib/omdb'
import { getOMDBRatings } from '@/lib/omdb-cache'
import { createServerClient } from '@/lib/supabase-server'
import { mediaImageUrl } from '@/lib/share-urls'
import { notFound } from 'next/navigation'
import { idDeFicha, oNoExiste } from '@/lib/ficha-id'
import { fichaDelgada, notaGlynbox, resenasIniciales, sinopsis, vistas } from '@/lib/ficha-datos'
import { descripcionDondeVer, disponibilidad, enAlgunPaisLatam, tituloDondeVer } from '@/lib/donde-ver'
import { ldJson, migasLD, serieLD } from '@/lib/datos-estructurados'
import DondeVer from '@/components/DondeVer'

/**
 * Sin ISR a propósito: esta ficha se cachea 24 h en la CDN de Vercel, con el
 * header `Vercel-CDN-Cache-Control` de `next.config.ts`.
 *
 * Con ISR, cada ficha nueva se guardaba en el cache durable de Vercel, que se
 * cobra por escritura (unidades de 8 KB, unas 16 por ficha). Los bots recorren
 * ids siempre distintos, así que casi todo lo guardado no se volvía a leer: en
 * septiembre de 2026 fueron 9M de unidades, $36 y el 72% de la factura, y el
 * proyecto quedó pausado por el tope de gasto. El cache de la CDN no se cobra.
 *
 * Sin `revalidate` ni `generateStaticParams` la página es dinámica. Los
 * datos de TMDB se siguen cacheando una hora en `lib/tmdb.ts`. No volver a
 * ponerle ISR sin mirar esto.
 */

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
import SeriesReviewsBlock from '@/components/SeriesReviewsBlock'
import SeasonStrip from '@/components/SeasonStrip'
import TrailerSection from '@/components/TrailerSection'
import CreatorRecommendations from '@/components/CreatorRecommendations'
import GuiasRelacionadas from '@/components/GuiasRelacionadas'
import { getCreatorRecommendations } from '@/lib/creator-recommendations'
import SimilarTitles from '@/components/SimilarTitles'
import MediaShareButton from '@/components/MediaShareButton'
import AddToListButton from '@/components/AddToListButton'
import Breadcrumb from '@/components/Breadcrumb'
import type { Metadata } from 'next'
import { itunesPara } from '@/lib/tiendas'

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
async function getRecommendations(id: number, type: 'movie' | 'tv'): Promise<any[]> {
  try {
    const [recRes, simRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/${type}/${id}/recommendations?api_key=${TMDB_KEY}&language=es-AR`, { next: { revalidate: 3600 } }),
      fetch(`https://api.themoviedb.org/3/${type}/${id}/similar?api_key=${TMDB_KEY}&language=es-AR`,         { next: { revalidate: 3600 } }),
    ])
    const recData = recRes.ok ? await recRes.json() : { results: [] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recs: any[] = (recData.results ?? []).filter((r: any) => r.poster_path).slice(0, 12)
    if (recs.length >= 6) return recs
    const simData = simRes.ok ? await simRes.json() : { results: [] }
    const existing = new Set(recs.map((r: any) => r.id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extras: any[] = (simData.results ?? []).filter((r: any) => r.poster_path && !existing.has(r.id))
    return [...recs, ...extras].slice(0, 12)
  } catch { return [] }
}

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = String(idDeFicha((await params).id, n => `/tv/${n}`))
  const show = await oNoExiste(getTVDetails(Number(id)))
  if (!show?.name && !show?.title) notFound()
  {
    const posterUrl = show.poster_path
      ? `https://image.tmdb.org/t/p/w500${show.poster_path}`
      : 'https://www.glynbox.com/logo.png'
    const title       = show.name ?? show.title ?? 'Serie'
    const year        = (show.first_air_date ?? '').slice(0, 4)
    // Los mismos pedidos que la página (Data Cache de TMDB y `cache()`): no se piden dos veces.
    const [providers, nota, texto] = await Promise.all([
      getTVProviders(Number(id)).catch(() => null),
      notaGlynbox('tv', Number(id)).catch(() => null),
      sinopsis('tv', Number(id), show.overview),
    ])
    const ar          = disponibilidad(providers?.results?.AR)
    const creador     = (show.created_by ?? [])[0]?.name as string | undefined
    const description = descripcionDondeVer({
      titulo: title, anio: year || undefined, ar, nota, sinopsis: texto?.texto,
      autor: creador ? { rol: 'creada por', nombre: creador } : null,
    })
    const fullTitle   = tituloDondeVer(title, year || undefined, ar)
    const delgada     = await fichaDelgada({
      tipo: 'tv', id: Number(id), sinopsis: texto?.texto, enLatam: enAlgunPaisLatam(providers?.results),
    })
    return {
      // Casi vacía: fuera del índice, pero Google sigue los links (ver `fichaDelgada`).
      ...(delgada && { robots: { index: false, follow: true } }),
      title:       fullTitle,
      description,
      openGraph: {
        title,
        description,
        // La vista previa de glynbox.com (póster, título, año, puntaje), la
        // misma que genera /api/share. El póster suelto queda de respaldo.
        images:      [
          { url: mediaImageUrl('tv', id, 'link'), width: 1200, height: 630, alt: title },
          { url: posterUrl, width: 500, height: 750, alt: title },
        ],
        url:         `https://www.glynbox.com/tv/${id}`,
        type:        'video.tv_show',
        siteName:    'Glynbox',
      },
      twitter: {
        card:        'summary_large_image',
        title:       `${title} — Glynbox`,
        description,
        images:      [mediaImageUrl('tv', id, 'link')],
      },
      alternates: { canonical: `https://www.glynbox.com/tv/${id}` },
      itunes: itunesPara(`/tv/${id}`),
    }
  }
}

export default async function TVPage({ params }: Props) {
  const numId = idDeFicha((await params).id, n => `/tv/${n}`)
  // Todo junto en `oNoExiste`: si la serie no existe, los créditos y las
  // plataformas también dan 404, y cualquiera de ellos puede llegar primero.
  const [show, watchData, externalIds, credits, trailerKey, similar] = await oNoExiste(Promise.all([
    getTVDetails(numId),
    getTVProviders(numId),
    getTVExternalIds(numId),
    getTVCredits(numId),
    getTrailerKey(numId, 'tv'),
    getRecommendations(numId, 'tv'),
  ]))
  // Responde 404 (con `not-found.tsx`), no 200: si no, Google la cuenta como
  // una página más, igual a todas las demás que no existen.
  if (!show || show.success === false || (!show.name && !show.title)) notFound()

  const supabase = createServerClient()
  const [omdb, watchedCount, creatorRecs, nota, resenas, texto] = await Promise.all([
    getOMDBRatings(externalIds?.imdb_id),
    vistas('tv', numId).catch(() => null),
    getCreatorRecommendations(supabase, 'tv', numId),
    // Si Supabase falla, la ficha sale igual y el navegador lo pide como antes.
    notaGlynbox('tv', numId).catch(() => null),
    resenasIniciales('tv', numId).catch(() => null),
    sinopsis('tv', numId, show.overview),
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
  const originalTitle = originalTitleIfDifferent(show.name, show.original_name)
  const backdrop = getBackdropUrl(show.backdrop_path)
  const genreIds: number[] = show.genres?.map((g: { id: number }) => g.id) ?? []

  const LANG: Record<string, string> = {
    en: 'Inglés', es: 'Español', fr: 'Francés', de: 'Alemán', it: 'Italiano',
    ja: 'Japonés', ko: 'Coreano', zh: 'Chino', pt: 'Portugués', ru: 'Ruso',
    ar: 'Árabe', hi: 'Hindi', tr: 'Turco', sv: 'Sueco', da: 'Danés',
  }
  const fmtCount = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n)

  // La nota es la de Glynbox (no la de TMDB): ver `lib/datos-estructurados.ts`.
  const jsonLd = [
    serieLD({
      id: show.id,
      titulo: show.name,
      tituloOriginal: originalTitle,
      sinopsis: texto?.texto,
      posterPath: show.poster_path,
      inicio: show.first_air_date,
      generos: (show.genres ?? []).map((g: { name: string }) => g.name),
      creadores: creators,
      actores: cast,
      temporadas: show.number_of_seasons,
      episodios: show.number_of_episodes,
      imdbId: externalIds?.imdb_id,
      nota,
    }),
    migasLD([{ nombre: 'Qué ver', ruta: '/que-ver' }, { nombre: show.name, ruta: `/tv/${show.id}` }]),
  ]

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }}
      />
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
            {originalTitle && (
              <p className="-mt-1 mb-3 text-xs text-zinc-500">Título original: {originalTitle}</p>
            )}
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
                    href={`/generos/${g.id}`}
                    className="text-xs bg-[#1C1C27] hover:bg-zinc-700 text-zinc-300 hover:text-white px-2 py-1 rounded-full transition-colors"
                  >
                    {g.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Temporadas arriba, visibles sin scrollear: cada una lleva a su
                página, con episodios, tu nota y las reseñas de la temporada. */}
            <SeasonStrip seriesId={show.id} seasons={show.seasons} />

            {texto && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2">Sinopsis</h2>
                {/* En inglés sólo cuando TMDB no tiene sinopsis en castellano. */}
                <p className="text-zinc-300 leading-relaxed" lang={texto.ingles ? 'en' : undefined}>{texto.texto}</p>
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
            <div className="grid grid-cols-2 sm:flex sm:flex-row sm:flex-wrap gap-2 sm:gap-3 mb-4">
              <FavoriteButton
                mediaId={show.id}
                mediaType="tv"
                title={show.name}
                posterPath={show.poster_path}
                genreIds={genreIds}
                seasonsCount={show.number_of_seasons}
                proveedoresPorPais={allProviders}
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
              ofrecerFrase
            />
          </div>
        </div>

        <CreatorRecommendations items={creatorRecs} mediaType="tv" mediaId={show.id} />
        {/* Dónde verla, arriba: es lo que vino a buscar quien llega desde Google. */}
        <StreamingSection results={allProviders} mediaType="tv" mediaId={show.id} />
        <DondeVer titulo={show.name ?? show.title} tipo="tv" results={allProviders} />
        {/* Lo propio de Glynbox, arriba: reseñas de la comunidad y guías (antes iban al final). */}
        <SeriesReviewsBlock seriesId={show.id} hasSeasons={(show.seasons?.length ?? 0) > 0}>
          <ReviewsSection
            mediaId={show.id}
            mediaType="tv"
            title={show.name}
            posterPath={show.poster_path}
            inicial={resenas ? { ...resenas, stats: nota } : undefined}
          />
        </SeriesReviewsBlock>
        <GuiasRelacionadas tipo="tv" id={show.id} titulo={show.name ?? show.title} />
        {trailerKey && <TrailerSection videoKey={trailerKey} />}
        <CastCarousel cast={cast} />
        <CrewSection crew={creators} title="Creadores" />
        {parsedAwards && <AwardsSection awards={parsedAwards} />}
        <RatingsSection
          tmdbScore={show.vote_average}
          tmdbVotes={show.vote_count}
          omdb={omdb}
          imdbId={externalIds?.imdb_id}
          mediaId={show.id}
          mediaType="tv"
        />
        <SimilarTitles items={similar} mediaType="tv" />
      </div>
    </div>
  )
}
