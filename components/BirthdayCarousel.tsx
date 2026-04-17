'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface BirthdayPerson {
  id:          number
  name:        string
  profilePath: string | null
  age:         number
  popularity:  number
  deceased:    boolean
}

const SCROLL_AMOUNT = 400

export default function BirthdayCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [people,  setPeople]  = useState<BirthdayPerson[] | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    const today = new Date()
    const month = today.getMonth() + 1
    const day   = today.getDate()
    fetch(`/api/birthdays-today?month=${month}&day=${day}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { birthdays: BirthdayPerson[] }) => {
        console.log('[BirthdayCarousel] response:', data)
        setPeople(data.birthdays ?? [])
      })
      .catch(err => {
        console.error('[BirthdayCarousel] fetch error:', err)
        setError(String(err))
      })
  }, [])

  const scroll = (dir: 'left' | 'right') =>
    scrollRef.current?.scrollBy({
      left: dir === 'right' ? SCROLL_AMOUNT : -SCROLL_AMOUNT,
      behavior: 'smooth',
    })

  // ── Loading ──────────────────────────────────────────────────────────────
  if (people === null && !error) {
    return (
      <section className="mb-10">
        <div className="h-6 w-48 bg-zinc-800 rounded mb-4 animate-pulse" />
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="shrink-0 w-28">
              <div className="aspect-[2/3] bg-zinc-800 rounded-lg mb-2 animate-pulse" />
              <div className="h-3 bg-zinc-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  // ── Error (visible in dev/prod for debugging) ─────────────────────────────
  if (error) {
    return (
      <section className="mb-10">
        <h2 className="text-xl font-bold text-white mb-2">🎂 Cumplen años hoy</h2>
        <p className="text-red-400 text-sm">Error cargando cumpleaños: {error}</p>
      </section>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">🎂 Cumplen años hoy</h2>
        {people!.length > 0 && (
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

      {people!.length === 0 ? (
        <p className="text-zinc-500 text-sm">
          No encontramos cumpleaños famosos para hoy.
        </p>
      ) : (
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto no-scrollbar pb-2"
        >
          {people!.map(person => (
            <Link
              key={person.id}
              href={`/actor/${person.id}`}
              className="shrink-0 w-28 group"
            >
              {/* Photo */}
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-2">
                {person.profilePath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://image.tmdb.org/t/p/w185${person.profilePath}`}
                    alt={person.name}
                    onError={e => {
                      // Hide broken image and show initial placeholder
                      e.currentTarget.style.display = 'none'
                      const parent = e.currentTarget.parentElement
                      if (parent) {
                        const el = parent.querySelector('[data-initial]') as HTMLElement | null
                        if (el) el.style.display = 'flex'
                      }
                    }}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                  />
                ) : null}
                {/* Initial placeholder — shown when no photo or photo fails to load */}
                <div
                  data-initial
                  style={{ display: person.profilePath ? 'none' : 'flex' }}
                  className="absolute inset-0 items-center justify-center bg-zinc-700 text-zinc-300 text-3xl font-bold select-none"
                >
                  {person.name.charAt(0).toUpperCase()}
                </div>
                {/* Age badge */}
                <div className="absolute bottom-1.5 right-1.5 bg-black/75 backdrop-blur-sm text-white text-[11px] font-bold px-1.5 py-0.5 rounded-md leading-tight">
                  {person.deceased ? `† ${person.age} años` : `Cumple ${person.age}`}
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
