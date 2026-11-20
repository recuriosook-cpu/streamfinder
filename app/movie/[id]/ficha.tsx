import { getMovieDetails, originalTitleIfDifferent, getMovieProviders, getMovieCredits, getBackdropUrl, getPosterUrl, getMovieReleaseDates } from '@/lib/tmdb'
import { hoyArgentina, hoyEstadosUnidos, reducirFechas } from '@/lib/estreno-pais'
import { COUNTRIES } from '@/lib/countries'
import PosterAmpliado from '@/components/PosterAmpliado'
import { parseAwards } from '@/lib/omdb'
import { getOMDBRatings } from '@/lib/omdb-cache'
import { createServerClient } from '@/lib/supabase-server'
import { mediaImageUrl } from '@/lib/share-urls'

/**
 * La ficha de una película, en castellano (`/movie/[id]`) o en inglés
 * (`/en/movie/[id]`): las dos páginas son envoltorios de esto. En inglés cambian
 * los datos de TMDB (en-US), los textos, el país (Estados Unidos en lugar de
 * Argentina) y las URLs; en castellano sale exactamente lo de siempre.
 *
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
import CreatorRecommendations from '@/components/CreatorRecommendations'
import GuiasRelacionadas from '@/components/GuiasRelacionadas'
import { getCreatorRecommendations } from '@/lib/creator-recommendations'
import SimilarTitles from '@/components/SimilarTitles'
import MediaShareButton from '@/components/MediaShareButton'
import AddToListButton from '@/components/AddToListButton'
import CollectionSection, { type CollectionData } from '@/components/CollectionSection'
import Breadcrumb from '@/components/Breadcrumb'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { idDeFicha, oNoExiste } from '@/lib/ficha-id'
import { fichaDelgada, notaGlynbox, resenasIniciales, sinopsis, vistas } from '@/lib/ficha-datos'
import { descripcionDondeVer, descripcionDondeVerEn, disponibilidad, enAlgunPaisAnglo, enAlgunPaisLatam, tituloDondeVer, tituloDondeVerEn } from '@/lib/donde-ver'
import { idiomaTmdb, rutaFicha, type Idioma } from '@/lib/idioma'
import { alternativas, nombreIdioma, sinopsisEn, textosFicha } from '@/lib/ficha-idioma'
import CambiarIdioma from '@/components/CambiarIdioma'
import SugerirApp from '@/components/SugerirApp'
import { ldJson, migasLD, peliculaLD } from '@/lib/datos-estructurados'
import DondeVer from '@/components/DondeVer'
import DondeVerOtrosPaises from '@/components/DondeVerOtrosPaises'
import { itunesPara } from '@/lib/tiendas'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

async function getTrailerKey(id: number, type: 'movie' | 'tv', idioma: Idioma = 'es'): Promise<string | null> {
  try {
    // En inglés, el tráiler en inglés es el primero (y el único) que se pide.
    if (idioma === 'en') {
      const r = await fetch(`https://api.themoviedb.org/3/${type}/${id}/videos?api_key=${TMDB_KEY}&language=en-US`, { next: { revalidate: 3600 } })
      if (!r.ok) return null
      const d = await r.json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (d.results ?? []).find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')?.key ?? null
    }
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

async function getCollection(collectionId: number, idioma: Idioma = 'es'): Promise<CollectionData | null> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${TMDB_KEY}&language=${idiomaTmdb(idioma)}`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getRecommendations(id: number, type: 'movie' | 'tv', idioma: Idioma = 'es'): Promise<any[]> {
  const lang = idiomaTmdb(idioma)
  try {
    const [recRes, simRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/${type}/${id}/recommendations?api_key=${TMDB_KEY}&language=${lang}`, { next: { revalidate: 3600 } }),
      fetch(`https://api.themoviedb.org/3/${type}/${id}/similar?api_key=${TMDB_KEY}&language=${lang}`,         { next: { revalidate: 3600 } }),
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

export async function metadataPelicula(rawId: string, idioma: Idioma): Promise<Metadata> {
  const en = idioma === 'en'
  const id = String(idDeFicha(rawId, n => rutaFicha(idioma, 'movie', n)))
  const movie = await oNoExiste(getMovieDetails(Number(id), en ? 'en-US' : undefined))
  if (!movie?.title) notFound()
  {
    const year = movie.release_date?.slice(0, 4)
    const posterUrl = movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : 'https://www.glynbox.com/logo.png'
    // Los mismos pedidos que la página (Data Cache de TMDB y `cache()`): no se piden dos veces.
    const [providers, credits, nota, texto] = await Promise.all([
      getMovieProviders(Number(id)).catch(() => null),
      getMovieCredits(Number(id)).catch(() => null),
      notaGlynbox('movie', Number(id)).catch(() => null),
      // En inglés, sólo la sinopsis en inglés: sin ella la ficha cuenta como casi vacía.
      en ? Promise.resolve(sinopsisEn(movie.overview)) : sinopsis('movie', Number(id), movie.overview),
    ])
    const ar = disponibilidad(providers?.results?.AR)
    const us = disponibilidad(providers?.results?.US)
    const director = (credits?.crew ?? []).find((p: { job: string }) => p.job === 'Director')?.name as string | undefined
    const description = en
      ? descripcionDondeVerEn({
        titulo: movie.title, anio: year, us, nota, sinopsis: texto?.texto,
        autor: director ? { rol: 'by', nombre: director } : null,
      })
      : descripcionDondeVer({
        titulo: movie.title, anio: year, ar, nota, sinopsis: texto?.texto,
        autor: director ? { rol: 'de', nombre: director } : null,
      })
    const fullTitle = en ? tituloDondeVerEn(movie.title, year, us) : tituloDondeVer(movie.title, year, ar)
    // La misma regla en los dos idiomas; en inglés, con la sinopsis en inglés y
    // los países de habla inglesa en lugar de Latinoamérica.
    const delgada = await fichaDelgada({
      tipo: 'movie', id: Number(id), sinopsis: texto?.texto,
      enLatam: en ? enAlgunPaisAnglo(providers?.results) : enAlgunPaisLatam(providers?.results),
    })
    const url = `https://www.glynbox.com${rutaFicha(idioma, 'movie', id)}`
    return {
      // Casi vacía: fuera del índice, pero Google sigue los links (ver `fichaDelgada`).
      ...(delgada && { robots: { index: false, follow: true } }),
      title:       fullTitle,
      description,
      openGraph: {
        title:       movie.title,
        description,
        // La vista previa de glynbox.com (póster, título, año, puntaje), la
        // misma que genera /api/share. El póster suelto queda de respaldo.
        images:      [
          { url: mediaImageUrl('movie', id, 'link'), width: 1200, height: 630, alt: movie.title },
          { url: posterUrl, width: 500, height: 750, alt: movie.title },
        ],
        url,
        type:        'video.movie',
        siteName:    'Glynbox',
        ...(en && { locale: 'en_US' }),
      },
      twitter: {
        card:        'summary_large_image',
        title:       `${movie.title} — Glynbox`,
        description,
        images:      [mediaImageUrl('movie', id, 'link')],
      },
      // Cada versión con su canonical, y las dos enlazadas con hreflang.
      alternates: { canonical: url, languages: alternativas('movie', id) },
      itunes: itunesPara(`/movie/${id}`),
    }
  }
}

export default async function FichaPelicula({ rawId, idioma }: { rawId: string; idioma: Idioma }) {
  const en = idioma === 'en'
  const t = textosFicha(idioma)
  const numId = idDeFicha(rawId, n => rutaFicha(idioma, 'movie', n))
  // Todo junto en `oNoExiste`: si la película no existe, los créditos y las
  // plataformas también dan 404, y cualquiera de ellos puede llegar primero.
  const [movie, watchData, credits, trailerKey, similar] = await oNoExiste(Promise.all([
    getMovieDetails(numId, en ? 'en-US' : undefined),
    getMovieProviders(numId),
    getMovieCredits(numId, en ? 'en-US' : undefined),
    getTrailerKey(numId, 'movie', idioma),
    getRecommendations(numId, 'movie', idioma),
  ]))
  // Responde 404 (con `not-found.tsx`), no 200: si no, Google la cuenta como
  // una página más, igual a todas las demás que no existen.
  if (!movie || movie.success === false || !movie.title) notFound()

  const supabase = createServerClient()
  const [omdbResult, collectionData, watchedCount, creatorRecs, nota, resenas, texto, fechasEstreno, tituloGuardado] = await Promise.all([
    getOMDBRatings(movie.imdb_id),
    movie.belongs_to_collection?.id ? getCollection(movie.belongs_to_collection.id, idioma) : Promise.resolve(null),
    vistas('movie', numId).catch(() => null),
    getCreatorRecommendations(supabase, 'movie', numId),
    // Si Supabase falla, la ficha sale igual y el navegador lo pide como antes.
    notaGlynbox('movie', numId).catch(() => null),
    resenasIniciales('movie', numId).catch(() => null),
    en ? Promise.resolve(sinopsisEn(movie.overview)) : sinopsis('movie', numId, movie.overview),
    // Para "todavía no se estrenó" / "solo en cines" cuando no hay plataformas.
    // Sólo los países del selector; si TMDB falla, queda el mensaje de siempre.
    getMovieReleaseDates(numId)
      .then(r => reducirFechas(r, COUNTRIES.map(c => c.code)))
      .catch(() => null),
    // Lo que se guarda (favoritos, vistas, historial) va siempre con el título en
    // castellano, como en el resto del sitio. En inglés, un pedido más (cacheado).
    en ? getMovieDetails(numId).then(m => (m?.title as string) || movie.title).catch(() => movie.title as string) : Promise.resolve(movie.title as string),
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
  const originalTitle = originalTitleIfDifferent(movie.title, movie.original_title)
  const backdrop = getBackdropUrl(movie.backdrop_path)
  const genreIds: number[] = movie.genres?.map((g: { id: number }) => g.id) ?? []

  const LANG_ES: Record<string, string> = {
    en: 'Inglés', es: 'Español', fr: 'Francés', de: 'Alemán', it: 'Italiano',
    ja: 'Japonés', ko: 'Coreano', zh: 'Chino', pt: 'Portugués', ru: 'Ruso',
    ar: 'Árabe', hi: 'Hindi', tr: 'Turco', sv: 'Sueco', da: 'Danés',
  }
  const idiomaOriginal = (code: string) => (en ? nombreIdioma(code) : LANG_ES[code]) ?? code.toUpperCase()
  const fmtMoney = (n: number) => n >= 1e9 ? `$${(n/1e9).toFixed(1)}B` : `$${(n/1e6).toFixed(0)}M`
  const fmtCount = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}K` : String(n)

  // La nota es la de Glynbox (no la de TMDB): ver `lib/datos-estructurados.ts`.
  const jsonLd = [
    peliculaLD({
      id: movie.id,
      idioma,
      titulo: movie.title,
      tituloOriginal: originalTitle,
      sinopsis: texto?.texto,
      posterPath: movie.poster_path,
      estreno: movie.release_date,
      minutos: movie.runtime,
      generos: (movie.genres ?? []).map((g: { name: string }) => g.name),
      directores: directors,
      actores: cast,
      imdbId: movie.imdb_id,
      nota,
    }),
    migasLD([{ nombre: t.queVer, ruta: '/que-ver' }, { nombre: movie.title, ruta: rutaFicha(idioma, 'movie', movie.id) }]),
  ]

  return (
    <div className="min-h-screen" lang={en ? 'en' : undefined}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }}
      />
      {/* Records visit to watch_history for logged-in users */}
      <HistoryTracker
        mediaId={movie.id}
        mediaType="movie"
        title={tituloGuardado}
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
          { label: t.queVer, href: '/que-ver' },
          { label: movie.title },
        ]} />
        <CambiarIdioma idioma={idioma} otra={rutaFicha(en ? 'es' : 'en', 'movie', movie.id)} />
        {/* Cartel para bajar la app cuando la ruleta no la pudo abrir (`?sugerir_app=1`). */}
        {!en && <SugerirApp />}

        <div className="flex flex-col md:flex-row gap-6 md:gap-8">
          {/* Poster */}
          <div className="shrink-0 flex justify-center md:justify-start">
            {movie.poster_path ? (
              // Mismo póster y mismo `alt` que antes; tocarlo lo amplía.
              <PosterAmpliado
                posterPath={movie.poster_path}
                titulo={movie.title}
                className="relative w-40 sm:w-48 md:w-56 aspect-[2/3] rounded-xl overflow-hidden bg-[#1C1C27] shadow-2xl ring-1 ring-white/10"
              >
                <Image src={getPosterUrl(movie.poster_path, 'w342')} alt={movie.title} fill className="object-cover" />
              </PosterAmpliado>
            ) : (
              <div className="relative w-40 sm:w-48 md:w-56 aspect-[2/3] rounded-xl overflow-hidden bg-[#1C1C27] shadow-2xl ring-1 ring-white/10">
                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm text-center px-2">{t.sinImagen}</div>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 text-white">{movie.title}</h1>
            {originalTitle && (
              <p className="-mt-1 mb-3 text-xs text-zinc-500">{t.tituloOriginal}{originalTitle}</p>
            )}
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
                  {en ? movie.status
                    : movie.status === 'Released' ? 'Estrenada'
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
                    href={`/generos/${g.id}`}
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
                    <p className="text-[#A0A0B0]">{t.idioma}</p>
                    <p className="text-white font-medium mt-0.5">{idiomaOriginal(movie.original_language)}</p>
                  </div>
                )}
                {movie.production_countries?.length > 0 && (
                  <div>
                    <p className="text-[#A0A0B0]">{t.pais}</p>
                    <p className="text-white font-medium mt-0.5">
                      {(movie.production_countries as { name: string }[]).slice(0, 2).map(c => c.name).join(', ')}
                    </p>
                  </div>
                )}
                {movie.budget > 0 && (
                  <div>
                    <p className="text-[#A0A0B0]">{t.presupuesto}</p>
                    <p className="text-white font-medium mt-0.5">{fmtMoney(movie.budget)}</p>
                  </div>
                )}
                {movie.revenue > 0 && (
                  <div>
                    <p className="text-[#A0A0B0]">{t.recaudacion}</p>
                    <p className="text-white font-medium mt-0.5">{fmtMoney(movie.revenue)}</p>
                  </div>
                )}
                {watchedCount != null && watchedCount > 0 && (
                  <div>
                    <p className="text-[#A0A0B0]">{t.enGlynbox}</p>
                    <p className="text-white font-medium mt-0.5">{t.laVieron(fmtCount(watchedCount))}</p>
                  </div>
                )}
              </div>
            )}

            {/* Synopsis */}
            {texto && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2">{t.sinopsis}</h2>
                {/* En inglés sólo cuando TMDB no tiene sinopsis en castellano. */}
                <p className="text-zinc-300 leading-relaxed" lang={texto.ingles ? 'en' : undefined}>{texto.texto}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-2 sm:flex sm:flex-row sm:flex-wrap gap-2 sm:gap-3 mb-4">
              <FavoriteButton
                mediaId={movie.id}
                mediaType="movie"
                title={tituloGuardado}
                posterPath={movie.poster_path}
                genreIds={genreIds}
                runtime={movie.runtime}
                proveedoresPorPais={allProviders}
              />
              <WatchedButton
                mediaId={movie.id}
                mediaType="movie"
                title={tituloGuardado}
                posterPath={movie.poster_path}
                genreIds={genreIds}
                runtime={movie.runtime}
              />
              <WatchlistButton
                mediaId={movie.id}
                mediaType="movie"
                title={tituloGuardado}
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
                title={tituloGuardado}
                posterPath={movie.poster_path}
              />
            </div>

            <RatingStars
              mediaId={movie.id}
              mediaType="movie"
              title={tituloGuardado}
              posterPath={movie.poster_path}
              ofrecerFrase
            />
          </div>
        </div>

        <CreatorRecommendations items={creatorRecs} mediaType="movie" mediaId={movie.id} />
        {/* Dónde verla, arriba: es lo que vino a buscar quien llega desde Google. */}
        <StreamingSection
          results={allProviders}
          mediaType="movie"
          mediaId={movie.id}
          estreno={{ tipo: 'movie', fechas: fechasEstreno, general: movie.release_date ?? null }}
          hoyServidor={en ? hoyEstadosUnidos() : hoyArgentina()}
        />
        <DondeVer
          titulo={movie.title}
          tipo="movie"
          results={allProviders}
          estreno={{ tipo: 'movie', fechas: fechasEstreno, general: movie.release_date ?? null }}
          idioma={idioma}
        />
        <DondeVerOtrosPaises
          titulo={movie.title}
          results={allProviders}
          estreno={{ tipo: 'movie', fechas: fechasEstreno, general: movie.release_date ?? null }}
          idioma={idioma}
        />
        {/* Lo propio de Glynbox, arriba: reseñas de la comunidad y guías (antes iban al final). */}
        <ReviewsSection
          mediaId={movie.id}
          mediaType="movie"
          title={tituloGuardado}
          posterPath={movie.poster_path}
          inicial={resenas ? { ...resenas, stats: nota } : undefined}
        />
        {/* Las guías están en castellano: no van en la ficha en inglés. */}
        {!en && <GuiasRelacionadas tipo="movie" id={movie.id} titulo={movie.title} />}
        {trailerKey && <TrailerSection videoKey={trailerKey} />}
        {collectionData && collectionData.parts?.length > 1 && (
          <CollectionSection collection={collectionData} currentMovieId={movie.id} />
        )}
        <CastCarousel cast={cast} />
        {en ? <CrewSection crew={crew} title="Directing and writing" /> : <CrewSection crew={crew} />}
        {parsedAwards && <AwardsSection awards={parsedAwards} idioma={idioma} />}
        <RatingsSection
          tmdbScore={movie.vote_average}
          tmdbVotes={movie.vote_count}
          omdb={omdb}
          imdbId={movie.imdb_id}
          mediaId={movie.id}
          mediaType="movie"
        />
        <SimilarTitles items={similar} mediaType="movie" idioma={idioma} />
      </div>
    </div>
  )
}
