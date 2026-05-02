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
        {items.filter(item => item.posterPath).map(item => (
          <Link
            key={`${item.mediaType}-${item.id}`}
            href={item.mediaType === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`}
            className="flex-shrink-0 w-28 sm:w-32 group carousel-snap"
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-1.5">
              {item.posterPath ? (
                <Image
                  src={getPosterUrl(item.posterPath)}
                  alt={item.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="128px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center px-2">
                  Sin imagen
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute top-1.5 right-1.5">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    item.mediaType === 'movie' ? 'bg-blue-600' : 'bg-purple-600'
                  }`}
                >
                  {item.mediaType === 'movie' ? 'Peli' : 'Serie'}
                </span>
              </div>
            </div>
            <p className="text-xs text-zinc-300 line-clamp-2 leading-tight group-hover:text-white transition-colors">
              {item.title}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}
