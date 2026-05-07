'use client'

import { MovieCard } from './MovieCard'

interface MovieGridProps {
  tmdbIds:    number[]
  mediaType?: 'movie' | 'tv'
  label?:     string
}

export function MovieGrid({ tmdbIds, mediaType = 'movie', label }: MovieGridProps) {
  if (!tmdbIds?.length) return null
  return (
    <div className="my-6">
      {label && (
        <p className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-widest mb-3">{label}</p>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {tmdbIds.map(id => (
          <MovieCard key={id} tmdbId={id} mediaType={mediaType} />
        ))}
      </div>
    </div>
  )
}
