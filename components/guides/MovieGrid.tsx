'use client'

import { MovieCard } from './MovieCard'

interface MovieGridProps {
  tmdbIds:    number[]
  mediaType?: 'movie' | 'tv'
  label?:     string
}

export function MovieGrid({ tmdbIds, mediaType, label }: MovieGridProps) {
  if (!tmdbIds?.length) return null

  // Warn in dev when mediaType is omitted — omitting it silently defaults to
  // 'movie' and will show wrong content for TV series grids.
  if (process.env.NODE_ENV === 'development' && mediaType === undefined) {
    console.warn(
      `[MovieGrid] mediaType no fue especificado para IDs [${tmdbIds.join(', ')}]. ` +
      `Se usa "movie" por defecto. Si estás mostrando series, pasá mediaType="tv".`
    )
  }

  const resolvedType = mediaType ?? 'movie'
  return (
    <div className="my-6">
      {label && (
        <p className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-widest mb-3">{label}</p>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {tmdbIds.map(id => (
          <MovieCard key={id} tmdbId={id} mediaType={resolvedType} />
        ))}
      </div>
    </div>
  )
}
