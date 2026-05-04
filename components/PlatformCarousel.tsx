'use client'

import { useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getPosterUrl } from '@/lib/tmdb'

interface MediaItem {
  id: number
  title: string
  posterPath: string | null
  mediaType: 'movie' | 'tv'
  voteAverage?: number
  year?: string
}

interface PlatformCarouselProps {
  name: string
  color: string
  items: MediaItem[]
}

const SCROLL_AMOUNT = 400

export default function PlatformCarousel({ name, color, items }: PlatformCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({
      left: dir === 'right' ? SCROLL_AMOUNT : -SCROLL_AMOUNT,
      behavior: 'smooth',
    })
  }

  if (!items.length) return null

  return (
    <section className="mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-3">
          <span
            className="px-3 py-1 rounded-md text-white text-sm font-bold tracking-wide"
            style={{ backgroundColor: color }}
          >
            {name}
          </span>
          <span className="text-[#A0A0B0] text-base">Últimos estrenos</span>
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => scroll('left')}
            className="w-8 h-8 bg-[#1C1C27] hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors"
            aria-label={`${name}: ir a la izquierda`}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-8 h-8 bg-[#1C1C27] hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors"
            aria-label={`${name}: ir a la derecha`}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 no-scrollbar carousel-scroll"
      >
        {items.filter(item => item.posterPath).map(item => {
          const href = item.mediaType === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`
          return (
            <div key={`${item.mediaType}-${item.id}`} className="flex-shrink-0 w-28 sm:w-32 carousel-snap group">
              <Link href={href} className="block">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-1.5 transition-transform duration-200 group-hover:scale-105">
                  <Image
                    src={getPosterUrl(item.posterPath, 'w185')}
                    alt={item.title}
                    fill
                    className="object-cover"
                    sizes="128px"
                  />

                  {/* Type badge — top left */}
                  <div className="absolute top-1.5 left-1.5">
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{ backgroundColor: item.mediaType === 'movie' ? '#2563eb' : '#7c3aed', color: '#fff' }}
                    >
                      {item.mediaType === 'movie' ? 'Peli' : 'Serie'}
                    </span>
                  </div>

                  {/* Rating badge — top right */}
                  {item.voteAverage && item.voteAverage > 0 && (
                    <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-black/70 rounded px-1.5 py-0.5">
                      <span className="text-[10px] font-bold" style={{ color: '#FFFD02' }}>
                        ★ {item.voteAverage.toFixed(1)}
                      </span>
                    </div>
                  )}

                  {/* Hover overlay with quick actions */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-end pb-3 gap-1.5">
                    <span className="w-4/5 flex items-center justify-center gap-1 bg-white/20 hover:bg-white/30 text-white text-[10px] font-medium py-1 rounded-full transition-colors">
                      + Para ver
                    </span>
                    <span className="w-4/5 flex items-center justify-center gap-1 bg-white/20 hover:bg-white/30 text-white text-[10px] font-medium py-1 rounded-full transition-colors">
                      ♥ Me gusta
                    </span>
                  </div>
                </div>
              </Link>

              <Link href={href}>
                <p className="text-xs font-semibold text-white line-clamp-1 group-hover:text-zinc-300 transition-colors">
                  {item.title}
                </p>
                {item.year && <p className="text-[11px] text-[#A0A0B0] mt-0.5">{item.year}</p>}
              </Link>
            </div>
          )
        })}
      </div>
    </section>
  )
}
