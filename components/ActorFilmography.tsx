'use client'

import { useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getPosterUrl } from '@/lib/tmdb'

interface Credit {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  media_type: 'movie' | 'tv'
  release_date?: string
  first_air_date?: string
}

interface Props {
  credits: Credit[]
}

export default function ActorFilmography({ credits }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' })
  }

  return (
    <section>
      <h2 className="text-xl font-bold mb-4">
        Filmografía
        <span className="ml-2 text-sm font-normal text-zinc-500">{credits.length} títulos</span>
      </h2>

      <div className="relative group/filmography">
        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 items-center justify-center text-white hover:bg-zinc-700 transition-all opacity-0 group-hover/filmography:opacity-100"
          aria-label="Anterior"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Scroll container */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto no-scrollbar pb-2"
        >
          {credits.map(credit => {
            const title = credit.title ?? credit.name ?? ''
            const year = (credit.release_date ?? credit.first_air_date ?? '').slice(0, 4)
            const href = `/${credit.media_type}/${credit.id}`
            return (
              <Link
                key={`${credit.media_type}-${credit.id}`}
                href={href}
                className="shrink-0 w-28 group"
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-1.5">
                  <Image
                    src={getPosterUrl(credit.poster_path, 'w185')}
                    alt={title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <p className="text-xs font-medium text-white leading-tight line-clamp-2 group-hover:text-zinc-300 transition-colors">
                  {title}
                </p>
                {year && <p className="text-[11px] text-zinc-500 mt-0.5">{year}</p>}
              </Link>
            )
          })}
        </div>

        {/* Right arrow */}
        <button
          onClick={() => scroll('right')}
          className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 items-center justify-center text-white hover:bg-zinc-700 transition-all opacity-0 group-hover/filmography:opacity-100"
          aria-label="Siguiente"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </section>
  )
}
