'use client'

import { useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PlatformWithLogo {
  id: number
  slug: string
  name: string
  color: string
  logoPath: string | null | undefined
}

interface Props {
  platforms: PlatformWithLogo[]
}

const SCROLL_AMOUNT = 300

export default function PlatformLogoStrip({ platforms }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({
      left: dir === 'right' ? SCROLL_AMOUNT : -SCROLL_AMOUNT,
      behavior: 'smooth',
    })
  }

  return (
    <div className="bg-zinc-900/60 border-y border-zinc-800 py-5">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
            Plataformas disponibles en Argentina
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => scroll('left')}
              className="w-7 h-7 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors"
              aria-label="Scroll izquierda"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-7 h-7 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors"
              aria-label="Scroll derecha"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto no-scrollbar pb-1"
        >
          {platforms.map(platform => (
            <Link
              key={platform.id}
              href={`/platform/${platform.slug}`}
              className="flex-shrink-0 group"
              title={platform.name}
            >
              <div className="w-16 h-16 rounded-xl overflow-hidden transition-transform duration-200 group-hover:scale-110 group-hover:ring-2 group-hover:ring-white/30 shadow-lg">
                {platform.logoPath ? (
                  <Image
                    src={`https://image.tmdb.org/t/p/original${platform.logoPath}`}
                    alt={platform.name}
                    width={64}
                    height={64}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white font-bold text-xs text-center px-1 leading-tight"
                    style={{ backgroundColor: platform.color }}
                  >
                    {platform.name}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-zinc-500 text-center mt-1 group-hover:text-zinc-300 transition-colors truncate w-16">
                {platform.name}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
