import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Calendar, ChevronLeft, ChevronRight, Tv, Star } from 'lucide-react'
import { getTVDetails, getTVSeason, getPosterUrl } from '@/lib/tmdb'
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
import Breadcrumb from '@/components/Breadcrumb'

/**
 * Página de una temporada: /tv/{id}/temporada/{n}.
 *
 * Portada y datos de la temporada, lo de Glynbox (tu nota y reseña, las de la
 * comunidad) y la lista de episodios. Los episodios son sólo para ver: número,
 * nombre, imagen, fecha, duración y sinopsis. Sin el puntaje de TMDB por
 * episodio, para que el día que se califiquen en Glynbox no convivan dos.
 *
 * Página aparte y no dentro de la ficha: TMDB da los episodios en un pedido
 * por temporada (de 50 a 450 KB); en la ficha habría que traer todas en cada
 * visita. Así cada temporada tiene su propio cache.
 *
 * Sin ISR, igual que las fichas: se cachea 24 h en la CDN de Vercel con el
 * header `Vercel-CDN-Cache-Control` de `next.config.ts`. El porqué está en
 * `app/movie/[id]/page.tsx`.
 */

interface Props {
  params: Promise<{ id: string; n: string }>
}

interface Episodio {
  episode_number: number
  name: string | null
  overview: string | null
  air_date: string | null
  runtime: number | null
  still_path: string | null
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
async function cargar(id: number, n: number): Promise<Datos | null> {
  try {
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
  } catch {
    return null
  }
}

function parsear(p: { id: string; n: string }) {
  const id = Number(p.id), n = Number(p.n)
  return Number.isInteger(id) && id > 0 && Number.isInteger(n) && n >= 0 ? { id, n } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = parsear(await params)
  const datos = p && await cargar(p.id, p.n)
  if (!datos) return { title: 'Temporada — Glynbox' }
  const nombre = nombreTemporada(datos.temporada)
  const title = `${datos.show.name}: ${nombre} — Glynbox`
  const description = datos.temporada.overview?.slice(0, 160)
    || `${nombre} de ${datos.show.name}: episodios, reseñas y calificaciones en Glynbox.`
  const poster = getPosterUrl(datos.temporada.poster_path ?? datos.show.poster_path, 'w500')
  return {
    title,
    description,
    openGraph: { title, description, images: poster ? [{ url: poster, width: 500, height: 750 }] : [] },
    alternates: { canonical: `https://glynbox.com/tv/${datos.show.id}/temporada/${datos.temporada.season_number}` },
  }
}

export default async function SeasonPage({ params }: Props) {
  const p = parsear(await params)
  if (!p) notFound()
  const datos = await cargar(p.id, p.n)
  if (!datos) notFound()

  const { show, temporada } = datos
  const nombre = nombreTemporada(temporada)
  const fecha = fechaLarga(temporada.air_date)
  const poster = temporada.poster_path ?? show.poster_path

  // Anterior y siguiente, en el mismo orden que las pestañas (Especiales al final).
  const orden = temporadasParaPestanias(show.seasons) ?? show.seasons
  const i = orden.findIndex(s => s.season_number === temporada.season_number)
  const anterior = i > 0 ? orden[i - 1] : null
  const siguiente = i >= 0 && i < orden.length - 1 ? orden[i + 1] : null

  return (
    <div className="max-w-5xl mx-auto px-4 pt-6 pb-16">
      <Breadcrumb items={[
        { label: 'Qué ver', href: '/que-ver' },
        { label: show.name, href: `/tv/${show.id}` },
        { label: nombre },
      ]} />

      <SeasonStrip seriesId={show.id} seasons={show.seasons} activa={temporada.season_number} />

      {/* ── La temporada ── */}
      <div className="flex gap-4 sm:gap-6 mt-2">
        <div className="relative w-28 sm:w-40 shrink-0 self-start aspect-[2/3] rounded-xl overflow-hidden bg-[#1C1C27] ring-1 ring-white/10">
          {poster && <Image src={getPosterUrl(poster, 'w342')} alt={nombre} fill className="object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/tv/${show.id}`} className="text-sm text-[#A0A0B0] hover:text-white">{show.name}</Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mt-0.5">{nombre}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#A0A0B0]">
            {fecha && <span className="inline-flex items-center gap-1"><Calendar size={14} /> {fecha}</span>}
            {temporada.episodes.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Tv size={14} /> {temporada.episodes.length} {temporada.episodes.length === 1 ? 'episodio' : 'episodios'}
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
        <h2 className="text-xl font-bold mb-4">Episodios</h2>
        {temporada.episodes.length === 0 ? (
          <p className="text-sm text-[#A0A0B0]">TMDB todavía no tiene los episodios de esta temporada.</p>
        ) : (
          <ol className="space-y-4">
            {temporada.episodes.map(e => {
              const noSalio = sinEstrenar(e)
              const meta = [
                noSalio ? (e.air_date ? `Se estrena el ${fechaCorta(e.air_date)}` : 'Sin fecha') : fechaCorta(e.air_date),
                duracion(e.runtime),
              ].filter(Boolean).join(' · ')
              return (
                <li key={e.episode_number} className="flex flex-col sm:flex-row gap-3 sm:gap-4 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-3">
                  <div className="relative w-full sm:w-56 shrink-0 aspect-video rounded-lg overflow-hidden bg-[#1C1C27]">
                    {e.still_path ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w300${e.still_path}`}
                        alt={e.name ?? `Episodio ${e.episode_number}`}
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
                    <h3 className="font-semibold text-white">
                      <span className="text-[#A0A0B0] font-normal">E{e.episode_number} · </span>
                      {e.name?.trim() || `Episodio ${e.episode_number}`}
                    </h3>
                    {meta && <p className="text-xs text-[#A0A0B0] mt-1">{meta}</p>}
                    {e.overview?.trim() && (
                      <p className="text-sm text-zinc-300 leading-relaxed mt-2 line-clamp-4">{e.overview}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* ── Anterior / siguiente ── */}
      {(anterior || siguiente) && (
        <nav className="mt-10 flex justify-between gap-4 text-sm">
          {anterior ? (
            <Link href={`/tv/${show.id}/temporada/${anterior.season_number}`} className="inline-flex items-center gap-1 text-[#A0A0B0] hover:text-white">
              <ChevronLeft size={16} /> {nombreTemporada(anterior)}
            </Link>
          ) : <span />}
          {siguiente && (
            <Link href={`/tv/${show.id}/temporada/${siguiente.season_number}`} className="inline-flex items-center gap-1 text-[#A0A0B0] hover:text-white">
              {nombreTemporada(siguiente)} <ChevronRight size={16} />
            </Link>
          )}
        </nav>
      )}
    </div>
  )
}
