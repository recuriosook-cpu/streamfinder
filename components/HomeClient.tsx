'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, TrendingUp, Star, Heart, List } from 'lucide-react'
import MoodRecommender from '@/components/MoodRecommender'
import PlatformCarousel from '@/components/PlatformCarousel'
import PlatformLogoStrip from '@/components/PlatformLogoStrip'
import BirthdayCarousel from '@/components/BirthdayCarousel'
import StarDisplay from '@/components/StarDisplay'
import { useCountry } from '@/context/CountryContext'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB = 'https://api.themoviedb.org/3'
const PROVIDER_IDS = '8|337|119|384|531|350'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlatformItem {
  id: number; title: string; posterPath: string | null
  mediaType: 'movie' | 'tv'; date: string
}
interface PlatformData { id: number; name: string; color: string; items: PlatformItem[] }
interface PlatformLogo { id: number; slug: string; name: string; color: string; logoPath: string | null }
interface HomeData { platformsWithLogos: PlatformLogo[]; platformContent: PlatformData[] }

interface HeroMovie { backdropPath: string | null; title: string }

interface RecentItem {
  id: number; title: string; posterPath: string | null
  mediaType: 'movie' | 'tv'; year: string
  providerLogoPath: string | null; providerName: string | null
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
  rating: number | null; body: string | null; likeCount: number
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function CarouselSkeleton() {
  return (
    <div className="animate-pulse mb-12">
      <div className="h-6 w-40 bg-[#1C1C27] rounded mb-4" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shrink-0 w-32 aspect-[2/3] bg-[#1C1C27] rounded-lg" />
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
  const backdropUrl = heroMovie?.backdropPath
    ? `https://image.tmdb.org/t/p/original${heroMovie.backdropPath}`
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
          <Link
            href="/auth"
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
            Empezá ahora, ¡es gratis!
          </Link>
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
          <Link
            key={`${item.mediaType}-${item.id}`}
            href={`/${item.mediaType}/${item.id}`}
            className="flex-shrink-0 w-28 sm:w-32 group carousel-snap"
          >
            <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-1.5">
              {item.posterPath ? (
                <Image
                  src={`https://image.tmdb.org/t/p/w185${item.posterPath}`}
                  alt={item.title}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="128px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#A0A0B0] text-xs text-center px-2">
                  Sin imagen
                </div>
              )}

              {/* Type badge */}
              <div className="absolute top-1.5 left-1.5">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{
                    backgroundColor: item.mediaType === 'movie' ? '#2563eb' : '#FFFD02',
                    color: item.mediaType === 'movie' ? '#fff' : '#000',
                  }}
                >
                  {item.mediaType === 'movie' ? 'Peli' : 'Serie'}
                </span>
              </div>

              {/* Provider logo */}
              {item.providerLogoPath && (
                <div className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-md overflow-hidden shadow-lg ring-1 ring-white/20">
                  <Image
                    src={`https://image.tmdb.org/t/p/original${item.providerLogoPath}`}
                    alt={item.providerName ?? ''}
                    width={24}
                    height={24}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-xs text-zinc-300 line-clamp-2 leading-tight group-hover:text-white transition-colors">
              {item.title}
            </p>
            {item.year && (
              <p className="text-[11px] text-[#A0A0B0] mt-0.5">{item.year}</p>
            )}
          </Link>
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

function FeaturedReviewsSection({ reviews }: { reviews: FeaturedReview[] }) {
  if (!reviews.length) return null

  return (
    <section className="mb-12">
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
          <Star size={17} style={{ color: '#F5A623' }} />
          Reseñas destacadas
        </h2>
        <p className="text-xs text-[#A0A0B0] mt-0.5">Las más valoradas por la comunidad</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {reviews.map(review => {
          const name = review.authorDisplayName ?? review.authorUsername
          const initials = name[0]?.toUpperCase() ?? '?'
          return (
            <Link
              key={review.id}
              href={`/review/${review.id}`}
              className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 hover:border-[#FFFD02]/40 transition-colors group flex flex-col"
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
                    {(review.authorUsername === 'Ferlageok' || review.authorUsername === 'ferlageok') && <svg width="13" height="13" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="10" fill="#1D9BF0"/><path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </p>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'rgba(245,166,35,0.15)', color: '#F5A623' }}
                  >
                    ★ Destacada
                  </span>
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
                <p className="text-sm text-zinc-300 line-clamp-2 sm:line-clamp-3 leading-relaxed flex-1">
                  {review.body.slice(0, 120)}{review.body.length > 120 ? '…' : ''}
                </p>
              )}

              {/* Footer */}
              <div className="flex items-center gap-1.5 mt-3 text-xs text-[#A0A0B0] pt-3 border-t border-[#2A2A3A]">
                <Heart size={11} />
                {review.likeCount} me gusta
              </div>
            </Link>
          )
        })}
      </div>
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
  const [user,      setUser]      = useState<User | null | undefined>(undefined)
  const [userName,  setUserName]  = useState('')
  const [heroMovie, setHeroMovie] = useState<HeroMovie | null>(null)
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
          ? fetch(`${TMDB}/trending/movie/week?api_key=${TMDB_KEY}&language=es-AR`)
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

      // Hero: trending semanal — prioriza El diablo viste de Prada 2 esta semana,
      // luego estrenos recientes con mayor popularity, sin animaciones ni documentales
      type TrendingMovie = { id: number; backdrop_path: string | null; title?: string; vote_count: number; popularity: number; genre_ids: number[]; release_date?: string }
      const results: TrendingMovie[] = heroRes?.results ?? []
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const devilPrada = results.find(m => m.id === 1314481 && m.backdrop_path)
      const pick = devilPrada ?? results
        .filter(m => m.backdrop_path && m.vote_count > 100 && !m.genre_ids.includes(16) && !m.genre_ids.includes(99))
        .sort((a, b) => {
          const aRecent = (a.release_date ?? '') >= thirtyDaysAgo ? 1 : 0
          const bRecent = (b.release_date ?? '') >= thirtyDaysAgo ? 1 : 0
          if (bRecent !== aRecent) return bRecent - aRecent
          return b.popularity - a.popularity
        })[0]
        ?? null
      if (pick?.backdrop_path) {
        setHeroMovie({ backdropPath: pick.backdrop_path, title: pick.title ?? '' })
      }

      if (u) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, display_name')
          .eq('id', u.id)
          .maybeSingle()
        setUserName(profile?.display_name ?? profile?.username ?? u.email?.split('@')[0] ?? '')
      }
    }
    boot()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!TMDB_KEY || !country) { setRecentLoading(false); return }
    setRecentLoading(true)

    async function loadRecent() {
      const base = `api_key=${TMDB_KEY}&language=es-AR&page=1&watch_region=${country}&with_watch_providers=${PROVIDER_IDS}`
      const [movRes, tvRes] = await Promise.all([
        fetch(`${TMDB}/discover/movie?${base}&sort_by=release_date.desc`).then(r => r.ok ? r.json() : { results: [] }),
        fetch(`${TMDB}/discover/tv?${base}&sort_by=first_air_date.desc`).then(r => r.ok ? r.json() : { results: [] }),
      ])

      type RawMovie = { id: number; title?: string; name?: string; poster_path: string | null; release_date?: string; first_air_date?: string }
      const movies: RecentItem[] = ((movRes.results ?? []) as RawMovie[]).filter(m => m.poster_path).slice(0, 8).map(m => ({
        id: m.id, title: m.title ?? '', posterPath: m.poster_path,
        mediaType: 'movie', year: (m.release_date ?? '').slice(0, 4),
        providerLogoPath: null, providerName: null,
      }))
      const tv: RecentItem[] = ((tvRes.results ?? []) as RawMovie[]).filter(m => m.poster_path).slice(0, 8).map(m => ({
        id: m.id, title: m.name ?? '', posterPath: m.poster_path,
        mediaType: 'tv', year: (m.first_air_date ?? '').slice(0, 4),
        providerLogoPath: null, providerName: null,
      }))

      // Interleave movies and TV, take top 10
      const merged: RecentItem[] = []
      const maxLen = Math.max(movies.length, tv.length)
      for (let i = 0; i < maxLen && merged.length < 10; i++) {
        if (movies[i]) merged.push(movies[i])
        if (merged.length < 10 && tv[i]) merged.push(tv[i])
      }
      const top10 = merged.slice(0, 10)

      // Fetch watch providers in parallel
      const withProviders = await Promise.all(
        top10.map(async item => {
          try {
            const ep = item.mediaType === 'movie' ? 'movie' : 'tv'
            const res = await fetch(`${TMDB}/${ep}/${item.id}/watch/providers?api_key=${TMDB_KEY}`)
            if (!res.ok) return item
            const d = await res.json()
            const region = d.results?.[country]
            const provider = region?.flatrate?.[0] ?? region?.ads?.[0] ?? null
            return { ...item, providerLogoPath: provider?.logo_path ?? null, providerName: provider?.provider_name ?? null }
          } catch { return item }
        })
      )

      setRecentItems(withProviders)
      setRecentLoading(false)
    }

    loadRecent().catch(() => setRecentLoading(false))
  }, [country]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Trending (Supabase watched, last 7 days) ──────────────────────────────
  useEffect(() => {
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Featured reviews ──────────────────────────────────────────────────────
  useEffect(() => {
    async function loadReviews() {
      // Fetch reviews without embedded relation to avoid FK issues
      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('id, media_id, media_type, title, poster_path, rating, body, user_id')
        .not('body', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)

      if (!reviewsData?.length) { setReviewsLoading(false); return }

      // Fetch like counts separately to avoid embed failures
      const reviewIds = reviewsData.slice(0, 20).map(r => r.id)
      const { data: likesData } = await supabase
        .from('review_likes')
        .select('review_id')
        .in('review_id', reviewIds)
      const likesByReview: Record<string, number> = {}
      for (const l of likesData ?? []) {
        likesByReview[l.review_id] = (likesByReview[l.review_id] ?? 0) + 1
      }

      const sorted = reviewsData
        .map(r => ({ ...r, likeCount: likesByReview[r.id] ?? 0 }))
        .sort((a, b) => b.likeCount - a.likeCount)
        .slice(0, 3)

      const userIds = [...new Set(sorted.map(r => r.user_id))]
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', userIds)
      const pMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

      setFeaturedReviews(sorted.map(r => ({
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
        likeCount: r.likeCount,
      })))
      setReviewsLoading(false)
    }
    loadReviews()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Official lists (Glynbox curated) ─────────────────────────────────────
  useEffect(() => {
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* SECCIÓN 1 — HERO */}
      <HeroSection user={user} userName={userName} heroMovie={heroMovie} />

      {/* SECCIÓN 2 — PLATAFORMAS */}
      {platformData
        ? <PlatformLogoStrip platforms={platformData.platformsWithLogos} />
        : <div className="h-[88px] bg-[#13131A] border-y border-[#2A2A3A]" />
      }

      <div className="max-w-7xl mx-auto px-4 py-10">

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
      </div>

      {/* SECCIÓN 5 — RECOMENDADOR (full-width) */}
      <MoodRecommender />

      <div className="max-w-7xl mx-auto px-4 py-10">

        {/* SECCIÓN 6 — RESEÑAS DESTACADAS */}
        {reviewsLoading
          ? <ReviewsSkeleton />
          : <FeaturedReviewsSection reviews={featuredReviews} />
        }

        {/* SECCIÓN 6b — LISTAS DE GLYNBOX */}
        <OfficialListsSection lists={officialLists} loading={officialListsLoading} />

        {/* SECCIÓN 7 — CUMPLEAÑOS */}
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
    </>
  )
}
