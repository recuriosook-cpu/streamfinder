'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getPosterUrl } from '@/lib/tmdb'

interface Credit {
  id: number
  title?: string
  name?: string
  character?: string
  poster_path: string | null
  media_type: 'movie' | 'tv'
  release_date?: string
  first_air_date?: string
}

interface Props {
  credits: Credit[]
}

type Filter = 'all' | 'movie' | 'tv'

export default function ActorFilmography({ credits }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const movies = credits.filter(c => c.media_type === 'movie')
  const series  = credits.filter(c => c.media_type === 'tv')
  const visible = filter === 'movie' ? movies : filter === 'tv' ? series : credits

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' })
  }

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'all',   label: 'Todo',      count: credits.length },
    { key: 'movie', label: 'Películas', count: movies.length  },
    { key: 'tv',    label: 'Series',    count: series.length  },
  ]

  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h2 className="text-xl font-bold">
          Filmografía
          <span className="ml-2 text-sm font-normal text-[#A0A0B0]">{visible.length} títulos</span>
        </h2>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setFilter(tab.key); scrollRef.current?.scrollTo({ left: 0 }) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === tab.key
                  ? 'bg-[#FFFD02] text-black'
                  : 'text-[#A0A0B0] hover:text-white'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 text-[10px] ${filter === tab.key ? 'text-black/60' : 'text-zinc-600'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-[#A0A0B0] text-sm py-4">Sin títulos en esta categoría.</p>
      ) : (
        <div className="relative group/filmography">
          <button
            onClick={() => scroll('left')}
            className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-8 h-8 rounded-full bg-[#1C1C27] border border-[#2A2A3A] items-center justify-center text-white hover:bg-zinc-700 transition-all opacity-0 group-hover/filmography:opacity-100"
            aria-label="Anterior"
          >
            <ChevronLeft size={16} />
          </button>

          <div ref={scrollRef} className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {visible.map(credit => {
              const title = credit.title ?? credit.name ?? ''
              const year  = (credit.release_date ?? credit.first_air_date ?? '').slice(0, 4)
              const href  = `/${credit.media_type}/${credit.id}`
              return (
                <Link key={`${credit.media_type}-${credit.id}`} href={href} className="shrink-0 w-28 group">
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-1.5">
                    <Image
                      src={getPosterUrl(credit.poster_path, 'w185')}
                      alt={title}
                      fill
                      loading="lazy"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="112px"
                    />
                    {/* Media type badge */}
                    <span
                      className="absolute top-1.5 left-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={credit.media_type === 'movie'
                        ? { backgroundColor: '#2563eb', color: '#fff' }
                        : { backgroundColor: '#FFFD02', color: '#000' }}
                    >
                      {credit.media_type === 'movie' ? 'Peli' : 'Serie'}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-white leading-tight line-clamp-2 group-hover:text-zinc-300 transition-colors">
                    {title}
                  </p>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    {year && <p className="text-[11px] text-[#A0A0B0]">{year}</p>}
                  </div>
                  {credit.character && (
                    <p className="text-[10px] text-zinc-600 mt-0.5 italic line-clamp-1">{credit.character}</p>
                  )}
                </Link>
              )
            })}
          </div>

          <button
            onClick={() => scroll('right')}
            className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-8 h-8 rounded-full bg-[#1C1C27] border border-[#2A2A3A] items-center justify-center text-white hover:bg-zinc-700 transition-all opacity-0 group-hover/filmography:opacity-100"
            aria-label="Siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </section>
  )
}
