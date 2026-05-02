'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { getPosterUrl } from '@/lib/tmdb'

interface CollectionMovie {
  id: number
  title: string
  poster_path: string | null
  release_date: string | null
}

export interface CollectionData {
  id: number
  name: string
  parts: CollectionMovie[]
}

export default function CollectionSection({
  collection,
  currentMovieId,
}: {
  collection: CollectionData
  currentMovieId: number
}) {
  const supabase = useRef(createClient()).current
  const scrollRef = useRef<HTMLDivElement>(null)
  const [watchedIds, setWatchedIds] = useState<Set<number>>(new Set())
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    async function loadWatched() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setIsLoggedIn(true)
      const movieIds = collection.parts.map(p => p.id)
      const { data } = await supabase
        .from('watched')
        .select('media_id')
        .eq('user_id', user.id)
        .eq('media_type', 'movie')
        .in('media_id', movieIds)
      if (data) setWatchedIds(new Set(data.map((w: { media_id: number }) => w.media_id)))
    }
    loadWatched()
  }, [collection.parts]) // eslint-disable-line react-hooks/exhaustive-deps

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' })
  }

  const sorted = [...collection.parts].sort((a, b) => {
    const ya = a.release_date ?? '0'
    const yb = b.release_date ?? '0'
    return ya.localeCompare(yb)
  })

  const total = sorted.length
  const watchedCount = sorted.filter(m => watchedIds.has(m.id)).length

  return (
    <div className="mt-8 sm:mt-10">
      <div className="mb-3">
        <h2 className="text-lg sm:text-xl font-bold">
          Parte de:{' '}
          <span className="text-[#FFFD02]">{collection.name}</span>
        </h2>
        <p className="text-sm text-[#A0A0B0] mt-0.5">
          {isLoggedIn
            ? `Viste ${watchedCount} de ${total} ${total === 1 ? 'película' : 'películas'}`
            : `${total} ${total === 1 ? 'película' : 'películas'} en la saga`}
        </p>
      </div>

      <div className="relative group/carousel">
        <button
          onClick={() => scroll('left')}
          className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-8 h-8 rounded-full bg-[#1C1C27] border border-[#2A2A3A] items-center justify-center text-white hover:bg-zinc-700 transition-all opacity-0 group-hover/carousel:opacity-100"
          aria-label="Anterior"
        >
          <ChevronLeft size={16} />
        </button>

        <div ref={scrollRef} className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
          {sorted.map(film => {
            const isCurrent = film.id === currentMovieId
            const isWatched = watchedIds.has(film.id)
            const year = film.release_date?.slice(0, 4)
            return (
              <Link
                key={film.id}
                href={`/movie/${film.id}`}
                className="shrink-0 w-28 sm:w-32 group/item"
              >
                <div
                  className={`aspect-[2/3] rounded-lg overflow-hidden relative transition-all duration-200 ${
                    isCurrent
                      ? 'ring-2 ring-[#FFFD02]'
                      : 'ring-1 ring-transparent hover:ring-zinc-600'
                  }`}
                >
                  {film.poster_path ? (
                    <Image
                      src={getPosterUrl(film.poster_path, 'w185')}
                      alt={film.title}
                      fill
                      className="object-cover group-hover/item:scale-105 transition-transform duration-300"
                      sizes="128px"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#2A2A3A] text-[#FFFD02] text-[10px] text-center p-2">
                      {film.title}
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute inset-0 bg-[#FFFD02]/8 pointer-events-none" />
                  )}
                  {isWatched && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#FFFD02]/20 border border-[#FFFD02]/60 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-2.5 h-2.5 text-[#FFFD02]">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-1.5 line-clamp-2 leading-tight group-hover/item:text-white transition-colors">
                  {film.title}
                </p>
                {year && <p className="text-[10px] text-[#A0A0B0]">{year}</p>}
              </Link>
            )
          })}
        </div>

        <button
          onClick={() => scroll('right')}
          className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-8 h-8 rounded-full bg-[#1C1C27] border border-[#2A2A3A] items-center justify-center text-white hover:bg-zinc-700 transition-all opacity-0 group-hover/carousel:opacity-100"
          aria-label="Siguiente"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
