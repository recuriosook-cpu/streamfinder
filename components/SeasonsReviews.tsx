'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Calendar, Loader2, MessageSquare, Star, Trash2, Tv } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { StarIcon } from '@/components/StarDisplay'
import {
  etiquetaTemporada,
  fechaLarga,
  nombreTemporada,
  sinEstrenar,
  temporadasParaPestanias,
  type TmdbSeason,
} from '@/lib/seasons'

/**
 * Reseñas de una serie, con pestañas por temporada: Serie · T1 · T2 · … ·
 * Especiales.
 *
 * "Serie" es el bloque de siempre (`ReviewsSection`, que llega como
 * `children`): la reseña de la serie entera es aparte de las de temporada, no
 * un promedio. Arriba suma "Promedio de tus temporadas" como dato suelto.
 *
 * Cada temporada tiene su portada, datos de TMDB, tu nota y reseña, y las de
 * la comunidad (tabla `season_reviews`, ver supabase-season-reviews.sql). Los
 * puntos (+5, una vez por temporada) los da la base.
 *
 * La pestaña elegida va en la URL como `?temporada=N` (link directo). Se lee y
 * se escribe en el navegador y no con useSearchParams: la ficha es estática
 * (ISR) y así no hace falta un Suspense que deje el bloque en blanco.
 */

interface Props {
  seriesId: number
  seriesTitle: string
  seriesPoster: string | null
  seasons: TmdbSeason[] | null | undefined
  /** El bloque de reseñas de la serie entera. */
  children: ReactNode
}

interface SeasonReview {
  id: string
  user_id: string
  season_number: number
  rating: number
  body: string | null
  has_spoiler: boolean
  created_at: string
  profiles: { id: string; username: string | null; display_name: string | null; avatar_url: string | null } | null
}

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const IMG = 'https://image.tmdb.org/t/p'
const MAX_RESENIAS = 30

function leerTemporadaDeLaURL(): number | null {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('temporada')
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null
}

function escribirTemporadaEnLaURL(n: number | null) {
  const url = new URL(window.location.href)
  if (n === null) url.searchParams.delete('temporada')
  else url.searchParams.set('temporada', String(n))
  window.history.replaceState(window.history.state, '', url)
}

export default function SeasonsReviews({ seriesId, seriesTitle, seriesPoster, seasons, children }: Props) {
  const pestanias = temporadasParaPestanias(seasons)
  const [activa, setActiva] = useState<number | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [promedioMio, setPromedioMio] = useState<{ avg: number; n: number } | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const tira = useRef<HTMLDivElement>(null)
  const supabase = useRef(createClient()).current

  // Temporada del link directo: se selecciona y se lleva la vista hasta acá.
  useEffect(() => {
    if (!pestanias) return
    const n = leerTemporadaDeLaURL()
    if (n !== null && pestanias.some(s => s.season_number === n)) {
      setActiva(n)
      requestAnimationFrame(() => raiz.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [supabase])

  // "Promedio de tus temporadas", para la pestaña Serie.
  useEffect(() => {
    if (!userId || !pestanias) return
    supabase
      .from('season_reviews')
      .select('rating')
      .eq('user_id', userId)
      .eq('series_id', seriesId)
      .then(({ data }) => {
        const notas = (data ?? []).map(r => Number((r as { rating: number }).rating))
        setPromedioMio(notas.length ? { avg: notas.reduce((a, b) => a + b, 0) / notas.length, n: notas.length } : null)
      })
    // `activa` en las dependencias: al volver a "Serie" después de reseñar una
    // temporada, el promedio ya la incluye.
  }, [userId, seriesId, activa, supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  // La pestaña elegida siempre a la vista: con 39 temporadas (Los Simpson),
  // entrar por link a la T38 la dejaba fuera de la tira.
  useEffect(() => {
    const boton = tira.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    const cont = tira.current
    if (!boton || !cont) return
    cont.scrollTo({ left: boton.offsetLeft - (cont.clientWidth - boton.offsetWidth) / 2, behavior: 'smooth' })
  }, [activa])

  if (!pestanias) return <>{children}</>

  const elegir = (n: number | null) => {
    setActiva(n)
    escribirTemporadaEnLaURL(n)
  }

  const temporada = activa === null ? null : pestanias.find(s => s.season_number === activa) ?? null

  return (
    <div ref={raiz} className="mt-10 scroll-mt-20">
      <div ref={tira} className="relative flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" role="tablist" aria-label="Temporadas">
        <Pestania activa={activa === null} onClick={() => elegir(null)}>Serie</Pestania>
        {pestanias.map(s => (
          <Pestania key={s.season_number} activa={activa === s.season_number} onClick={() => elegir(s.season_number)}>
            {etiquetaTemporada(s)}
          </Pestania>
        ))}
      </div>

      {temporada === null ? (
        <>
          {promedioMio && (
            <p className="mt-3 text-sm text-[#A0A0B0]">
              Promedio de tus temporadas:{' '}
              <span className="text-white font-semibold">{promedioMio.avg.toFixed(1)}</span>/5
              <span className="text-zinc-600"> · {promedioMio.n} {promedioMio.n === 1 ? 'temporada' : 'temporadas'}</span>
            </p>
          )}
          {/* ReviewsSection trae su propio margen de arriba */}
          <div className="-mt-6">{children}</div>
        </>
      ) : (
        <PanelTemporada
          key={temporada.season_number}
          seriesId={seriesId}
          seriesTitle={seriesTitle}
          seriesPoster={seriesPoster}
          temporada={temporada}
          userId={userId}
        />
      )}
    </div>
  )
}

function Pestania({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
        activa
          ? 'bg-[#FFFD02] text-black border-[#FFFD02]'
          : 'bg-[#13131A] text-[#A0A0B0] border-[#2A2A3A] hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

// ── Una temporada ─────────────────────────────────────────────────────────

function PanelTemporada({
  seriesId,
  seriesTitle,
  seriesPoster,
  temporada,
  userId,
}: {
  seriesId: number
  seriesTitle: string
  seriesPoster: string | null
  temporada: TmdbSeason
  userId: string | null
}) {
  const supabase = useRef(createClient()).current
  const n = temporada.season_number
  const bloqueada = sinEstrenar(temporada)
  const nombre = nombreTemporada(temporada)
  const fecha = fechaLarga(temporada.air_date)

  const [sinopsis, setSinopsis] = useState(temporada.overview?.trim() || '')
  const [resenias, setResenias] = useState<SeasonReview[]>([])
  const [stats, setStats] = useState<{ avg: number; n: number } | null>(null)
  const [cargando, setCargando] = useState(true)

  const [nota, setNota] = useState(0)
  const [hover, setHover] = useState(0)
  const [texto, setTexto] = useState('')
  const [spoiler, setSpoiler] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [spoilersVisibles, setSpoilersVisibles] = useState<Set<string>>(new Set())

  // TMDB a veces no tiene la sinopsis en castellano: se prueba en inglés.
  useEffect(() => {
    if (sinopsis || !TMDB_KEY) return
    fetch(`https://api.themoviedb.org/3/tv/${seriesId}/season/${n}?api_key=${TMDB_KEY}&language=en-US`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.overview) setSinopsis(d.overview) })
      .catch(() => {})
  }, [seriesId, n]) // eslint-disable-line react-hooks/exhaustive-deps

  // Traer y aplicar van separados: traer no toca el estado, y el estado se
  // cambia recién en el .then (así el efecto no hace un render de más). El
  // panel se monta de nuevo en cada temporada (key), así que arranca cargando;
  // después de guardar o borrar se recarga sin volver al spinner.
  async function traer() {
    const [lista, notas] = await Promise.all([
      supabase
        .from('season_reviews')
        .select('id, user_id, season_number, rating, body, has_spoiler, created_at, profiles(id, username, display_name, avatar_url)')
        .eq('series_id', seriesId)
        .eq('season_number', n)
        .order('created_at', { ascending: false })
        .limit(MAX_RESENIAS),
      supabase.from('season_reviews').select('rating').eq('series_id', seriesId).eq('season_number', n),
    ])
    const ns = (notas.data ?? []).map(r => Number((r as { rating: number }).rating))
    return {
      filas: (lista.data ?? []) as unknown as SeasonReview[],
      stats: ns.length ? { avg: ns.reduce((x, y) => x + y, 0) / ns.length, n: ns.length } : null,
    }
  }

  function aplicar(r: Awaited<ReturnType<typeof traer>>) {
    setResenias(r.filas)
    setStats(r.stats)
    setCargando(false)
  }

  const cargar = () => traer().then(aplicar)

  // La propia se busca aparte: puede no estar entre las últimas 30.
  useEffect(() => {
    traer().then(aplicar)
    if (!userId) return
    supabase
      .from('season_reviews')
      .select('rating, body, has_spoiler')
      .eq('user_id', userId)
      .eq('series_id', seriesId)
      .eq('season_number', n)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const r = data as { rating: number; body: string | null; has_spoiler: boolean }
        setNota(Number(r.rating))
        setTexto(r.body ?? '')
        setSpoiler(r.has_spoiler)
      })
  }, [seriesId, n, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const mia = userId ? resenias.find(r => r.user_id === userId) ?? null : null
  const yaTieneNota = mia !== null || nota > 0

  async function guardar() {
    if (!userId || nota <= 0 || guardando) return
    setGuardando(true)
    const { error } = await supabase.from('season_reviews').upsert(
      {
        user_id: userId,
        series_id: seriesId,
        season_number: n,
        series_title: seriesTitle,
        season_name: nombre,
        poster_path: temporada.poster_path ?? seriesPoster,
        rating: nota,
        body: texto.trim() || null,
        has_spoiler: texto.trim() ? spoiler : false,
      },
      { onConflict: 'user_id,series_id,season_number' },
    )
    setGuardando(false)
    if (error) {
      console.error('[season_reviews]', error)
      toast.error('No se pudo guardar. Intentá de nuevo.')
      return
    }
    toast.success('Guardado')
    void cargar()
  }

  async function borrar() {
    if (!userId || !confirm('¿Borrar tu nota y reseña de esta temporada?')) return
    const { error } = await supabase
      .from('season_reviews')
      .delete()
      .eq('user_id', userId)
      .eq('series_id', seriesId)
      .eq('season_number', n)
    if (error) {
      toast.error('No se pudo borrar.')
      return
    }
    setNota(0)
    setTexto('')
    setSpoiler(false)
    toast.success('Borrada')
    void cargar()
  }

  const mostrada = hover || nota
  const poster = temporada.poster_path ?? seriesPoster

  return (
    <div className="mt-5 space-y-6">
      {/* ── La temporada ── */}
      <div className="flex gap-4">
        <div className="w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800">
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${IMG}/w185${poster}`} alt={nombre} className="w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-white">{nombre}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#A0A0B0]">
            {fecha && <span className="inline-flex items-center gap-1"><Calendar size={13} /> {fecha}</span>}
            {!!temporada.episode_count && (
              <span className="inline-flex items-center gap-1">
                <Tv size={13} /> {temporada.episode_count} {temporada.episode_count === 1 ? 'episodio' : 'episodios'}
              </span>
            )}
            {!!temporada.vote_average && temporada.vote_average > 0 && (
              <span className="inline-flex items-center gap-1"><Star size={13} className="text-[#F5A623]" /> {temporada.vote_average.toFixed(1)} TMDB</span>
            )}
          </div>
          {sinopsis && <p className="mt-3 text-sm text-zinc-300 leading-relaxed line-clamp-6">{sinopsis}</p>}
        </div>
      </div>

      {/* ── Comunidad ── */}
      {stats && (
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 flex items-center gap-4">
          <p className="text-3xl font-bold leading-none" style={{ color: '#FFFD02' }}>{stats.avg.toFixed(1)}</p>
          <div className="text-sm text-[#A0A0B0]">
            <p>de 5 en Glynbox</p>
            <p className="text-xs text-zinc-600">{stats.n} {stats.n === 1 ? 'calificación' : 'calificaciones'}</p>
          </div>
        </div>
      )}

      {/* ── Lo tuyo ── */}
      <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
        {bloqueada ? (
          <p className="text-sm text-[#A0A0B0]">
            {fecha ? `Se estrena el ${fecha}.` : 'Todavía no tiene fecha de estreno.'} Vas a poder calificarla cuando salga.
          </p>
        ) : !userId ? (
          <p className="text-sm text-[#A0A0B0]">
            <Link href="/auth" className="text-[#FFFD02] hover:underline">Iniciá sesión</Link> para calificar esta temporada.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-[#A0A0B0] mr-1">Tu nota:</span>
              {[1, 2, 3, 4, 5].map(s => {
                const fill: 'full' | 'half' | 'empty' = mostrada >= s ? 'full' : mostrada >= s - 0.5 ? 'half' : 'empty'
                return (
                  <button
                    key={s}
                    type="button"
                    aria-label={`Calificar ${s - 0.5} o ${s} estrellas`}
                    onMouseMove={e => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setHover(e.clientX - rect.left < rect.width / 2 ? s - 0.5 : s)
                    }}
                    onMouseLeave={() => setHover(0)}
                    onClick={e => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setNota(e.clientX - rect.left < rect.width / 2 ? s - 0.5 : s)
                    }}
                    className="transition-transform hover:scale-110"
                  >
                    <StarIcon fill={fill} size={24} />
                  </button>
                )
              })}
              {nota > 0 && <span className="text-sm text-[#A0A0B0] ml-1">{nota}/5</span>}
            </div>

            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              maxLength={10000}
              rows={3}
              placeholder="¿Qué te pareció? (opcional)"
              className="mt-3 w-full bg-[#0A0A0F] border border-[#2A2A3A] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-[#FFFD02]/60"
            />
            {texto.trim() && (
              <label className="mt-2 flex items-center gap-2 text-sm text-[#A0A0B0]">
                <input type="checkbox" checked={spoiler} onChange={e => setSpoiler(e.target.checked)} />
                Tiene spoilers
              </label>
            )}

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={guardar}
                disabled={nota <= 0 || guardando}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FFFD02] text-black text-sm font-semibold disabled:opacity-40"
              >
                {guardando && <Loader2 size={14} className="animate-spin" />}
                {yaTieneNota ? 'Guardar cambios' : 'Guardar'}
              </button>
              {mia && (
                <button onClick={borrar} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-red-400">
                  <Trash2 size={13} /> Borrar
                </button>
              )}
              {nota <= 0 && <span className="text-xs text-zinc-600">Elegí una nota para guardar.</span>}
            </div>
          </>
        )}
      </div>

      {/* ── Reseñas de la temporada ── */}
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2 mb-3">
          <MessageSquare size={17} /> Reseñas de esta temporada
        </h3>
        {cargando ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-[#FFFD02]" /></div>
        ) : resenias.filter(r => r.body).length === 0 ? (
          <p className="text-sm text-[#A0A0B0]">Todavía no hay reseñas de esta temporada.</p>
        ) : (
          <div className="space-y-3">
            {resenias.filter(r => r.body).map(r => {
              const autor = r.profiles?.display_name ?? r.profiles?.username ?? 'Usuario'
              const oculto = r.has_spoiler && !spoilersVisibles.has(r.id)
              return (
                <div key={r.id} className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    {r.profiles?.username ? (
                      <Link href={`/usuario/${r.profiles.username}`} className="text-sm font-semibold text-white hover:text-[#FFFD02]">{autor}</Link>
                    ) : (
                      <span className="text-sm font-semibold text-white">{autor}</span>
                    )}
                    <span className="inline-flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <StarIcon key={s} size={12} fill={r.rating >= s ? 'full' : r.rating >= s - 0.5 ? 'half' : 'empty'} />
                      ))}
                    </span>
                    <span className="text-xs text-zinc-600 ml-auto">
                      {new Date(r.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  {oculto ? (
                    <button
                      onClick={() => setSpoilersVisibles(prev => new Set(prev).add(r.id))}
                      className="mt-2 text-sm text-[#A0A0B0] underline hover:text-white"
                    >
                      Tiene spoilers — mostrar
                    </button>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-300 whitespace-pre-line">{r.body}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
