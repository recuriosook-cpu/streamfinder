'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { StarIcon } from '@/components/StarDisplay'
import { sinEstrenar } from '@/lib/seasons'

/**
 * Calificación de capítulos en la página de una temporada (tabla
 * `episode_ratings`, ver supabase-episode-ratings-2026-09.sql).
 *
 * Todo se carga en el navegador y nunca en el servidor: la página de la
 * temporada se cachea 24 h en la CDN y se genera como anónimo, así que no
 * puede llevar ni la nota del usuario ni los promedios. El proveedor pide una
 * sola vez por página el resumen de la temporada (promedio y votos por
 * capítulo, vía `episode_ratings_resumen`) y las notas propias; cada capítulo
 * lee de ahí.
 *
 * Las notas de los demás son privadas: sólo se ven promedios. Los puntos (+1
 * por capítulo, tope 10 por día) los da la base con un trigger.
 */

type Resumen = { promedio: number; votos: number }

interface Contexto {
  listo: boolean
  userId: string | null
  resumen: Map<number, Resumen>
  mias: Map<number, number>
  calificar: (episodio: number, nombre: string | null, valor: number) => void
}

const EpisodeRatingsContext = createContext<Contexto | null>(null)

export function EpisodeRatingsProvider({
  seriesId,
  seasonNumber,
  seriesTitle,
  children,
}: {
  seriesId: number
  seasonNumber: number
  seriesTitle: string
  children: ReactNode
}) {
  const router = useRouter()
  const [supabase] = useState(createClient)
  const [listo, setListo] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [resumen, setResumen] = useState<Map<number, Resumen>>(new Map())
  const [mias, setMias] = useState<Map<number, number>>(new Map())

  const traerResumen = useCallback(async () => {
    const { data, error } = await supabase.rpc('episode_ratings_resumen', {
      p_series_id: seriesId,
      p_season_number: seasonNumber,
    })
    if (error) console.error('[episode_ratings] resumen:', error)
    const filas = (data ?? []) as { episode_number: number; promedio: number | string; votos: number }[]
    return new Map(filas.map(f => [f.episode_number, { promedio: Number(f.promedio), votos: f.votos }]))
  }, [supabase, seriesId, seasonNumber])

  // Traer y aplicar van separados: traer no toca el estado, y el estado se
  // cambia recién en el .then (así el efecto no hace un render de más).
  useEffect(() => {
    let vivo = true
    const traer = async () => {
      const [{ data: { user } }, res] = await Promise.all([supabase.auth.getUser(), traerResumen()])
      let propias = new Map<number, number>()
      if (user) {
        const { data, error } = await supabase
          .from('episode_ratings')
          .select('episode_number, rating')
          .eq('user_id', user.id)
          .eq('series_id', seriesId)
          .eq('season_number', seasonNumber)
        if (error) console.error('[episode_ratings] mías:', error)
        propias = new Map((data ?? []).map(f => [f.episode_number as number, Number(f.rating)]))
      }
      return { user: user?.id ?? null, res, propias }
    }
    traer().then(({ user, res, propias }) => {
      if (!vivo) return
      setUserId(user)
      setResumen(res)
      setMias(propias)
      setListo(true)
    })
    return () => { vivo = false }
  }, [supabase, seriesId, seasonNumber, traerResumen])

  const calificar = useCallback((episodio: number, nombre: string | null, valor: number) => {
    if (!userId) { router.push('/auth'); return }
    const anterior = mias.get(episodio) ?? 0
    // Tocar la misma nota la borra, como en la ficha.
    const nueva = valor === anterior ? 0 : valor

    setMias(prev => {
      const m = new Map(prev)
      if (nueva === 0) m.delete(episodio)
      else m.set(episodio, nueva)
      return m
    })

    const guardar = nueva === 0
      ? supabase.from('episode_ratings').delete()
          .eq('user_id', userId).eq('series_id', seriesId)
          .eq('season_number', seasonNumber).eq('episode_number', episodio)
      : supabase.from('episode_ratings').upsert({
          user_id: userId,
          series_id: seriesId,
          season_number: seasonNumber,
          episode_number: episodio,
          series_title: seriesTitle.slice(0, 300),
          episode_name: nombre?.slice(0, 300) ?? null,
          rating: nueva,
        }, { onConflict: 'user_id,series_id,season_number,episode_number' })

    Promise.resolve(guardar).then(async ({ error }) => {
      if (error) {
        console.error('[episode_ratings] guardar:', error)
        toast.error('No pudimos guardar tu nota. Probá de nuevo.')
        setMias(prev => {
          const m = new Map(prev)
          if (anterior === 0) m.delete(episodio)
          else m.set(episodio, anterior)
          return m
        })
        return
      }
      // El promedio se vuelve a pedir en vez de recalcularlo acá: el que
      // devuelve la base viene redondeado y no alcanza para sumar y restar.
      setResumen(await traerResumen())
    })
  }, [userId, mias, supabase, seriesId, seasonNumber, seriesTitle, router, traerResumen])

  return (
    <EpisodeRatingsContext.Provider value={{ listo, userId, resumen, mias, calificar }}>
      {children}
    </EpisodeRatingsContext.Provider>
  )
}

/**
 * La fila de un capítulo: tus estrellas a la izquierda y el promedio de
 * Glynbox a la derecha. Sin votos, el promedio no se muestra (nada de "0").
 * Sin estrenar, no hay fila: el capítulo ya dice "Se estrena el …".
 */
export function EpisodeRating({
  episodeNumber,
  episodeName,
  airDate,
}: {
  episodeNumber: number
  episodeName: string | null
  airDate: string | null
}) {
  const ctx = useContext(EpisodeRatingsContext)
  const [hover, setHover] = useState(0)

  // Mientras carga (y en el HTML del servidor) va un espacio del mismo alto,
  // así la lista no salta. La fecha se chequea recién en el navegador: la
  // página puede estar cacheada desde ayer y el capítulo haberse estrenado hoy.
  if (!ctx || !ctx.listo) return <div className="h-7 mt-2" aria-hidden />
  if (sinEstrenar({ air_date: airDate })) return null

  const mia = ctx.mias.get(episodeNumber) ?? 0
  const mostrada = hover || mia
  const stats = ctx.resumen.get(episodeNumber)

  return (
    <div className="mt-2 flex items-center justify-between gap-3">
      <div className="flex items-center" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map(s => {
          const fill: 'full' | 'half' | 'empty' = mostrada >= s ? 'full' : mostrada >= s - 0.5 ? 'half' : 'empty'
          return (
            <button
              key={s}
              type="button"
              aria-label={`Calificar el capítulo ${episodeNumber} con ${s - 0.5} o ${s} estrellas`}
              onMouseMove={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                setHover(e.clientX - rect.left < rect.width / 2 ? s - 0.5 : s)
              }}
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                ctx.calificar(episodeNumber, episodeName, e.clientX - rect.left < rect.width / 2 ? s - 0.5 : s)
                setHover(0)
              }}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <StarIcon fill={fill} size={20} />
            </button>
          )
        })}
        {mia > 0 && <span className="text-xs text-[#A0A0B0] ml-1.5">Tu nota: {mia}</span>}
      </div>
      {stats && stats.votos > 0 && (
        <span className="shrink-0 inline-flex items-center gap-1 text-xs text-[#A0A0B0]">
          <StarIcon fill="full" size={12} />
          <span className="text-white font-semibold">{stats.promedio.toFixed(1)}</span>
          · {stats.votos} {stats.votos === 1 ? 'voto' : 'votos'}
        </span>
      )}
    </div>
  )
}
