'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { getBackdropUrl, getPosterUrl } from '@/lib/tmdb'

interface HeroMovie {
  id: number
  title: string
  overview: string
  backdrop_path: string | null
  poster_path: string | null
  release_date: string
}

interface HeroCarouselProps {
  movies: HeroMovie[]
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const MAX_DOTS = 8

export default function HeroCarousel({ movies }: HeroCarouselProps) {
  const [idx, setIdx] = useState(0)

  if (!movies.length) return null

  const movie = movies[idx]
  const backdrop = getBackdropUrl(movie.backdrop_path)

  const prev = () => setIdx(i => (i - 1 + movies.length) % movies.length)
  const next = () => setIdx(i => (i + 1) % movies.length)

  const dotsCount = Math.min(movies.length, MAX_DOTS)

  return (
    <div className="relative w-full h-[520px] md:h-[600px] overflow-hidden bg-zinc-900">
      {/* Backdrop */}
      {backdrop ? (
        <Image
          src={backdrop}
          alt={movie.title}
          fill
          className="object-cover opacity-50"
          priority
          sizes="100vw"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950" />
      )}

      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      {/* Content */}
      <div className="absolute inset-0 flex items-end">
        <div className="w-full max-w-7xl mx-auto px-6 md:px-12 pb-14 flex gap-6 items-end">
          {/* Poster (desktop only) */}
          <div className="hidden md:block flex-shrink-0 w-36 h-52 relative rounded-xl overflow-hidden shadow-2xl border border-white/10">
            {movie.poster_path ? (
              <Image
                src={getPosterUrl(movie.poster_path)}
                alt={movie.title}
                fill
                className="object-cover"
                sizes="144px"
              />
            ) : (
              <div className="w-full h-full bg-zinc-700 flex items-center justify-center text-zinc-500 text-xs text-center px-2">
                Sin imagen
              </div>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-emerald-400 text-xs font-semibold uppercase tracking-widest mb-2">
              Próximamente en cines
            </p>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-3 leading-tight line-clamp-2">
              {movie.title}
            </h2>
            {movie.release_date && (
              <div className="flex items-center gap-2 text-zinc-300 text-sm mb-3">
                <Calendar size={14} />
                <span>{formatDate(movie.release_date)}</span>
              </div>
            )}
            {movie.overview && (
              <p className="text-zinc-300 text-sm md:text-base line-clamp-3 max-w-2xl leading-relaxed">
                {movie.overview}
              </p>
            )}
            <Link
              href={`/movie/${movie.id}`}
              className="inline-block mt-5 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Ver detalles
            </Link>
          </div>
        </div>
      </div>

      {/* Arrow: prev */}
      <button
        onClick={prev}
        className="absolute left-3 md:left-5 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
        aria-label="Película anterior"
      >
        <ChevronLeft size={20} />
      </button>

      {/* Arrow: next */}
      <button
        onClick={next}
        className="absolute right-3 md:right-5 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
        aria-label="Película siguiente"
      >
        <ChevronRight size={20} />
      </button>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {Array.from({ length: dotsCount }).map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            style={{ width: i === idx ? '24px' : '8px' }}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === idx ? 'bg-emerald-400' : 'bg-white/30 hover:bg-white/60'
            }`}
            aria-label={`Ir a película ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
