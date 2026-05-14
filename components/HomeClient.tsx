'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ChevronLeft, ChevronRight, TrendingUp, Star, List, Users, Compass } from 'lucide-react'
import CarouselCard from '@/components/CarouselCard'
import PlatformLogoStrip from '@/components/PlatformLogoStrip'
import StarDisplay from '@/components/StarDisplay'
import { useCountry } from '@/context/CountryContext'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import HeroCarousel, { type HeroSlide } from '@/components/HeroCarousel'

const BirthdayCarousel = dynamic(() => import('@/components/BirthdayCarousel'), {
  ssr: false,
  loading: () => null,
})

const GuidesCarousel = dynamic(() => import('@/components/GuidesCarousel'), {
  ssr: false,
  loading: () => null,
})

const PlatformCarousel = dynamic(() => import('@/components/PlatformCarousel'), {
  ssr: false,
  loading: () => null,
})

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB = 'https://api.themoviedb.org/3'
const PROVIDER_IDS = '8|337|119|384|531|350'

const GENRE_TO_ID: Record<string, number> = {
  'Acción': 28, 'Comedia': 35, 'Drama': 18, 'Terror': 27,
  'Ciencia ficción': 878, 'Thriller': 53, 'Animación': 16,
  'Romance': 10749, 'Documental': 99, 'Aventura': 12,
  'Fantasía': 14, 'Misterio': 9648, 'Historia': 36,
  'Crimen': 80, 'Musical': 10402, 'Western': 37, 'Guerra': 10752, 'Familia': 10751,
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlatformItem {
  id: number; title: string; posterPath: string | null
  mediaType: 'movie' | 'tv'; date: string; voteAverage?: number; year?: string
}
interface PlatformData { id: number; name: string; color: string; items: PlatformItem[] }
interface PlatformLogo { id: number; slug: string; name: string; color: string; logoPath: string | null }
interface HomeData { platformsWithLogos: PlatformLogo[]; platformContent: PlatformData[] }

interface HeroMovie { backdropPath: string | null; title: string }

interface WatchlistPreviewItem {
  id: string; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null; added_at: string
}

interface ForYouItem {
  id: number; title: string; posterPath: string | null
  year: string; voteAverage: number; matchPct: number
}

interface FriendActivityItem {
  reviewId: string; mediaTitle: string; mediaPosterPath: string | null
  mediaType: string; mediaId: number; userId: string
  userName: string; avatarUrl: string | null; createdAt: string
}

interface RecentItem {
  id: number; title: string; posterPath: string | null
  mediaType: 'movie' | 'tv'; year: string; voteAverage?: number
  providerLogoPath: string | null; providerName: string | null
  inCinemas?: boolean
}

interface TrendingItem {
  mediaId: number; mediaType: 'movie' | 'tv'
  title: string; posterPath: string | null
  viewCount: number | null
}

interface FeaturedReview {
  id: string; mediaId: number; mediaType: 'movie' | 'tv'
  mediaTitle: string; mediaPosterPath: string | null
  authorUsername: string; authorDisplayName: string | null; authorAvatarUrl: string | null
  rating: number | null; body: string | null
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function CarouselSkeleton() {
  return (
    <div className="animate-pulse mb-12">
      <div className="h-6 w-40 bg-[#1C1C27] rounded mb-1.5" />
      <div className="h-3 w-32 bg-[#1C1C27] rounded mb-4" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shrink-0 w-28 sm:w-32">
            <div className="aspect-[2/3] bg-[#1C1C27] rounded-lg mb-1.5" />
            <div className="h-3 bg-[#1C1C27] rounded w-4/5 mb-1" />
            <div className="h-2.5 bg-[#1C1C27] rounded w-1/3" />
          </div>
        ))}
      </div>
    </div>
  )
}

function TrendingSkeleton() {
  return (
    <div className="animate-pulse mb-12">
      <div className="h-6 w-52 bg-[#1C1C27] rounded mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-3">
            <div className="w-10 h-8 bg-[#1C1C27] rounded shrink-0" />
            <div className="w-10 h-14 bg-[#1C1C27] rounded shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-[#1C1C27] rounded w-3/4" />
              <div className="h-3 bg-[#1C1C27] rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReviewsSkeleton() {
  return (
    <div className="animate-pulse mb-12">
      <div className="h-6 w-48 bg-[#1C1C27] rounded mb-4" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#1C1C27] shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-[#1C1C27] rounded w-1/2" />
                <div className="h-3 bg-[#1C1C27] rounded w-1/3" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-3 bg-[#1C1C27] rounded" />
              <div className="h-3 bg-[#1C1C27] rounded w-5/6" />
              <div className="h-3 bg-[#1C1C27] rounded w-4/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Hero Section ──────────────────────────────────────────────────────────────

const HERO_STATS = [
  { value: '+300.000', label: 'títulos' },
  { value: '+5.000',   label: 'reseñas' },
  { value: '+12.000',  label: 'usuarios' },
]

function HeroSection({
  user, userName, heroMovie,
}: {
  user: User | null | undefined
  userName: string
  heroMovie: HeroMovie | null
}) {
  const [hiRes, setHiRes] = useState(false)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 1280) setHiRes(true)
  }, [])

  const imgSize = hiRes ? 'original' : 'w780'
  const backdropUrl = heroMovie?.backdropPath
    ? `https://image.tmdb.org/t/p/${imgSize}${heroMovie.backdropPath}`
    : null

  return (
    <section
      className="relative h-[70vh] sm:h-[80vh] flex flex-col items-center justify-end overflow-hidden"
      style={{
        backgroundImage: backdropUrl ? `url(${backdropUrl})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundColor: '#13131A',
      }}
    >
      {/* Gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(10,10,15,0.0) 0%, rgba(10,10,15,0.0) 30%, rgba(10,10,15,0.5) 60%, rgba(10,10,15,0.92) 85%, rgba(10,10,15,1.0) 100%)',
        }}
      />

      {/* Content */}
      <div className="relative z-10 px-4 pb-8 sm:pb-12 max-w-3xl mx-auto w-full text-center">

        {/* Title */}
        <h1
          className="font-bold text-white leading-tight mb-5 sm:mb-6 tracking-tight"
          style={{ fontSize: 'clamp(28px, 5vw, 48px)' }}
        >
          Tu universo de{' '}
          <span style={{ color: '#FFFD02' }}>cine y series</span>
        </h1>

        {/* 3-line subtitle */}
        <div className="mb-7 sm:mb-8 space-y-1 sm:space-y-2">
          {[
            'Encontrá qué ver.',
            'Descubrí dónde está.',
            'Compartí con amigos lo que pensás.',
          ].map(line => (
            <p
              key={line}
              className="leading-relaxed"
              style={{ fontSize: 'clamp(14px, 2.5vw, 18px)', color: 'rgba(255,255,255,0.85)' }}
            >
              {line}
            </p>
          ))}
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-center gap-3 sm:gap-5 mb-8 sm:mb-10 flex-wrap">
          {HERO_STATS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-3 sm:gap-5">
              {i > 0 && (
                <span className="text-white/25 text-sm select-none">|</span>
              )}
              <span className="text-sm sm:text-base">
                <span className="font-bold text-white">{s.value} </span>
                <span style={{ color: 'rgba(255,255,255,0.55)' }}>{s.label}</span>
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        {user === undefined ? (
          <div className="h-12" />
        ) : user ? (
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>
            Bienvenido de vuelta,{' '}
            <Link
              href="/profile"
              className="font-semibold text-white hover:text-[#FFFD02] transition-colors"
            >
              {userName}
            </Link>{' '}
            👋
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/auth?mode=register"
              className="inline-block text-black font-semibold transition-all active:scale-95"
              style={{
                backgroundColor: '#FFFD02',
                borderRadius: '50px',
                padding: '14px 32px',
                fontSize: 'clamp(14px, 2vw, 16px)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#E5EB00' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#FFFD02' }}
            >
              Crear cuenta gratis
            </Link>
            <Link
              href="/auth"
              className="inline-block font-medium transition-all active:scale-95"
              style={{
                color: 'rgba(255,255,255,0.8)',
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: '50px',
                padding: '12px 24px',
                fontSize: 'clamp(13px, 1.8vw, 15px)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.7)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.35)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.8)' }}
            >
              Ya tengo cuenta
            </Link>
          </div>
        )}
      </div>

      {/* Movie attribution badge */}
      {heroMovie?.title && (
        <p
          className="absolute bottom-3 right-4 z-10 text-[11px]"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          Basado en {heroMovie.title}
        </p>
      )}
    </section>
  )
}

// ── Recent Releases Section ───────────────────────────────────────────────────

function RecentReleasesSection({ items }: { items: RecentItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scroll = (dir: 'left' | 'right') =>
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 400 : -400, behavior: 'smooth' })

  if (!items.length) return null

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white">Últimos estrenos</h2>
          <p className="text-xs text-[#A0A0B0] mt-0.5">Recién llegados al streaming</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => scroll('left')}
            className="w-8 h-8 bg-[#1C1C27] hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors"
            aria-label="Anteriores"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => scroll('right')}
            className="w-8 h-8 bg-[#1C1C27] hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors"
            aria-label="Siguientes"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 no-scrollbar carousel-scroll">
        {items.filter(item => item.posterPath).map(item => (
          <CarouselCard
            key={`${item.mediaType}-${item.id}`}
            id={item.id}
            mediaType={item.mediaType}
            posterPath={item.posterPath}
            title={item.title}
            year={item.year}
            voteAverage={item.voteAverage}
            providerLogoPath={item.providerLogoPath}
            providerName={item.providerName}
            inCinemas={item.inCinemas}
          />
        ))}
      </div>
    </section>
  )
}

// ── Trending Section ──────────────────────────────────────────────────────────

function TrendingSection({ items }: { items: TrendingItem[] }) {
  if (!items.length) return null

  return (
    <section className="mb-12">
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
          <TrendingUp size={18} style={{ color: '#FFFD02' }} />
          Tendencias en Glynbox
        </h2>
        <p className="text-xs text-[#A0A0B0] mt-0.5">Lo que más se está viendo esta semana</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item, idx) => (
          <Link
            key={`${item.mediaType}-${item.mediaId}`}
            href={`/${item.mediaType}/${item.mediaId}`}
            className="flex items-center gap-3 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-3 hover:border-[#FFFD02]/50 transition-colors group"
          >
            {/* Rank */}
            <span
              className="text-2xl font-black w-9 text-center shrink-0 tabular-nums leading-none"
              style={{ color: idx < 3 ? '#FFFD02' : 'rgba(255,253,2,0.35)' }}
            >
              {idx + 1}
            </span>

            {/* Poster */}
            <div className="relative w-10 aspect-[2/3] rounded-md overflow-hidden bg-[#1C1C27] shrink-0">
              {item.posterPath ? (
                <Image
                  src={`https://image.tmdb.org/t/p/w92${item.posterPath}`}
                  alt={item.title}
                  fill
                  className="object-cover"
                  sizes="40px"
                />
              ) : (
                <div className="w-full h-full bg-[#1C1C27]" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white line-clamp-1 group-hover:text-[#FFFD02] transition-colors">
                {item.title}
              </p>
              <p className="text-xs text-[#A0A0B0] mt-0.5">
                {item.viewCount !== null
                  ? `${item.viewCount} ${item.viewCount === 1 ? 'usuario lo vio' : 'usuarios lo vieron'} esta semana`
                  : 'Popular en streaming'}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ── Featured Reviews Section ──────────────────────────────────────────────────

function FeaturedReviewsSection({ reviews, user }: { reviews: FeaturedReview[]; user: User | null | undefined }) {
  if (!reviews.length) return null

  const isGuest = user === null

  return (
    <section className="mb-12">
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
          <Star size={17} style={{ color: '#F5A623' }} />
          Reseñas destacadas
        </h2>
        <p className="text-xs text-[#A0A0B0] mt-0.5">Las más recientes de la comunidad</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reviews.map(review => {
          const name = review.authorDisplayName ?? review.authorUsername
          const initials = name[0]?.toUpperCase() ?? '?'
          const isVerified = review.authorUsername === 'Ferlageok' || review.authorUsername === 'ferlageok'
          return (
            <div
              key={review.id}
              className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 hover:border-[#FFFD02]/40 transition-colors flex flex-col"
            >
              {/* Author row */}
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-[#1C1C27] shrink-0">
                  {review.authorAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={review.authorAvatarUrl} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[#A0A0B0]">
                      {initials}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate flex items-center gap-1">
                    {name}
                    {isVerified && (
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#1D9BF0"/><path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                  </p>
                  <p className="text-[11px] text-[#A0A0B0]">@{review.authorUsername}</p>
                </div>
                {review.mediaPosterPath && (
                  <div className="relative w-9 aspect-[2/3] rounded-md overflow-hidden bg-[#1C1C27] shrink-0">
                    <Image
                      src={`https://image.tmdb.org/t/p/w92${review.mediaPosterPath}`}
                      alt={review.mediaTitle}
                      fill
                      className="object-cover"
                      sizes="36px"
                    />
                  </div>
                )}
              </div>

              {/* Media title */}
              <p className="text-xs font-semibold mb-1.5 line-clamp-1" style={{ color: '#FFFD02' }}>
                {review.mediaTitle}
              </p>

              {/* Stars */}
              {review.rating != null && (
                <div className="mb-2">
                  <StarDisplay rating={review.rating} size={11} />
                </div>
              )}

              {/* Body */}
              {review.body && (
                <p className="text-sm text-zinc-300 leading-relaxed flex-1">
                  {review.body.slice(0, 150)}{review.body.length > 150 ? '…' : ''}
                </p>
              )}

              {/* Leer más */}
              <div className="mt-3 pt-3 border-t border-[#2A2A3A]">
                <Link
                  href={`/review/${review.id}`}
                  className="text-xs font-medium transition-colors"
                  style={{ color: '#FFFD02' }}
                >
                  Leer más →
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {/* CTA banner for guests */}
      {isGuest && (
        <Link
          href="/auth?mode=register"
          className="mt-5 flex items-center justify-between gap-3 bg-[#1C1C27] border border-[#2A2A3A] hover:border-[#FFFD02]/50 rounded-xl px-5 py-4 transition-colors group"
        >
          <p className="text-sm text-zinc-300 group-hover:text-white transition-colors">
            ¿Querés compartir tu opinión?{' '}
            <span className="font-semibold" style={{ color: '#FFFD02' }}>Creá tu cuenta gratis</span>
          </p>
          <span className="text-[#FFFD02] text-lg shrink-0">→</span>
        </Link>
      )}
    </section>
  )
}

// ── Official Lists Section ────────────────────────────────────────────────────

interface OfficialList {
  id: string; title: string; description: string | null
  previews: (string | null)[]; itemCount: number
}

function OfficialListsSection({ lists, loading }: { lists: OfficialList[]; loading: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scroll = (dir: 'left' | 'right') =>
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 400 : -400, behavior: 'smooth' })

  if (!loading && !lists.length) return null

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
            <List size={17} style={{ color: '#FFFD02' }} />
            Listas de Glynbox
          </h2>
          <p className="text-xs text-[#A0A0B0] mt-0.5">Colecciones curadas por el equipo</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/listas" className="text-xs text-[#FFFD02] hover:underline mr-1 shrink-0">Ver todas →</Link>
          <button onClick={() => scroll('left')}
            className="w-8 h-8 bg-[#1C1C27] hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => scroll('right')}
            className="w-8 h-8 bg-[#1C1C27] hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-hidden animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shrink-0 w-52 bg-[#13131A] border border-[#2A2A3A] rounded-xl h-52" />
          ))}
        </div>
      ) : (
        <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 no-scrollbar carousel-scroll">
          {lists.map(l => (
            <Link
              key={l.id}
              href={`/listas/${l.id}`}
              className="shrink-0 w-52 group bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 hover:border-[#FFFD02]/50 transition-all block carousel-snap"
            >
              {/* 2×2 poster grid — Letterboxd style */}
              <div className="grid grid-cols-2 gap-0.5 mb-3 rounded-lg overflow-hidden" style={{ height: 96 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="relative overflow-hidden bg-[#1C1C27]">
                    {l.previews[i] ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w185${l.previews[i]}`}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Title */}
              <p className="font-semibold text-white group-hover:text-[#FFFD02] transition-colors line-clamp-2 text-sm leading-snug mb-1">
                {l.title}
              </p>

              {/* Count */}
              <p className="text-xs text-[#A0A0B0] mb-3">
                {l.itemCount} {l.itemCount === 1 ? 'título' : 'títulos'}
              </p>

              {/* Author — always shown as Glynbox */}
              <div className="flex items-center gap-2 pt-2.5 border-t border-[#2A2A3A]">
                <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-[#1C1C27]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/favicon.jpg" alt="Glynbox" className="w-full h-full object-cover" />
                </div>
                <span className="text-xs text-white font-medium">Glynbox</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto shrink-0"
                  style={{ backgroundColor: '#FFFD02', color: '#000' }}>
                  Oficial
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ── "Continuá viendo" section ────────────────────────────────────────────────

function ContinueWatchingSection({
  items, onMarkWatched, loading,
}: {
  items: WatchlistPreviewItem[]
  onMarkWatched: (item: WatchlistPreviewItem) => void
  loading: Set<number>
}) {
  if (items.length === 0) return null
  return (
    <section className="mb-12">
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-white">Continuá donde dejaste</h2>
        <p className="text-xs text-[#A0A0B0] mt-0.5">Títulos en tu lista de pendientes</p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar carousel-scroll">
        {items.map(item => (
          <div key={item.id} className="flex-shrink-0 w-36 carousel-snap group">
            <Link href={`/${item.media_type}/${item.media_id}`} className="block mb-1.5">
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] transition-transform duration-200 group-hover:scale-105 will-change-transform">
                {item.poster_path ? (
                  <Image src={`https://image.tmdb.org/t/p/w185${item.poster_path}`} alt={item.title} fill className="object-cover" sizes="144px" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#A0A0B0] text-xs text-center px-2">{item.title}</div>
                )}
                <div className="absolute top-1.5 left-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ backgroundColor: item.media_type === 'movie' ? '#2563eb' : '#7c3aed', color: '#fff' }}>
                    {item.media_type === 'movie' ? 'Peli' : 'Serie'}
                  </span>
                </div>
              </div>
            </Link>
            <p className="text-xs font-semibold text-white line-clamp-1 mb-1.5">{item.title}</p>
            <button
              onClick={() => onMarkWatched(item)}
              disabled={loading.has(item.media_id)}
              className="w-full flex items-center justify-center gap-1 text-[11px] font-semibold py-1.5 rounded-full transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' }}
            >
              {loading.has(item.media_id) ? '...' : '✓ Ya la vi'}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── "Para vos" personalized section ──────────────────────────────────────────

function ForYouSection({ items, loading }: { items: ForYouItem[]; loading: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scroll = (dir: 'left' | 'right') =>
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 400 : -400, behavior: 'smooth' })

  if (!loading && items.length === 0) return null

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
            ✨ Para vos
          </h2>
          <p className="text-xs text-[#A0A0B0] mt-0.5">Basado en tus géneros favoritos</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => scroll('left')} className="w-8 h-8 bg-[#1C1C27] hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors" aria-label="Anteriores">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => scroll('right')} className="w-8 h-8 bg-[#1C1C27] hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors" aria-label="Siguientes">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 w-36">
              <div className="aspect-[2/3] bg-[#1C1C27] rounded-lg mb-1.5 animate-pulse" />
              <div className="h-3 bg-[#1C1C27] rounded w-4/5 mb-1 animate-pulse" />
              <div className="h-2.5 bg-[#1C1C27] rounded w-1/2 animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2 no-scrollbar carousel-scroll">
          {items.map(item => (
            <Link key={item.id} href={`/movie/${item.id}`} className="flex-shrink-0 w-36 carousel-snap group block">
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-1.5 transition-transform duration-200 group-hover:scale-105 will-change-transform">
                {item.posterPath ? (
                  <Image src={`https://image.tmdb.org/t/p/w185${item.posterPath}`} alt={item.title} fill className="object-cover" sizes="144px" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#A0A0B0] text-xs text-center px-2">{item.title}</div>
                )}
                {/* Match badge */}
                <div className="absolute top-1.5 right-1.5 bg-black/75 rounded px-1.5 py-0.5">
                  <span className="text-[10px] font-bold" style={{ color: '#FFFD02' }}>{item.matchPct}%</span>
                </div>
                {/* Rating */}
                {item.voteAverage > 0 && (
                  <div className="absolute bottom-1.5 left-1.5 bg-black/70 rounded px-1.5 py-0.5 flex items-center gap-0.5">
                    <span className="text-[10px] font-bold" style={{ color: '#FFFD02' }}>★ {item.voteAverage.toFixed(1)}</span>
                  </div>
                )}
              </div>
              <p className="text-xs font-semibold text-white line-clamp-1 group-hover:text-zinc-300 transition-colors">{item.title}</p>
              {item.year && <p className="text-[11px] text-[#A0A0B0] mt-0.5">{item.year}</p>}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Time-relative helper ──────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// ── Welcome banner (logged-in users only) ────────────────────────────────────

function WelcomeBanner({ userName }: { userName: string }) {
  const h = new Date().getHours()
  const subtitle =
    h >= 6 && h < 12 ? '¿Qué vas a ver esta mañana?' :
    h >= 12 && h < 18 ? '¿Qué vas a ver esta tarde?' :
    h >= 18 ? '¿Qué vas a ver esta noche?' :
    '¿Noche de cine?'
  return (
    <div className="bg-[#13131A] border-b border-[#2A2A3A]/60">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-10">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
          Bienvenido de vuelta, {userName} 👋
        </h1>
        <p className="text-[#A0A0B0] text-base">{subtitle}</p>
      </div>
    </div>
  )
}

// ── Friend activity preview section ──────────────────────────────────────────

function FriendActivitySection({ activity, hasFollowing }: { activity: FriendActivityItem[]; hasFollowing: boolean }) {
  if (!hasFollowing) {
    return (
      <section className="mb-12">
        <h2 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Users size={17} /> Actividad de amigos
        </h2>
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl px-5 py-4 flex items-center justify-between gap-3">
          <p className="text-sm text-[#A0A0B0]">Seguí a otros usuarios para ver su actividad acá.</p>
          <Link href="/comunidad" className="text-sm font-semibold shrink-0 transition-colors hover:opacity-80" style={{ color: '#FFFD02' }}>
            Descubrir →
          </Link>
        </div>
      </section>
    )
  }
  if (activity.length === 0) return null
  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
          <Users size={17} /> Actividad de amigos
        </h2>
        <Link href="/comunidad" className="text-xs hover:underline transition-colors" style={{ color: '#FFFD02' }}>
          Ver todo en Comunidad →
        </Link>
      </div>
      <div className="space-y-3">
        {activity.map(item => (
          <Link
            key={item.reviewId}
            href={`/review/${item.reviewId}`}
            className="flex items-center gap-3 bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/20 rounded-xl p-3 transition-colors"
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 shrink-0">
              {item.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.avatarUrl} alt={item.userName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs font-bold bg-[#2A2A3A] text-[#FFFD02]">
                  {item.userName[0]?.toUpperCase()}
                </div>
              )}
            </div>
            {/* Poster */}
            {item.mediaPosterPath && (
              <div className="w-8 h-12 rounded-md overflow-hidden shrink-0">
                <Image
                  src={`https://image.tmdb.org/t/p/w92${item.mediaPosterPath}`}
                  alt={item.mediaTitle} width={32} height={48}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-zinc-300 line-clamp-1">
                <span className="font-semibold text-white">{item.userName}</span>
                {' reseñó '}
                <span className="font-semibold" style={{ color: '#FFFD02' }}>{item.mediaTitle}</span>
              </p>
              <p className="text-[11px] text-[#A0A0B0] mt-0.5">{timeAgo(item.createdAt)}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HomeClient() {
  const { country } = useCountry()
  const supabase = useRef(createClient()).current
  const router = useRouter()

  // Platform data
  const [platformData, setPlatformData]   = useState<HomeData | null>(null)
  const [platformLoading, setPlatformLoading] = useState(true)
  const prevCountry = useRef<string | null>(null)

  // Auth + hero
  const [user,         setUser]         = useState<User | null | undefined>(undefined)
  const [userName,     setUserName]     = useState('')
  const [heroMovie,    setHeroMovie]    = useState<HeroMovie | null>(null)
  const [heroSlides,   setHeroSlides]   = useState<HeroSlide[]>([])
  const [userActivity, setUserActivity] = useState<'loading' | 'new' | 'active'>('loading')
  const [showWelcome, setShowWelcome] = useState(false)

  // Check welcome flag (set after onboarding completion)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('glynbox_welcome')) {
      localStorage.removeItem('glynbox_welcome')
      setShowWelcome(true)
      const t = setTimeout(() => setShowWelcome(false), 5000)
      return () => clearTimeout(t)
    }
  }, [])

  // Personalized sections
  const [continueWatching, setContinueWatching] = useState<WatchlistPreviewItem[]>([])
  const [markingWatched,   setMarkingWatched]   = useState<Set<number>>(new Set())
  const [favoriteGenres,   setFavoriteGenres]   = useState<string[]>([])
  const [forYouItems,      setForYouItems]      = useState<ForYouItem[]>([])
  const [forYouLoading,    setForYouLoading]    = useState(false)
  const [followingIds,     setFollowingIds]     = useState<string[]>([])
  const [friendActivity,   setFriendActivity]   = useState<FriendActivityItem[]>([])

  // Defer secondary fetches 500ms so critical content renders first
  const [secondaryReady, setSecondaryReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSecondaryReady(true), 500)
    return () => clearTimeout(t)
  }, [])

  // New sections
  const [recentItems,    setRecentItems]    = useState<RecentItem[]>([])
  const [recentLoading,  setRecentLoading]  = useState(true)
  const [trendingItems,  setTrendingItems]  = useState<TrendingItem[]>([])
  const [trendingLoading, setTrendingLoading] = useState(true)
  const [featuredReviews, setFeaturedReviews] = useState<FeaturedReview[]>([])
  const [reviewsLoading,  setReviewsLoading]  = useState(true)
  const [officialLists,        setOfficialLists]        = useState<OfficialList[]>([])
  const [officialListsLoading, setOfficialListsLoading] = useState(true)

  // ── Auth + hero movie ─────────────────────────────────────────────────────
  useEffect(() => {
    async function boot() {
      const [authRes, heroRes] = await Promise.all([
        supabase.auth.getUser(),
        TMDB_KEY
          ? fetch(`${TMDB}/trending/all/week?api_key=${TMDB_KEY}&language=es-AR`)
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
          : Promise.resolve(null),
      ])

      const u = authRes.data.user ?? null

      if (u) {
        // Cookie set by callback for new Google/OAuth users — catches timing issues
        const isNewUser = document.cookie.split(';').some(c => c.trim() === 'new_user=true')
        if (isNewUser) {
          document.cookie = 'new_user=; max-age=0; path=/'
          router.replace('/onboarding')
          return
        }

        // Regular check — catches existing users who haven't finished onboarding
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', u.id)
          .maybeSingle()
        if (profile && profile.onboarding_completed === false) {
          router.replace('/onboarding')
          return
        }
      }

      setUser(u)

      // Build hero carousel slides from trending/all/week
      type TrendingAll = { id: number; media_type: 'movie' | 'tv'; backdrop_path: string | null; title?: string; name?: string; overview?: string; vote_average: number; vote_count: number; genre_ids: number[]; release_date?: string; first_air_date?: string; poster_path: string | null }
      const allTrending: TrendingAll[] = heroRes?.results ?? []
      const slides: HeroSlide[] = allTrending
        .filter(m =>
          m.backdrop_path && m.overview && m.vote_average >= 7.0 && m.vote_count >= 100 &&
          !m.genre_ids.includes(16) && !m.genre_ids.includes(99)
        )
        .slice(0, 5)
        .map(m => ({
          id: m.id, mediaType: m.media_type,
          title:       m.title ?? m.name ?? '',
          overview:    m.overview ?? '',
          backdropPath: m.backdrop_path!,
          posterPath:  m.poster_path ?? null,
          voteAverage: m.vote_average,
          releaseDate: m.release_date ?? m.first_air_date ?? '',
          genreIds:    m.genre_ids,
        }))
      setHeroSlides(slides)

      if (u) {
        const [profileRes, watchlistRes, followsRes, { count: watchedCt }] = await Promise.all([
          supabase.from('profiles').select('username, display_name, favorite_genres').eq('id', u.id).maybeSingle(),
          supabase.from('watchlist').select('id, media_id, media_type, title, poster_path, added_at').eq('user_id', u.id).order('added_at', { ascending: false }).limit(5),
          supabase.from('follows').select('following_id').eq('follower_id', u.id),
          supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', u.id),
        ])
        const profile = profileRes.data
        setUserName(profile?.display_name ?? profile?.username ?? u.email?.split('@')[0] ?? '')
        setFavoriteGenres(profile?.favorite_genres ?? [])
        const watchlistItems = (watchlistRes.data ?? []) as WatchlistPreviewItem[]
        setContinueWatching(watchlistItems)
        const isActive = (watchedCt ?? 0) > 0 || watchlistItems.length > 0
        setUserActivity(isActive ? 'active' : 'new')

        const fIds = (followsRes.data ?? []).map((f: { following_id: string }) => f.following_id)
        setFollowingIds(fIds)

        if (fIds.length > 0) {
          const { data: reviewsData } = await supabase
            .from('reviews')
            .select('id, user_id, media_id, media_type, title, poster_path, created_at')
            .in('user_id', fIds)
            .not('poster_path', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10)
          if (reviewsData?.length) {
            const userIds = [...new Set(reviewsData.map(r => r.user_id))]
            const { data: pRows } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', userIds)
            const pMap = Object.fromEntries((pRows ?? []).map((p: { id: string }) => [p.id, p])) as unknown as Record<string, { username: string | null; display_name: string | null; avatar_url: string | null } | undefined>
            setFriendActivity(reviewsData.slice(0, 3).map(r => {
              const p = pMap[r.user_id]
              return { reviewId: r.id, mediaTitle: r.title, mediaPosterPath: r.poster_path, mediaType: r.media_type, mediaId: r.media_id, userId: r.user_id, userName: p?.display_name ?? p?.username ?? 'Usuario', avatarUrl: p?.avatar_url ?? null, createdAt: r.created_at }
            }))
          }
        }
      }
    }
    boot()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark watchlist item as watched ───────────────────────────────────────
  async function markAsWatched(item: WatchlistPreviewItem) {
    if (!user?.id) return
    setMarkingWatched(prev => new Set(prev).add(item.media_id))
    await Promise.all([
      supabase.from('watched').upsert(
        { user_id: user.id, media_id: item.media_id, media_type: item.media_type, title: item.title, poster_path: item.poster_path, watched_at: new Date().toISOString() },
        { onConflict: 'user_id,media_id,media_type' }
      ),
      supabase.from('watchlist').delete().eq('id', item.id),
    ])
    setContinueWatching(prev => prev.filter(w => w.id !== item.id))
    setMarkingWatched(prev => { const next = new Set(prev); next.delete(item.media_id); return next })
  }

  // ── "Para vos" personalized recommendations ───────────────────────────────
  useEffect(() => {
    if (!secondaryReady || !user?.id || favoriteGenres.length === 0 || !TMDB_KEY) return
    setForYouLoading(true)
    const genreIds = favoriteGenres.map(g => GENRE_TO_ID[g]).filter(Boolean).slice(0, 3)
    Promise.all([
      fetch(`${TMDB}/discover/movie?api_key=${TMDB_KEY}&language=es-AR&sort_by=vote_average.desc&vote_count.gte=300&with_genres=${genreIds.join(',')}&page=1`).then(r => r.ok ? r.json() : { results: [] }),
      supabase.from('watched').select('media_id, media_type').eq('user_id', user.id).range(0, 9999),
      supabase.from('watchlist').select('media_id, media_type').eq('user_id', user.id).range(0, 9999),
      supabase.from('favorites').select('media_id, media_type').eq('user_id', user.id).range(0, 9999),
    ]).then(([data, watchedRes, watchlistRes, favoritesRes]) => {
      // Composite key "media_type:media_id" avoids false exclusions from cross-type ID collisions
      type Row = { media_id: number; media_type: string }
      const toKey = (r: Row) => `${r.media_type}:${r.media_id}`
      const excludedSet = new Set<string>([
        ...(watchedRes.data   ?? []).map(toKey),
        ...(watchlistRes.data ?? []).map(toKey),
        ...(favoritesRes.data ?? []).map(toKey),
      ])
      type M = { id: number; title: string; poster_path: string | null; release_date?: string; vote_average: number; genre_ids: number[] }
      const items: ForYouItem[] = ((data.results ?? []) as M[])
        .filter(m => m.poster_path && !excludedSet.has(`movie:${m.id}`))
        .slice(0, 10)
        .map(m => {
          const movieGenres = new Set(m.genre_ids)
          const matches = genreIds.filter(gid => movieGenres.has(gid)).length
          const matchPct = Math.round(65 + (matches / Math.max(genreIds.length, 1)) * 30)
          return { id: m.id, title: m.title, posterPath: m.poster_path, year: (m.release_date ?? '').slice(0, 4), voteAverage: m.vote_average, matchPct }
        })
      setForYouItems(items)
      setForYouLoading(false)
    }).catch(() => setForYouLoading(false))
  }, [secondaryReady, user?.id, favoriteGenres]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Platform data (country-dependent) ────────────────────────────────────
  useEffect(() => {
    if (prevCountry.current === country) return
    prevCountry.current = country
    setPlatformLoading(true)
    fetch(`/api/home?country=${country}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: HomeData) => { setPlatformData(d); setPlatformLoading(false) })
      .catch(() => setPlatformLoading(false))
  }, [country])

  // ── Recent releases (TMDB, country-dependent) ─────────────────────────────
  useEffect(() => {
    if (!secondaryReady) return
    if (!TMDB_KEY || !country) { setRecentLoading(false); return }
    setRecentLoading(true)

    async function loadRecent() {
      const base = `api_key=${TMDB_KEY}&language=es-AR&page=1&watch_region=${country}&with_watch_providers=${PROVIDER_IDS}`
      const [movRes, tvRes, nowPlayingRes] = await Promise.all([
        fetch(`${TMDB}/discover/movie?${base}&sort_by=release_date.desc`).then(r => r.ok ? r.json() : { results: [] }),
        fetch(`${TMDB}/discover/tv?${base}&sort_by=first_air_date.desc`).then(r => r.ok ? r.json() : { results: [] }),
        fetch(`${TMDB}/movie/now_playing?api_key=${TMDB_KEY}&language=es-AR&region=${country}&page=1`).then(r => r.ok ? r.json() : { results: [] }),
      ])

      type RawMovie = { id: number; title?: string; name?: string; poster_path: string | null; release_date?: string; first_air_date?: string; vote_average?: number }

      // Streaming movies from discover
      const streamingMovies: RecentItem[] = ((movRes.results ?? []) as RawMovie[]).filter(m => m.poster_path).slice(0, 8).map(m => ({
        id: m.id, title: m.title ?? '', posterPath: m.poster_path,
        mediaType: 'movie', year: (m.release_date ?? '').slice(0, 4),
        voteAverage: m.vote_average, providerLogoPath: null, providerName: null,
      }))

      // Cinema movies from now_playing — marked with inCinemas: true
      const cinemaMovies: RecentItem[] = ((nowPlayingRes.results ?? []) as RawMovie[]).filter(m => m.poster_path).slice(0, 8).map(m => ({
        id: m.id, title: m.title ?? '', posterPath: m.poster_path,
        mediaType: 'movie', year: (m.release_date ?? '').slice(0, 4),
        voteAverage: m.vote_average, providerLogoPath: null, providerName: null,
        inCinemas: true,
      }))

      // Merge movies — dedup by id; streaming takes priority but preserves inCinemas flag
      const movieMap = new Map<number, RecentItem>()
      for (const m of [...cinemaMovies, ...streamingMovies]) {
        const existing = movieMap.get(m.id)
        movieMap.set(m.id, existing ? { ...m, inCinemas: existing.inCinemas || m.inCinemas } : m)
      }
      const movies = [...movieMap.values()].sort((a, b) => (b.year ?? '').localeCompare(a.year ?? ''))

      const tv: RecentItem[] = ((tvRes.results ?? []) as RawMovie[]).filter(m => m.poster_path).slice(0, 8).map(m => ({
        id: m.id, title: m.name ?? '', posterPath: m.poster_path,
        mediaType: 'tv', year: (m.first_air_date ?? '').slice(0, 4),
        voteAverage: m.vote_average, providerLogoPath: null, providerName: null,
      }))

      // Interleave movies and TV, take top 12
      const merged: RecentItem[] = []
      const maxLen = Math.max(movies.length, tv.length)
      for (let i = 0; i < maxLen && merged.length < 12; i++) {
        if (movies[i]) merged.push(movies[i])
        if (merged.length < 12 && tv[i]) merged.push(tv[i])
      }
      const top10 = merged.slice(0, 12)

      setRecentItems(top10)
      setRecentLoading(false)
    }

    loadRecent().catch(() => setRecentLoading(false))
  }, [country, secondaryReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Trending (Supabase watched, last 7 days) ──────────────────────────────
  useEffect(() => {
    if (!secondaryReady) return
    async function loadTrending() {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const { data } = await supabase
        .from('watched')
        .select('media_id, media_type, title, poster_path')
        .gte('watched_at', weekAgo)
        .limit(500)

      if (!data?.length) {
        await useTmdbPopular()
        return
      }

      // Group by media_id + media_type
      const countMap = new Map<string, TrendingItem>()
      for (const row of data) {
        const key = `${row.media_type}:${row.media_id}`
        if (!countMap.has(key)) {
          countMap.set(key, {
            mediaId: row.media_id, mediaType: row.media_type as 'movie' | 'tv',
            title: row.title, posterPath: row.poster_path, viewCount: 0,
          })
        }
        countMap.get(key)!.viewCount = (countMap.get(key)!.viewCount as number) + 1
      }

      const sorted = [...countMap.values()]
        .sort((a, b) => (b.viewCount as number) - (a.viewCount as number))
        .slice(0, 10)

      if (sorted.length < 5) {
        await useTmdbPopular()
        return
      }

      setTrendingItems(sorted)
      setTrendingLoading(false)
    }

    async function useTmdbPopular() {
      if (!TMDB_KEY) { setTrendingLoading(false); return }
      try {
        const res = await fetch(`${TMDB}/movie/popular?api_key=${TMDB_KEY}&language=es-AR&page=1`)
        const d = await res.json()
        type Pop = { id: number; title: string; poster_path: string | null }
        const items: TrendingItem[] = ((d.results ?? []) as Pop[]).filter(m => m.poster_path).slice(0, 10).map(m => ({
          mediaId: m.id, mediaType: 'movie', title: m.title,
          posterPath: m.poster_path, viewCount: null,
        }))
        setTrendingItems(items)
      } catch { /* ignore */ }
      setTrendingLoading(false)
    }

    loadTrending()
  }, [secondaryReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Featured reviews ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!secondaryReady) return
    async function loadReviews() {
      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('id, user_id, media_id, media_type, title, poster_path, rating, body, created_at')
        .not('body', 'is', null)
        .order('created_at', { ascending: false })
        .limit(3)

      if (!reviewsData?.length) { setReviewsLoading(false); return }

      const userIds = [...new Set(reviewsData.map(r => r.user_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', userIds)
      const pMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

      setFeaturedReviews(reviewsData.map(r => ({
        id: r.id,
        mediaId: r.media_id,
        mediaType: r.media_type as 'movie' | 'tv',
        mediaTitle: r.title,
        mediaPosterPath: r.poster_path,
        authorUsername: pMap[r.user_id]?.username ?? 'Usuario',
        authorDisplayName: pMap[r.user_id]?.display_name ?? null,
        authorAvatarUrl: pMap[r.user_id]?.avatar_url ?? null,
        rating: r.rating,
        body: r.body,
      })))
      setReviewsLoading(false)
    }
    loadReviews()
  }, [secondaryReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Official lists (Glynbox curated) ─────────────────────────────────────
  useEffect(() => {
    if (!secondaryReady) return
    async function loadOfficialLists() {
      const { data: glynboxProfile } = await supabase
        .from('profiles').select('id').eq('username', 'Ferlageok').maybeSingle()
      if (!glynboxProfile) { setOfficialListsLoading(false); return }

      const { data: lists } = await supabase
        .from('lists').select('id, title, description')
        .eq('user_id', glynboxProfile.id).eq('is_public', true)
        .order('created_at', { ascending: true }).limit(6)
      if (!lists?.length) { setOfficialListsLoading(false); return }

      const listIds = lists.map(l => l.id)
      const { data: items } = await supabase
        .from('list_items').select('list_id, poster_path')
        .in('list_id', listIds).order('list_id').order('position').limit(1500)

      const previewMap: Record<string, (string | null)[]> = {}
      const countMap: Record<string, number> = {}
      for (const item of items ?? []) {
        previewMap[item.list_id] = previewMap[item.list_id] ?? []
        previewMap[item.list_id].push(item.poster_path)
        countMap[item.list_id] = (countMap[item.list_id] ?? 0) + 1
      }

      setOfficialLists(lists.map(l => ({
        id: l.id, title: l.title, description: l.description,
        previews: (previewMap[l.id] ?? []).slice(0, 4),
        itemCount: countMap[l.id] ?? 0,
      })))
      setOfficialListsLoading(false)
    }
    loadOfficialLists()
  }, [secondaryReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Welcome toast after onboarding */}
      {showWelcome && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-semibold text-black flex items-center gap-2.5 animate-pulse pointer-events-none"
          style={{ backgroundColor: '#FFFD02', whiteSpace: 'nowrap' }}>
          🎬 ¡Bienvenido a Glynbox! Tu experiencia está personalizada
        </div>
      )}

      {/* SECCIÓN 1 — HERO CAROUSEL (todos los usuarios) */}
      <HeroCarousel slides={heroSlides} user={user} userName={userName} />

      {/* SECCIÓN 2 — PLATAFORMAS */}
      {platformData
        ? <PlatformLogoStrip platforms={platformData.platformsWithLogos} />
        : <div className="h-[88px] bg-[#13131A] border-y border-[#2A2A3A]" />
      }

      {/* "Empezá tu Glynbox" — solo para usuarios logueados sin actividad */}
      {user !== null && userActivity === 'new' && (
        <section className="max-w-7xl mx-auto px-4 pt-10 pb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Empezá tu Glynbox</h2>
          <p className="text-sm text-[#A0A0B0] mb-6">Configurá tu experiencia en unos pasos</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              { icon: '📥', label: 'Importá desde Letterboxd', sub: 'Traé tu historial completo', href: '/importar' },
              { icon: '⭐', label: 'Marcá tus primeras 10 películas', sub: 'Empezá tu historial', href: '/que-ver' },
              { icon: '🔍', label: 'Probá el recomendador', sub: 'Descubrí qué ver hoy', href: '/que-ver' },
              { icon: '👥', label: 'Seguí a cinéfilos', sub: 'Encontrá tu comunidad', href: '/comunidad' },
            ] as { icon: string; label: string; sub: string; href: string }[]).map(card => (
              <Link key={card.label} href={card.href}
                className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5 flex flex-col gap-3 hover:border-[#FFFD02]/50 hover:bg-[#1C1C27] transition-all group"
              >
                <span className="text-3xl select-none">{card.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-white group-hover:text-[#FFFD02] transition-colors leading-snug">{card.label}</p>
                  <p className="text-xs text-[#A0A0B0] mt-1">{card.sub}</p>
                </div>
                <span className="text-xs mt-auto" style={{ color: '#FFFD02' }}>Ir →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Guías ARRIBA — para guests y usuarios nuevos sin actividad */}
      {(user === null || userActivity === 'new') && (
        <div className="max-w-7xl mx-auto px-4 pt-6">
          <GuidesCarousel />
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-10">

        {/* Para vos — solo usuarios activos, con empty state */}
        {user && userActivity === 'active' && (
          (forYouLoading || forYouItems.length > 0) ? (
            <ForYouSection items={forYouItems} loading={forYouLoading} />
          ) : (
            <section className="mb-12">
              <h2 className="text-lg sm:text-xl font-bold text-white mb-4 flex items-center gap-2">
                ✨ Para vos
              </h2>
              <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl px-5 py-6 text-center">
                <p className="text-[#A0A0B0] text-sm mb-4">
                  Marcá pelis que viste para empezar a recibir recomendaciones personalizadas
                </p>
                <Link href="/que-ver"
                  className="inline-flex items-center gap-2 text-black font-semibold px-4 py-2 rounded-full text-sm"
                  style={{ backgroundColor: '#FFFD02' }}
                >
                  Probar recomendador →
                </Link>
              </div>
            </section>
          )
        )}

        {/* Continuá viendo — usuarios activos, con empty state */}
        {user && userActivity === 'active' && (
          continueWatching.length > 0 ? (
            <ContinueWatchingSection
              items={continueWatching}
              onMarkWatched={markAsWatched}
              loading={markingWatched}
            />
          ) : (
            <section className="mb-12">
              <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Continuá donde dejaste</h2>
              <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl px-5 py-4 flex items-center justify-between gap-3">
                <p className="text-sm text-[#A0A0B0]">Tu watchlist está vacía. Agregá películas que quieras ver.</p>
                <Link href="/que-ver" className="text-sm font-semibold shrink-0 transition-colors hover:opacity-80" style={{ color: '#FFFD02' }}>
                  Explorar →
                </Link>
              </div>
            </section>
          )
        )}

        {/* SECCIÓN 3 — ÚLTIMOS ESTRENOS */}
        {recentLoading
          ? <CarouselSkeleton />
          : <RecentReleasesSection items={recentItems} />
        }

        {/* SECCIÓN 4 — TENDENCIAS */}
        {trendingLoading
          ? <TrendingSkeleton />
          : <TrendingSection items={trendingItems} />
        }

        {/* Actividad de amigos — solo para logueados (muestra aunque hasFollowing=false) */}
        {user !== undefined && user !== null && (
          <FriendActivitySection
            activity={friendActivity}
            hasFollowing={followingIds.length > 0}
          />
        )}
      </div>

      {/* SECCIÓN 5 — CTA recomendador */}
      <div
        className="w-full relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #111113 0%, #0d0d0f 50%, #111113 100%)' }}
      >
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-48 opacity-10 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, #FFFD02 0%, transparent 65%)' }}
        />
        <div className="relative max-w-2xl mx-auto px-4 py-12 flex flex-col items-center text-center gap-5">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[#FFFD02]">
            <Compass size={30} className="text-black" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">¿No sabés qué ver?</h2>
            <p className="text-[#A0A0B0] text-sm sm:text-base">
              Respondé 3 preguntas y te decimos exactamente qué ver hoy
            </p>
          </div>
          <Link
            href="/que-ver"
            className="inline-flex items-center gap-2 bg-[#FFFD02] hover:bg-[#E5EB00] text-black font-semibold px-6 py-3 rounded-full transition-colors active:scale-95 text-sm"
          >
            <Compass size={16} />
            Probar recomendador →
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10">

        {/* SECCIÓN 6 — RESEÑAS DESTACADAS */}
        {reviewsLoading
          ? <ReviewsSkeleton />
          : <FeaturedReviewsSection reviews={featuredReviews} user={user} />
        }

        {/* SECCIÓN 6b — LISTAS DE GLYNBOX */}
        <OfficialListsSection lists={officialLists} loading={officialListsLoading} />

        {/* SECCIÓN 7 — GUÍAS (solo usuarios activos; guests y nuevos la ven arriba) */}
        {user !== null && userActivity === 'active' && <GuidesCarousel />}

        {/* SECCIÓN 8 — CUMPLEAÑOS */}
        <BirthdayCarousel />

        {/* SECCIÓN 8 — CARRUSELES POR PLATAFORMA */}
        {platformLoading ? (
          <div className="space-y-10 mt-4">
            {Array.from({ length: 3 }).map((_, i) => <CarouselSkeleton key={i} />)}
          </div>
        ) : (
          platformData?.platformContent.map(p => (
            <PlatformCarousel key={p.id} name={p.name} color={p.color} items={p.items} />
          ))
        )}
      </div>

      {/* Banner final — solo para no logueados */}
      {user === null && (
        <div className="border-t border-[#2A2A3A] bg-[#13131A]">
          <div className="max-w-3xl mx-auto px-4 py-14 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              Creá tu cuenta gratis y llevá registro de todo lo que ves
            </h2>
            <p className="text-[#A0A0B0] text-sm sm:text-base mb-7 max-w-lg mx-auto">
              Marcá películas, creá listas, seguí a amigos y recibí recomendaciones personalizadas.
            </p>
            <Link
              href="/auth?mode=register"
              className="inline-flex items-center gap-2 text-black font-semibold px-8 py-3.5 rounded-full transition-all active:scale-95 hover:opacity-90"
              style={{ backgroundColor: '#FFFD02' }}
            >
              Crear cuenta gratis →
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
