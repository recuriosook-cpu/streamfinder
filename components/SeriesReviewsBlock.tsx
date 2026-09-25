'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/**
 * El bloque de reseñas de la ficha de una serie: las de la serie entera
 * (`ReviewsSection`, llega como `children`) y, arriba, "Promedio de tus
 * temporadas" como dato aparte (la reseña de la serie no es un promedio).
 *
 * Lo de cada temporada vive en su página, `/tv/{id}/temporada/{n}`. Los links
 * viejos `/tv/{id}?temporada=N` (de cuando las temporadas eran pestañas acá)
 * se mandan ahí. Se hace en el navegador porque la ficha es estática.
 */
export default function SeriesReviewsBlock({
  seriesId,
  hasSeasons,
  children,
}: {
  seriesId: number
  /** Si la serie tiene temporadas que se puedan calificar. */
  hasSeasons: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const [supabase] = useState(createClient)
  const [promedio, setPromedio] = useState<{ avg: number; n: number } | null>(null)

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('temporada')
    if (raw !== null && /^\d+$/.test(raw)) router.replace(`/tv/${seriesId}/temporada/${raw}`)
  }, [router, seriesId])

  useEffect(() => {
    if (!hasSeasons) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('season_reviews')
        .select('rating')
        .eq('user_id', user.id)
        .eq('series_id', seriesId)
        .then(({ data }) => {
          const notas = (data ?? []).map(r => Number((r as { rating: number }).rating))
          if (notas.length) setPromedio({ avg: notas.reduce((a, b) => a + b, 0) / notas.length, n: notas.length })
        })
    })
  }, [supabase, seriesId, hasSeasons])

  return (
    <>
      {promedio && (
        <p className="mt-10 -mb-6 text-sm text-[#A0A0B0]">
          Promedio de tus temporadas:{' '}
          <span className="text-white font-semibold">{promedio.avg.toFixed(1)}</span>/5
          <span className="text-zinc-600"> · {promedio.n} {promedio.n === 1 ? 'temporada' : 'temporadas'}</span>
        </p>
      )}
      {children}
    </>
  )
}
