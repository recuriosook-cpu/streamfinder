'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { StarIcon } from '@/components/StarDisplay'
import { fechaLarga, nombreTemporada, sinEstrenar, type TmdbSeason } from '@/lib/seasons'

/**
 * Lo de Glynbox sobre una temporada: el promedio de la comunidad, tu nota y
 * reseña, y las reseñas de los demás (tabla `season_reviews`, ver
 * supabase-season-reviews.sql). Va en la página de la temporada, debajo de su
 * portada y datos. Sin estrenar: se ve, pero no se puede calificar.
 *
 * Los puntos (+5, una vez por temporada) los da la base con un trigger.
 */

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

const MAX_RESENIAS = 30

export default function SeasonReviewPanel({
  seriesId,
  seriesTitle,
  seriesPoster,
  temporada,
}: {
  seriesId: number
  seriesTitle: string
  seriesPoster: string | null
  temporada: Pick<TmdbSeason, 'season_number' | 'name' | 'air_date' | 'poster_path'>
}) {
  const [supabase] = useState(createClient)
  const [userId, setUserId] = useState<string | null>(null)
  // Si tiene una guardada, aunque no esté entre las 30 más recientes de la lista.
  const [tengoGuardada, setTengoGuardada] = useState(false)
  const n = temporada.season_number
  const bloqueada = sinEstrenar(temporada)
  const nombre = nombreTemporada(temporada)
  const fecha = fechaLarga(temporada.air_date)

  const [resenias, setResenias] = useState<SeasonReview[]>([])
  const [stats, setStats] = useState<{ avg: number; n: number } | null>(null)
  const [cargando, setCargando] = useState(true)

  const [nota, setNota] = useState(0)
  const [hover, setHover] = useState(0)
  const [texto, setTexto] = useState('')
  const [spoiler, setSpoiler] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [spoilersVisibles, setSpoilersVisibles] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [supabase])

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
        setTengoGuardada(true)
        const r = data as { rating: number; body: string | null; has_spoiler: boolean }
        setNota(Number(r.rating))
        setTexto(r.body ?? '')
        setSpoiler(r.has_spoiler)
      })
  }, [seriesId, n, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const yaTieneNota = tengoGuardada

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
    setTengoGuardada(true)
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
    setTengoGuardada(false)
    setNota(0)
    setTexto('')
    setSpoiler(false)
    toast.success('Borrada')
    void cargar()
  }

  const mostrada = hover || nota

  return (
    <div className="space-y-6">
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
              {tengoGuardada && (
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
