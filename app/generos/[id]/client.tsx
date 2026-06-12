'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Film, Tv, LayoutGrid, Star } from 'lucide-react'
import { GENRE_NAMES } from './page'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB = 'https://api.themoviedb.org/3'

const GENRE_EMOJIS: Record<number, string> = {
  28: '💥', 12: '🌍', 16: '🎨', 35: '😂', 80: '🔫', 99: '🎥',
  18: '🎭', 10751: '👨‍👩‍👧', 14: '🧙', 36: '📜', 27: '👻', 10402: '🎵',
  9648: '🔍', 10749: '💕', 878: '🚀', 53: '🕵️', 10752: '⚔️', 37: '🤠',
  10759: '🏃', 10762: '🧒', 10765: '🌌', 10766: '💔', 10767: '🎤', 10768: '🪖',
}

interface MediaItem {
  id: number
  title: string
  posterPath: string | null
  voteAverage: number
  year: string
  type: 'movie' | 'tv'
}

type Filter = 'all' | 'movie' | 'tv'

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 animate-pulse">
      {Array.from({ length: 18 }).map((_, i) => (
        <div key={i} className="aspect-[2/3] rounded-xl bg-[#1C1C27]" />
      ))}
    </div>
  )
}

function MediaCard({ item }: { item: MediaItem }) {
  return (
    <Link
      href={`/${item.type}/${item.id}`}
      className="group block"
    >
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#1C1C27] ring-1 ring-white/5 transition-all duration-200 group-hover:ring-[#FFFD02]/60 group-hover:scale-[1.03]">
        {item.posterPath ? (
          <Image
            src={`https://image.tmdb.org/t/p/w342${item.posterPath}`}
            alt={item.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, (max-width: 1024px) 20vw, 16vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#A0A0B0] text-[10px] text-center p-2">
            {item.title}
          </div>
        )}
        {item.voteAverage > 0 && (
          <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
            <Star size={9} className="text-yellow-400" fill="currentColor" />
            <span className="text-[10px] text-white font-semibold tabular-nums">
              {item.voteAverage.toFixed(1)}
            </span>
          </div>
        )}
        <div className="absolute top-1.5 right-1.5">
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-[#A0A0B0]">
            {item.type === 'movie' ? '🎬' : '📺'}
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-zinc-400 line-clamp-1 group-hover:text-white transition-colors leading-tight px-0.5">
        {item.title}
      </p>
      {item.year && (
        <p className="text-[10px] text-zinc-600 px-0.5">{item.year}</p>
      )}
    </Link>
  )
}

export default function GenreClient({ genreId }: { genreId: number }) {
  const genreName = GENRE_NAMES[genreId] ?? 'Género'
  const emoji = GENRE_EMOJIS[genreId] ?? '🎬'

  const [filter, setFilter] = useState<Filter>('all')
  const [movies, setMovies] = useState<MediaItem[]>([])
  const [tvShows, setTvShows] = useState<MediaItem[]>([])
  const [moviePage, setMoviePage] = useState(1)
  const [tvPage, setTvPage] = useState(1)
  const [movieHasMore, setMovieHasMore] = useState(true)
  const [tvHasMore, setTvHasMore] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchMovies = useCallback(async (page: number) => {
    if (!TMDB_KEY) return
    const res = await fetch(
      `${TMDB}/discover/movie?api_key=${TMDB_KEY}&with_genres=${genreId}&language=es-AR&region=AR&sort_by=popularity.desc&vote_count.gte=50&page=${page}`
    )
    if (!res.ok) return
    const data = await res.json()
    type R = { id: number; title?: string; poster_path: string | null; vote_average: number; release_date?: string }
    const items: MediaItem[] = (data.results ?? []).map((m: R) => ({
      id: m.id,
      title: m.title ?? '',
      posterPath: m.poster_path,
      voteAverage: m.vote_average,
      year: (m.release_date ?? '').slice(0, 4),
      type: 'movie' as const,
    }))
    setMovies(prev => page === 1 ? items : [...prev, ...items.filter(m => !prev.find(p => p.id === m.id))])
    setMovieHasMore(data.page < data.total_pages && data.page < 5)
    setMoviePage(data.page)
  }, [genreId])

  const fetchTV = useCallback(async (page: number) => {
    if (!TMDB_KEY) return
    const res = await fetch(
      `${TMDB}/discover/tv?api_key=${TMDB_KEY}&with_genres=${genreId}&language=es-AR&sort_by=popularity.desc&vote_count.gte=20&page=${page}`
    )
    if (!res.ok) return
    const data = await res.json()
    type R = { id: number; name?: string; poster_path: string | null; vote_average: number; first_air_date?: string }
    const items: MediaItem[] = (data.results ?? []).map((t: R) => ({
      id: t.id,
      title: t.name ?? '',
      posterPath: t.poster_path,
      voteAverage: t.vote_average,
      year: (t.first_air_date ?? '').slice(0, 4),
      type: 'tv' as const,
    }))
    setTvShows(prev => page === 1 ? items : [...prev, ...items.filter(t => !prev.find(p => p.id === t.id))])
    setTvHasMore(data.page < data.total_pages && data.page < 5)
    setTvPage(data.page)
  }, [genreId])

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchMovies(1), fetchTV(1)]).finally(() => setLoading(false))
  }, [fetchMovies, fetchTV])

  const handleLoadMore = async () => {
    setLoadingMore(true)
    const tasks: Promise<void>[] = []
    if (filter !== 'tv'   && movieHasMore) tasks.push(fetchMovies(moviePage + 1))
    if (filter !== 'movie' && tvHasMore)   tasks.push(fetchTV(tvPage + 1))
    await Promise.all(tasks)
    setLoadingMore(false)
  }

  const displayItems: MediaItem[] = (() => {
    if (filter === 'movie') return movies
    if (filter === 'tv')    return tvShows
    // Interleave movies and TV 2:1
    const result: MediaItem[] = []
    let mi = 0, ti = 0
    while (mi < movies.length || ti < tvShows.length) {
      if (mi < movies.length)  result.push(movies[mi++])
      if (mi < movies.length)  result.push(movies[mi++])
      if (ti < tvShows.length) result.push(tvShows[ti++])
    }
    return result
  })()

  const hasMore = filter === 'movie' ? movieHasMore : filter === 'tv' ? tvHasMore : (movieHasMore || tvHasMore)

  const tabs: { key: Filter; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'all',   label: 'Todo',      icon: <LayoutGrid size={14} />, count: movies.length + tvShows.length },
    { key: 'movie', label: 'Películas', icon: <Film size={14} />,       count: movies.length },
    { key: 'tv',    label: 'Series',    icon: <Tv size={14} />,         count: tvShows.length },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0A0A0F' }}>
      {/* Hero */}
      <div className="border-b border-[#1C1C27]">
        <div className="max-w-7xl mx-auto px-4 py-10">
          <Link href="/que-ver" className="inline-flex items-center gap-1.5 text-xs text-[#A0A0B0] hover:text-white transition-colors mb-5">
            ← Volver a Qué Ver
          </Link>
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0"
              style={{ backgroundColor: 'rgba(255,253,2,0.08)', border: '1px solid rgba(255,253,2,0.15)' }}
            >
              {emoji}
            </div>
            <div>
              <p className="text-xs font-semibold text-[#FFFD02] uppercase tracking-widest mb-1">Género</p>
              <h1 className="text-3xl sm:text-4xl font-bold text-white">{genreName}</h1>
              {!loading && (
                <p className="text-sm text-[#A0A0B0] mt-1">
                  {movies.length + tvShows.length > 0
                    ? `${movies.length} películas · ${tvShows.length} series`
                    : 'Sin resultados'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-1 w-fit">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === t.key
                  ? 'bg-[#FFFD02]/15 text-[#FFFD02]'
                  : 'text-[#A0A0B0] hover:text-white hover:bg-[#1C1C27]'
              }`}
            >
              {t.icon}
              {t.label}
              {!loading && t.count > 0 && (
                <span className="text-[10px] tabular-nums opacity-60">({t.count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <GridSkeleton />
        ) : displayItems.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">{emoji}</div>
            <p className="text-[#A0A0B0]">No encontramos títulos de {genreName} en este momento.</p>
            <Link
              href="/que-ver"
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border border-[#FFFD02]/40 text-[#FFFD02] hover:bg-[#FFFD02]/10 transition-colors"
            >
              Explorar otros géneros
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {displayItems.map(item => (
                <MediaCard key={`${item.type}-${item.id}`} item={item} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-10 flex justify-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-8 py-3 rounded-full text-sm font-semibold border border-[#2A2A3A] text-[#A0A0B0] hover:border-[#FFFD02] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loadingMore ? (
                    <span className="w-4 h-4 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
                  ) : null}
                  {loadingMore ? 'Cargando...' : 'Ver más'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
