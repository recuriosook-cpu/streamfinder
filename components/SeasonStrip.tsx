import Link from 'next/link'
import { etiquetaTemporada, temporadasParaPestanias, type TmdbSeason } from '@/lib/seasons'

/**
 * Fila de temporadas: "Temporadas (T1) (T2) … (Especiales) Ver episodios ›".
 *
 * Va arriba en la ficha, debajo de los géneros (se ve sin scrollear), y arriba
 * de la página de cada temporada con la actual marcada. Cada chip lleva a
 * `/tv/{id}/temporada/{n}`. Es un server component: son links, no hace falta
 * JavaScript.
 *
 * Con una sola temporada no hay chips: sólo "Ver los N episodios ›".
 */
export default function SeasonStrip({
  seriesId,
  seasons,
  activa,
}: {
  seriesId: number
  seasons: TmdbSeason[] | null | undefined
  /** La temporada de la página actual, para marcarla. */
  activa?: number
}) {
  if (!seasons?.length) return null

  const pestanias = temporadasParaPestanias(seasons)
  const url = (n: number) => `/tv/${seriesId}/temporada/${n}`

  if (!pestanias) {
    const unica = seasons[0]
    if (activa !== undefined) return null
    return (
      <Link href={url(unica.season_number)} className="inline-flex items-center gap-1 text-sm text-[#FFFD02] hover:underline mb-4">
        {unica.episode_count ? `Ver los ${unica.episode_count} episodios` : 'Ver episodios'} ›
      </Link>
    )
  }

  const primera = pestanias.find(s => s.season_number > 0) ?? pestanias[0]

  return (
    <nav aria-label="Temporadas" className="mb-4 flex items-center gap-3 min-w-0">
      <span className="text-sm font-semibold text-white shrink-0">Temporadas</span>
      <div className="flex gap-2 overflow-x-auto py-1 min-w-0 [scrollbar-width:none]">
        {pestanias.map(s => {
          const esActiva = s.season_number === activa
          return (
            <Link
              key={s.season_number}
              href={url(s.season_number)}
              aria-current={esActiva ? 'page' : undefined}
              className={`shrink-0 px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                esActiva
                  ? 'bg-[#FFFD02] text-black border-[#FFFD02]'
                  : 'bg-[#13131A] text-[#A0A0B0] border-[#2A2A3A] hover:text-white'
              }`}
            >
              {etiquetaTemporada(s)}
            </Link>
          )
        })}
      </div>
      {activa === undefined && (
        <Link href={url(primera.season_number)} className="hidden sm:inline shrink-0 text-sm text-[#FFFD02] hover:underline">
          Ver episodios ›
        </Link>
      )}
    </nav>
  )
}
