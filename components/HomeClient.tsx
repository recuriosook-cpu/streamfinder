'use client'

import { useEffect, useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, TrendingUp, Star, Heart } from 'lucide-react'
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

interface Stats { watched: number; reviews: number; users: number }

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
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

function HeroSection({
  stats, user, userName,
}: {
  stats: Stats | null
  user: User | null | undefined
  userName: string
}) {
  return (
    <section className="bg-[#13131A] border-b border-[#2A2A3A] py-10 sm:py-16 px-4">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight mb-3 sm:mb-4">
          Tu universo de{' '}
          <span style={{ color: '#6B3FE7' }}>cine y series</span>
        </h1>
        <p className="text-base sm:text-lg text-[#A0A0B0] mb-8 sm:mb-10 max-w-xl mx-auto leading-relaxed px-2">
          Descubrí qué ver, seguí a amigos y compartí lo que sentís
        </p>

        {/* Stats */}
        <div className="flex items-center justify-center gap-4 sm:gap-8 md:gap-16 mb-8 sm:mb-10">
          {[
            { value: stats?.watched ?? null, label: 'Títulos vistos' },
            { value: stats?.reviews ?? null, label: 'Reseñas'        },
            { value: stats?.users   ?? null, label: 'Usuarios'       },
          ].map((s, i) => (
            <div key={s.label} className="flex items-center gap-4 sm:gap-8 md:gap-16">
              {i > 0 && <span className="text-[#2A2A3A] text-xl select-none">·</span>}
              <div className="text-center">
                <p className="text-2xl sm:text-3xl md:text-4xl font-black text-white tabular-nums">
                  {s.value !== null ? fmt(s.value) : <span className="text-[#2A2A3A]">—</span>}
                </p>
                <p className="text-[10px] sm:text-[11px] text-[#A0A0B0] uppercase tracking-wider mt-1">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA / Welcome */}
        {user === undefined ? (
          <div className="h-10" />
        ) : user ? (
          <p className="text-[#A0A0B0]">
            Bienvenido de vuelta,{' '}
            <Link href="/profile" className="font-semibold text-white hover:text-[#6B3FE7] transition-colors">
              {userName}
            </Link>{' '}
            👋
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link
              href="/auth"
              className="w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-white text-sm transition-all hover:opacity-90 active:scale-95 text-center"
              style={{ backgroundColor: '#6B3FE7' }}
            >
              Empezar gratis
            </Link>
            <Link
              href="/que-ver"
              className="w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-white text-sm border border-[#2A2A3A] hover:border-[#6B3FE7] hover:text-[#6B3FE7] transition-all text-center"
            >
              Explorar
            </Link>
          </div>
        )}
      </div>
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
        {items.map(item => (
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
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white"
                  style={{ backgroundColor: item.mediaType === 'movie' ? '#2563eb' : '#6B3FE7' }}
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
          <TrendingUp size={18} style={{ color: '#6B3FE7' }} />
          Tendencias en Glynbox
        </h2>
        <p className="text-xs text-[#A0A0B0] mt-0.5">Lo que más se está viendo esta semana</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item, idx) => (
          <Link
            key={`${item.mediaType}-${item.mediaId}`}
            href={`/${item.mediaType}/${item.mediaId}`}
            className="flex items-center gap-3 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-3 hover:border-[#6B3FE7]/50 transition-colors group"
          >
            {/* Rank */}
            <span
              className="text-2xl font-black w-9 text-center shrink-0 tabular-nums leading-none"
              style={{ color: idx < 3 ? '#6B3FE7' : 'rgba(107,63,231,0.35)' }}
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
              <p className="text-sm font-semibold text-white line-clamp-1 group-hover:text-[#6B3FE7] transition-colors">
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
              className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 hover:border-[#6B3FE7]/40 transition-colors group flex flex-col"
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
                  <p className="text-sm font-semibold text-white truncate">{name}</p>
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
              <p className="text-xs font-semibold mb-1.5 line-clamp-1" style={{ color: '#6B3FE7' }}>
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

// ── Main component ────────────────────────────────────────────────────────────

export default function HomeClient() {
  const { country } = useCountry()
  const supabase = useRef(createClient()).current

  // Platform data
  const [platformData, setPlatformData]   = useState<HomeData | null>(null)
  const [platformLoading, setPlatformLoading] = useState(true)
  const prevCountry = useRef<string | null>(null)

  // Auth + stats
  const [user,     setUser]     = useState<User | null | undefined>(undefined)
  const [userName, setUserName] = useState('')
  const [stats,    setStats]    = useState<Stats | null>(null)

  // New sections
  const [recentItems,    setRecentItems]    = useState<RecentItem[]>([])
  const [recentLoading,  setRecentLoading]  = useState(true)
  const [trendingItems,  setTrendingItems]  = useState<TrendingItem[]>([])
  const [trendingLoading, setTrendingLoading] = useState(true)
  const [featuredReviews, setFeaturedReviews] = useState<FeaturedReview[]>([])
  const [reviewsLoading,  setReviewsLoading]  = useState(true)

  // ── Auth + global stats ───────────────────────────────────────────────────
  useEffect(() => {
    async function boot() {
      const [authRes, watchedRes, reviewsRes, usersRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('watched').select('*', { count: 'exact', head: true }),
        supabase.from('reviews').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
      ])

      const u = authRes.data.user ?? null
      setUser(u)
      setStats({
        watched: watchedRes.count ?? 0,
        reviews: reviewsRes.count  ?? 0,
        users:   usersRes.count    ?? 0,
      })

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
      .then(r => r.json())
      .then((d: HomeData) => { setPlatformData(d); setPlatformLoading(false) })
      .catch(() => setPlatformLoading(false))
  }, [country])

  // ── Recent releases (TMDB, country-dependent) ─────────────────────────────
  useEffect(() => {
    if (!TMDB_KEY || !country) return
    setRecentLoading(true)

    async function loadRecent() {
      const base = `api_key=${TMDB_KEY}&language=es-AR&page=1&watch_region=${country}&with_watch_providers=${PROVIDER_IDS}`
      const [movRes, tvRes] = await Promise.all([
        fetch(`${TMDB}/discover/movie?${base}&sort_by=release_date.desc`).then(r => r.ok ? r.json() : { results: [] }),
        fetch(`${TMDB}/discover/tv?${base}&sort_by=first_air_date.desc`).then(r => r.ok ? r.json() : { results: [] }),
      ])

      type RawMovie = { id: number; title?: string; name?: string; poster_path: string | null; release_date?: string; first_air_date?: string }
      const movies: RecentItem[] = ((movRes.results ?? []) as RawMovie[]).slice(0, 8).map(m => ({
        id: m.id, title: m.title ?? '', posterPath: m.poster_path,
        mediaType: 'movie', year: (m.release_date ?? '').slice(0, 4),
        providerLogoPath: null, providerName: null,
      }))
      const tv: RecentItem[] = ((tvRes.results ?? []) as RawMovie[]).slice(0, 8).map(m => ({
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
        const items: TrendingItem[] = ((d.results ?? []) as Pop[]).slice(0, 10).map(m => ({
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
      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('id, media_id, media_type, title, poster_path, rating, body, user_id, review_likes(user_id)')
        .order('created_at', { ascending: false })
        .limit(30)

      if (!reviewsData?.length) { setReviewsLoading(false); return }

      type RawReview = typeof reviewsData[number]
      const sorted = (reviewsData as RawReview[])
        .map(r => ({
          ...r,
          likeCount: Array.isArray(r.review_likes) ? r.review_likes.length : 0,
        }))
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* SECCIÓN 1 — HERO */}
      <HeroSection stats={stats} user={user} userName={userName} />

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
