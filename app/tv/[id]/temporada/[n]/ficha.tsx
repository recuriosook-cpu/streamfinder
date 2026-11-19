import { notFound, permanentRedirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { itunesPara } from '@/lib/tiendas'
import { Calendar, ChevronLeft, ChevronRight, Tv, Star } from 'lucide-react'
import { getTVDetails, getTVSeason, getPosterUrl, TMDBError } from '@/lib/tmdb'
import { ldJson, migasLD, temporadaLD } from '@/lib/datos-estructurados'
import {
  duracion,
  fechaCorta,
  fechaLarga,
  nombreTemporada,
  sinEstrenar,
  temporadasParaPestanias,
  type TmdbSeason,
} from '@/lib/seasons'
import SeasonStrip from '@/components/SeasonStrip'
import SeasonReviewPanel from '@/components/SeasonReviewPanel'
import { EpisodeRating, EpisodeRatingsProvider } from '@/components/EpisodeRatings'
import Breadcrumb from '@/components/Breadcrumb'
import CambiarIdioma from '@/components/CambiarIdioma'
import { rutaFicha, rutaTemporada, type Idioma } from '@/lib/idioma'
import { alternativasTemporada } from '@/lib/ficha-idioma'
import { EpisodiosVistosProvider, MarcarTemporada, ProgresoSerie, TildeVisto } from '@/components/EpisodiosVistos'

/**
 * Página de una temporada: /tv/{id}/temporada/{n}, y en inglés
 * /en/tv/{id}/season/{n} (las dos páginas son envoltorios de esto).
 *
 * Portada y datos de la temporada, lo de Glynbox (tu nota y reseña, las de la
 * comunidad) y la lista de episodios. Cada episodio muestra número, nombre,
 * imagen, fecha, duración y sinopsis, y se puede calificar. Al lado van dos
 * puntajes que no se mezclan: el de TMDB ("★ 8.4 TMDB", sobre 10) y el promedio
 * de Glynbox (sobre 5). El de TMDB no es dato del usuario y viene en esta
 * página; las notas y los promedios de Glynbox los carga el navegador
 * (`EpisodeRatings`), nunca esta página, que se cachea en la CDN.
 *
 * Página aparte y no dentro de la ficha: TMDB da los episodios en un pedido
 * por temporada (de 50 a 450 KB); en la ficha habría que traer todas en cada
 * visita. Así cada temporada tiene su propio cache.
 *
 * Sin ISR, igual que las fichas: se cachea 24 h en la CDN de Vercel con el
 * header `Vercel-CDN-Cache-Control` de `next.config.ts`. El porqué está en
 * `app/movie/[id]/ficha.tsx`.
 */

interface Episodio {
  episode_number: number
  name: string | null
  overview: string | null
  air_date: string | null
  runtime: number | null
  still_path: string | null
  vote_average: number | null
  vote_count: number | null
}

interface Temporada extends TmdbSeason {
  episodes: Episodio[]
}

type Datos = { show: { id: number; name: string; poster_path: string | null; seasons: TmdbSeason[] }; temporada: Temporada }

/**
 * La serie y la temporada. `null` si alguna no existe. Si faltan sinopsis en
 * castellano (pasa en series chicas y en especiales), se completan con las de
 * inglés: un pedido más, sólo cuando hace falta.
 */
async function cargar(id: number, n: number, idioma: Idioma = 'es'): Promise<Datos | null> {
  try {
    // En inglés, todo de TMDB en inglés y sin respaldo en otro idioma.
    if (idioma === 'en') {
      return { show: await getTVDetails(id, 'en-US'), temporada: await getTVSeason(id, n, 'en-US') } as Datos
    }
    const [show, temporada] = await Promise.all([getTVDetails(id), getTVSeason(id, n)]) as [Datos['show'], Temporada]
    const falta = !temporada.overview?.trim() || temporada.episodes.some(e => !e.overview?.trim())
    if (falta) {
      try {
        const en = await getTVSeason(id, n, 'en-US') as Temporada
        if (!temporada.overview?.trim()) temporada.overview = en.overview
        const porNumero = new Map(en.episodes.map(e => [e.episode_number, e]))
        for (const e of temporada.episodes) {
          if (!e.overview?.trim()) e.overview = porNumero.get(e.episode_number)?.overview ?? null
          if (!e.still_path) e.still_path = porNumero.get(e.episode_number)?.still_path ?? null
        }
      } catch { /* sin respaldo: se muestra lo que hay */ }
    }
    return { show, temporada }
  } catch (e) {
    // `null` (404) sólo si TMDB dice que no existe. Si TMDB falla, error: un
    // 404 lo guarda la CDN un día y hace que Google saque la página.
    if (e instanceof TMDBError && e.status === 404) return null
    throw e
  }
}

/**
 * Los números de la URL. `null` (404) si no son números; con ceros adelante
 * (`/tv/01399/temporada/01`), redirección permanente a la URL sin ceros.
 */
function parsear(p: { id: string; n: string }, idioma: Idioma = 'es') {
  if (!/^\d+$/.test(p.id) || !/^\d+$/.test(p.n)) return null
  const id = Number(p.id), n = Number(p.n)
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(n)) return null
  if (String(id) !== p.id || String(n) !== p.n) permanentRedirect(rutaTemporada(idioma, id, n))
  return { id, n }
}

export async function metadataTemporada(params: { id: string; n: string }, idioma: Idioma): Promise<Metadata> {
  const en = idioma === 'en'
  const p = parsear(params, idioma)
  const datos = p && await cargar(p.id, p.n, idioma)
  if (!datos) notFound()
  const nombre = nombreTemporada(datos.temporada, idioma)
  const title = `${datos.show.name}: ${nombre} — Glynbox`
  const description = datos.temporada.overview?.slice(0, 160)
    || (en
      ? `${nombre} of ${datos.show.name}: episodes, reviews and ratings on Glynbox.`
      : `${nombre} de ${datos.show.name}: episodios, reseñas y calificaciones en Glynbox.`)
  const poster = getPosterUrl(datos.temporada.poster_path ?? datos.show.poster_path, 'w500')
  return {
    title,
    description,
    openGraph: { title, description, images: poster ? [{ url: poster, width: 500, height: 750 }] : [] },
    // Cada versión con su canonical, y las dos enlazadas con hreflang.
    alternates: {
      canonical: `https://www.glynbox.com${rutaTemporada(idioma, datos.show.id, datos.temporada.season_number)}`,
      languages: alternativasTemporada(datos.show.id, datos.temporada.season_number),
    },
    itunes: itunesPara(`/tv/${datos.show.id}/temporada/${datos.temporada.season_number}`),
  }
}

export default async function FichaTemporada({ params, idioma }: { params: { id: string; n: string }; idioma: Idioma }) {
  const en = idioma === 'en'
  const p = parsear(params, idioma)
  if (!p) notFound()
  const datos = await cargar(p.id, p.n, idioma)
  if (!datos) notFound()

  const { show, temporada } = datos
  const nombre = nombreTemporada(temporada, idioma)
  const fecha = fechaLarga(temporada.air_date, idioma)
  const queVer = en ? 'What to watch' : 'Qué ver'
  const poster = temporada.poster_path ?? show.poster_path

  // Anterior y siguiente, en el mismo orden que las pestañas (Especiales al final).
  const orden = temporadasParaPestanias(show.seasons) ?? show.seasons
  const i = orden.findIndex(s => s.season_number === temporada.season_number)
  const anterior = i > 0 ? orden[i - 1] : null
  const siguiente = i >= 0 && i < orden.length - 1 ? orden[i + 1] : null

  const jsonLd = [
    temporadaLD({
      serieId: show.id,
      idioma,
      serie: show.name,
      numero: temporada.season_number,
      nombre: `${show.name}: ${nombre}`,
      sinopsis: temporada.overview,
      posterPath: poster,
      inicio: temporada.air_date,
      episodios: temporada.episodes.map(e => ({ numero: e.episode_number, nombre: e.name })),
    }),
    migasLD([
      { nombre: queVer, ruta: '/que-ver' },
      { nombre: show.name, ruta: rutaFicha(idioma, 'tv', show.id) },
      { nombre, ruta: rutaTemporada(idioma, show.id, temporada.season_number) },
    ]),
  ]

  return (
    <div className="max-w-5xl mx-auto px-4 pt-6 pb-16" lang={en ? 'en' : undefined}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(jsonLd) }} />
      <Breadcrumb items={[
        { label: queVer, href: '/que-ver' },
        { label: show.name, href: rutaFicha(idioma, 'tv', show.id) },
        { label: nombre },
      ]} />
      <CambiarIdioma idioma={idioma} otra={rutaTemporada(en ? 'es' : 'en', show.id, temporada.season_number)} />

      {/* Capítulos vistos: todo en el navegador, el HTML no lleva nada (ver `EpisodiosVistos`). */}
      <EpisodiosVistosProvider serieId={show.id}>
      <ProgresoSerie seasons={show.seasons} />
      <SeasonStrip seriesId={show.id} seasons={show.seasons} activa={temporada.season_number} idioma={idioma} />

      {/* ── La temporada ── */}
      <div className="flex gap-4 sm:gap-6 mt-2">
        <div className="relative w-28 sm:w-40 shrink-0 self-start aspect-[2/3] rounded-xl overflow-hidden bg-[#1C1C27] ring-1 ring-white/10">
          {poster && <Image src={getPosterUrl(poster, 'w342')} alt={nombre} fill className="object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <Link prefetch={false} href={rutaFicha(idioma, 'tv', show.id)} className="text-sm text-[#A0A0B0] hover:text-white">{show.name}</Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mt-0.5">{nombre}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#A0A0B0]">
            {fecha && <span className="inline-flex items-center gap-1"><Calendar size={14} /> {fecha}</span>}
            {temporada.episodes.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Tv size={14} /> {temporada.episodes.length} {en ? (temporada.episodes.length === 1 ? 'episode' : 'episodes') : (temporada.episodes.length === 1 ? 'episodio' : 'episodios')}
              </span>
            )}
            {!!temporada.vote_average && temporada.vote_average > 0 && (
              <span className="inline-flex items-center gap-1"><Star size={14} className="text-yellow-400" fill="currentColor" /> {temporada.vote_average.toFixed(1)} TMDB</span>
            )}
          </div>
          {/* En celular la sinopsis va abajo, a todo el ancho (ver más abajo). */}
          {temporada.overview?.trim() && (
            <p className="hidden sm:block mt-3 text-base text-zinc-300 leading-relaxed">{temporada.overview}</p>
          )}
        </div>
      </div>
      {temporada.overview?.trim() && (
        <p className="sm:hidden mt-4 text-sm text-zinc-300 leading-relaxed">{temporada.overview}</p>
      )}

      {/* ── Lo de Glynbox ── */}
      <div className="mt-8">
        <SeasonReviewPanel
          seriesId={show.id}
          seriesTitle={show.name}
          seriesPoster={show.poster_path}
          temporada={{
            season_number: temporada.season_number,
            name: temporada.name,
            air_date: temporada.air_date,
            poster_path: temporada.poster_path,
          }}
        />
      </div>

      {/* ── Episodios ── */}
      <section className="mt-10">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold">{en ? 'Episodes' : 'Episodios'}</h2>
          <MarcarTemporada
            temporada={temporada.season_number}
            episodios={temporada.episodes.map(e => ({ episode_number: e.episode_number, air_date: e.air_date }))}
          />
        </div>
        {temporada.episodes.length === 0 ? (
          <p className="text-sm text-[#A0A0B0]">{en ? "TMDB doesn't have this season's episodes yet." : 'TMDB todavía no tiene los episodios de esta temporada.'}</p>
        ) : (
          <EpisodeRatingsProvider seriesId={show.id} seasonNumber={temporada.season_number} seriesTitle={show.name}>
          <ol className="space-y-4">
            {temporada.episodes.map(e => {
              const noSalio = sinEstrenar(e)
              const meta = [
                en
                  ? (noSalio ? (e.air_date ? `Airs ${fechaCorta(e.air_date, idioma)}` : 'No date yet') : fechaCorta(e.air_date, idioma))
                  : (noSalio ? (e.air_date ? `Se estrena el ${fechaCorta(e.air_date)}` : 'Sin fecha') : fechaCorta(e.air_date)),
                duracion(e.runtime),
              ].filter(Boolean).join(' · ')
              return (
                <li key={e.episode_number} className="flex flex-col sm:flex-row gap-3 sm:gap-4 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-3">
                  <div className="relative w-full sm:w-56 shrink-0 aspect-video rounded-lg overflow-hidden bg-[#1C1C27]">
                    {e.still_path ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w300${e.still_path}`}
                        alt={e.name ?? `${en ? 'Episode' : 'Episodio'} ${e.episode_number}`}
                        fill
                        sizes="(max-width: 640px) 100vw, 224px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-zinc-700">
                        {e.episode_number}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-white">
                        <span className="text-[#A0A0B0] font-normal">E{e.episode_number} · </span>
                        {e.name?.trim() || `${en ? 'Episode' : 'Episodio'} ${e.episode_number}`}
                      </h3>
                      <TildeVisto temporada={temporada.season_number} capitulo={e.episode_number} airDate={e.air_date} />
                    </div>
                    {meta && <p className="text-xs text-[#A0A0B0] mt-1">{meta}</p>}
                    <EpisodeRating
                      episodeNumber={e.episode_number}
                      episodeName={e.name}
                      airDate={e.air_date}
                      // Sin votos en TMDB (o sin estrenar) no va nada: ni un 0 ni "sin puntaje".
                      tmdbScore={!noSalio && (e.vote_count ?? 0) > 0 && (e.vote_average ?? 0) > 0 ? e.vote_average : null}
                    />
                    {e.overview?.trim() && (
                      <p className="text-sm text-zinc-300 leading-relaxed mt-2 line-clamp-4">{e.overview}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          </EpisodeRatingsProvider>
        )}
      </section>

      </EpisodiosVistosProvider>

      {/* ── Anterior / siguiente ── */}
      {(anterior || siguiente) && (
        <nav className="mt-10 flex justify-between gap-4 text-sm">
          {anterior ? (
            <Link prefetch={false} href={rutaTemporada(idioma, show.id, anterior.season_number)} className="inline-flex items-center gap-1 text-[#A0A0B0] hover:text-white">
              <ChevronLeft size={16} /> {nombreTemporada(anterior, idioma)}
            </Link>
          ) : <span />}
          {siguiente && (
            <Link prefetch={false} href={rutaTemporada(idioma, show.id, siguiente.season_number)} className="inline-flex items-center gap-1 text-[#A0A0B0] hover:text-white">
              {nombreTemporada(siguiente, idioma)} <ChevronRight size={16} />
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
