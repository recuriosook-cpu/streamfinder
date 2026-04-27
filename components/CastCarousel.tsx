'use client'

import { useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface CastMember {
  id: number
  name: string
  character: string
  profilePath: string | null
}

function PersonAvatar({ name }: { name: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-zinc-700">
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-[#A0A0B0]">
        <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
      </svg>
      <span className="sr-only">{name}</span>
    </div>
  )
}

export default function CastCarousel({ cast }: { cast: CastMember[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' })
  }

  if (cast.length === 0) return null

  return (
    <div className="mt-10">
      <h2 className="text-xl font-bold mb-4">Reparto principal</h2>

      <div className="relative group/carousel">
        {/* Left arrow */}
        <button
          onClick={() => scroll('left')}
          className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-8 h-8 rounded-full bg-[#1C1C27] border border-[#2A2A3A] items-center justify-center text-white hover:bg-zinc-700 transition-all opacity-0 group-hover/carousel:opacity-100"
          aria-label="Anterior"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Scroll container */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto no-scrollbar pb-2"
        >
          {cast.map(person => (
            <Link
              key={person.id}
              href={`/actor/${person.id}`}
              className="shrink-0 w-24 flex flex-col items-center text-center group/actor"
            >
              {/* Photo */}
              <div className="w-20 h-20 rounded-full overflow-hidden bg-[#1C1C27] mb-2 ring-2 ring-zinc-700 group-hover/actor:ring-zinc-400 transition-all">
                {person.profilePath ? (
                  <Image
                    src={`https://image.tmdb.org/t/p/w185${person.profilePath}`}
                    alt={person.name}
                    width={80}
                    height={80}
                    className="w-full h-full object-cover object-top"
                  />
                ) : (
                  <PersonAvatar name={person.name} />
                )}
              </div>
              {/* Name */}
              <p className="text-xs font-semibold text-white leading-tight line-clamp-2 group-hover/actor:text-zinc-300 transition-colors">
                {person.name}
              </p>
              {/* Character */}
              <p className="text-[11px] text-[#A0A0B0] leading-tight mt-0.5 line-clamp-2">
                {person.character}
              </p>
            </Link>
          ))}
        </div>

        {/* Right arrow */}
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
