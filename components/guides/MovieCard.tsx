'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const IMG = 'https://image.tmdb.org/t/p/w342'

interface TmdbData {
  id:           number
  title?:       string
  name?:        string
  poster_path:  string | null
  release_date?: string
  first_air_date?: string
  vote_average?: number
}

interface MovieCardProps {
  tmdbId:     number
  mediaType?: 'movie' | 'tv'
}

export function MovieCard({ tmdbId, mediaType = 'movie' }: MovieCardProps) {
  const [data, setData] = useState<TmdbData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!TMDB_KEY) { setLoading(false); return }
    fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=es-AR`,
      { cache: 'force-cache' }
    )
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [tmdbId, mediaType])

  const title = mediaType === 'movie' ? data?.title : data?.name
  const year  = (mediaType === 'movie' ? data?.release_date : data?.first_air_date)?.split('-')[0]
  const href  = `/${mediaType}/${tmdbId}`

  if (loading) {
    return (
      <div className="rounded-xl overflow-hidden bg-[#13131A] border border-[#2A2A3A] animate-pulse">
        <div className="aspect-[2/3] bg-zinc-800" />
        <div className="p-3 space-y-1.5">
          <div className="h-3 bg-zinc-800 rounded w-3/4" />
          <div className="h-2.5 bg-zinc-800 rounded w-1/3" />
        </div>
      </div>
    )
  }

  return (
    <Link href={href} className="group rounded-xl overflow-hidden bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/50 transition-all block">
      <div className="aspect-[2/3] relative overflow-hidden bg-zinc-800">
        {data?.poster_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${IMG}${data.poster_path}`}
            alt={title ?? ''}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs px-3 text-center">
            {title ?? `#${tmdbId}`}
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold text-white leading-snug line-clamp-2">{title ?? '—'}</p>
        {year && <p className="text-[10px] text-zinc-600 mt-0.5">{year}</p>}
      </div>
    </Link>
  )
}
