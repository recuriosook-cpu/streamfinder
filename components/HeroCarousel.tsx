'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { User } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HeroSlide {
  id: number
  mediaType: 'movie' | 'tv'
  title: string
  overview: string
  backdropPath: string
  posterPath: string | null
  voteAverage: number
  releaseDate: string
  genreIds: number[]
}

interface Props {
  slides: HeroSlide[]
  user: User | null | undefined
  userName: string
}

// ── Genre labels ──────────────────────────────────────────────────────────────

const GENRE: Record<number, string> = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia', 80: 'Crimen',
  18: 'Drama', 10751: 'Familia', 14: 'Fantasía', 27: 'Terror', 9648: 'Misterio',
  10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller', 10752: 'Guerra', 37: 'Western',
  10759: 'Acción', 10765: 'Sci-Fi & Fantasía', 10766: 'Drama',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HeroCarousel({ slides, user, userName }: Props) {
  const [current,       setCurrent]       = useState(0)
  const [fading,        setFading]        = useState(false)
  const [paused,        setPaused]        = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const goTo = useCallback((idx: number) => {
    if (slides.length <= 1 || fading) return
    setFading(true)
    setTimeout(() => { setCurrent(idx); setFading(false) }, 300)
  }, [slides.length, fading])

  const next = useCallback(() => goTo((current + 1) % slides.length), [current, slides.length, goTo])
  const prev = useCallback(() => goTo((current - 1 + slides.length) % slides.length), [current, slides.length, goTo])

  useEffect(() => {
    if (reducedMotion || paused || slides.length <= 1) return
    timerRef.current = setInterval(next, 7000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [next, reducedMotion, paused, slides.length])

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const onTouchEnd   = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) { if (diff > 0) next(); else prev() }
    touchStartX.current = null
  }

  if (!slides.length) {
    return <div className="relative h-[70vh] sm:h-[80vh] w-full bg-[#0A0A0F]" />
  }

  const slide = slides[current]
  const href  = `/${slide.mediaType}/${slide.id}`
  const year  = slide.releaseDate.slice(0, 4)
  const genre = slide.genreIds.map(id => GENRE[id]).find(Boolean) ?? null

  return (
    <section
      className="relative h-[70vh] sm:h-[80vh] w-full overflow-hidden"
      aria-live="polite"
      aria-label={`Slide ${current + 1} de ${slides.length}: ${slide.title}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 transition-opacity duration-[600ms]"
        style={{ opacity: fading ? 0 : 1 }}
      >
        <Image
          src={`https://image.tmdb.org/t/p/w1280${slide.backdropPath}`}
          alt={slide.title}
          fill
          className="object-cover object-top"
          priority
          sizes="100vw"
        />
      </div>

      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(10,10,15,0.15) 0%, rgba(10,10,15,0.05) 25%, rgba(10,10,15,0.55) 60%, rgba(10,10,15,0.92) 85%, #0A0A0F 100%)',
        }}
      />

      {/* Arrow buttons — desktop only */}
      {slides.length > 1 && (
        <>
          <button onClick={prev} aria-label="Anterior"
            className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 border border-white/20 items-center justify-center text-white transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <button onClick={next} aria-label="Siguiente"
            className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 border border-white/20 items-center justify-center text-white transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Content */}
      <div
        className="absolute bottom-0 left-0 right-0 z-10 px-4 pb-12 sm:pb-16 max-w-4xl mx-auto transition-opacity duration-[600ms]"
        style={{ opacity: fading ? 0 : 1 }}
      >
        {user && userName && (
          <p className="text-sm text-white/55 mb-2">Hola, {userName} 👋</p>
        )}

        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-white/55 mb-3">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 uppercase tracking-wide">
            {slide.mediaType === 'movie' ? 'Película' : 'Serie'}
          </span>
          {year && <><span>·</span><span>{year}</span></>}
          {slide.voteAverage > 0 && (
            <><span>·</span><span className="flex items-center gap-0.5"><span style={{ color: '#FFFD02' }}>★</span>{slide.voteAverage.toFixed(1)}</span></>
          )}
          {genre && <><span>·</span><span>{genre}</span></>}
        </div>

        <h1
          className="font-bold text-white leading-tight mb-3 tracking-tight"
          style={{ fontSize: 'clamp(26px, 5vw, 52px)' }}
        >
          {slide.title}
        </h1>

        <p
          className="text-white/70 leading-relaxed mb-7 line-clamp-3"
          style={{ fontSize: 'clamp(13px, 1.8vw, 15px)', maxWidth: '580px' }}
        >
          {slide.overview}
        </p>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {!user ? (
            <>
              <Link href="/auth?mode=register"
                className="inline-flex items-center gap-2 text-black font-semibold px-6 py-3 rounded-full transition-all active:scale-95 text-sm hover:opacity-90"
                style={{ backgroundColor: '#FFFD02' }}
              >
                Crear cuenta gratis
              </Link>
              <Link href={href}
                className="inline-flex items-center gap-2 text-white font-medium px-6 py-3 rounded-full border border-white/30 hover:border-white/60 transition-all text-sm"
              >
                Ver detalles →
              </Link>
            </>
          ) : (
            <>
              <Link href={href}
                className="inline-flex items-center gap-2 text-black font-semibold px-6 py-3 rounded-full transition-all active:scale-95 text-sm hover:opacity-90"
                style={{ backgroundColor: '#FFFD02' }}
              >
                Ver detalles →
              </Link>
              <Link href={href}
                className="inline-flex items-center gap-2 text-white font-medium px-6 py-3 rounded-full border border-white/30 hover:border-white/60 transition-all text-sm"
              >
                + Agregar a watchlist
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Dots */}
      {slides.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Ir al slide ${i + 1}`}
              className="transition-all duration-300 rounded-full"
              style={{
                width:           i === current ? 20 : 6,
                height:          6,
                backgroundColor: i === current ? '#FFFD02' : 'rgba(255,255,255,0.35)',
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}
