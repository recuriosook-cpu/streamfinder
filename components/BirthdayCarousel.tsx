'use client'

import { useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface BirthdayPerson {
  id: number
  name: string
  profilePath: string | null
  age: number
}

const SCROLL_AMOUNT = 400

export default function BirthdayCarousel({ people }: { people: BirthdayPerson[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const scroll = (dir: 'left' | 'right') =>
    scrollRef.current?.scrollBy({
      left: dir === 'right' ? SCROLL_AMOUNT : -SCROLL_AMOUNT,
      behavior: 'smooth',
    })

  return (
    <section className="mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">
          🎂 Cumplen años hoy
        </h2>
        {people.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => scroll('left')}
              className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors"
              aria-label="Anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors"
              aria-label="Siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {people.length === 0 ? (
        <p className="text-zinc-500 text-sm">
          No encontramos cumpleaños famosos para hoy.
        </p>
      ) : (
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto no-scrollbar pb-2"
        >
          {people.map(person => (
            <Link
              key={person.id}
              href={`/actor/${person.id}`}
              className="shrink-0 w-28 group"
            >
              {/* Photo */}
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-2">
                {person.profilePath ? (
                  <Image
                    src={`https://image.tmdb.org/t/p/w185${person.profilePath}`}
                    alt={person.name}
                    fill
                    className="object-cover object-top group-hover:scale-105 transition-transform duration-300"
                    sizes="112px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center px-2">
                    Sin foto
                  </div>
                )}
                {/* Age badge */}
                <div className="absolute bottom-1.5 right-1.5 bg-black/75 backdrop-blur-sm text-white text-[11px] font-bold px-1.5 py-0.5 rounded-md leading-tight">
                  {person.age} años
                </div>
              </div>

              {/* Name */}
              <p className="text-xs font-medium text-zinc-300 line-clamp-2 leading-tight group-hover:text-white transition-colors">
                {person.name}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
