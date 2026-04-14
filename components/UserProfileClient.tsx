'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  UserPlus, UserCheck, Star, Plus, X,
  Search as SearchIcon, Settings, CheckCircle, MessageSquare,
  ThumbsUp, ThumbsDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { getPosterUrl } from '@/lib/tmdb'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PublicProfile {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
}

interface PinnedSlot {
  slot: number; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null
}

interface ReviewItem {
  id: string; user_id?: string; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null
  rating: number | null; body: string | null; recommended: boolean
  created_at: string
  author?: { username: string | null; avatar_url: string | null }
}

interface WatchedItem {
  id: string; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null; watched_at: string
}

interface WatchlistItem {
  id: string; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null; added_at: string
}

interface TmdbResult {
  id: number; media_type: 'movie' | 'tv'
  title?: string; name?: string; poster_path: string | null
}

type Tab = 'perfil' | 'actividad' | 'yavi' | 'resenas' | 'paraVer' | 'megusta'

// ── Design helpers ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-zinc-500 mb-3">
      {children}
    </p>
  )
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-zinc-600 text-sm">{children}</p>
    </div>
  )
}

function PosterLink({
  mediaId, mediaType, posterPath, title,
  width = 'w-full', overlay,
}: {
  mediaId: number; mediaType: string; posterPath: string | null; title: string
  width?: string; overlay?: React.ReactNode
}) {
  return (
    <Link href={`/${mediaType}/${mediaId}`} className="group block">
      <div className={`relative ${width} aspect-[2/3] rounded-md overflow-hidden bg-zinc-800`}>
        {posterPath ? (
          <Image
            src={getPosterUrl(posterPath, 'w185')}
            alt={title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="160px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px] text-center px-1">
            {title}
          </div>
        )}
        {overlay}
      </div>
    </Link>
  )
}

function ReviewCard({
  review, showAuthor = false,
}: {
  review: ReviewItem; showAuthor?: boolean
}) {
  const href = `/${review.media_type}/${review.media_id}`
  return (
    <div className="flex gap-4 py-4 border-b border-zinc-800 last:border-0">
      <Link href={href} className="shrink-0">
        <div className="relative w-12 aspect-[2/3] rounded-md overflow-hidden bg-zinc-800">
          {review.poster_path && (
            <Image src={getPosterUrl(review.poster_path, 'w92')} alt={review.title} fill className="object-cover" sizes="48px" />
          )}
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <Link href={href} className="text-sm font-semibold text-white hover:text-emerald-400 transition-colors line-clamp-1">
            {review.title}
          </Link>
          <span className="text-[11px] text-zinc-600 shrink-0">
            {new Date(review.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        {showAuthor && review.author?.username && (
          <Link href={`/usuario/${review.author.username}`} className="text-xs text-zinc-500 hover:text-white transition-colors block mb-1">
            @{review.author.username}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          {review.rating && (
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map(s => (
                <Star key={s} size={11} className="text-yellow-400" fill={s <= review.rating! ? 'currentColor' : 'none'} />
              ))}
            </div>
          )}
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
            review.recommended ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
          }`}>
            {review.recommended ? '👍 Recomendada' : '👎 No recomendada'}
          </span>
        </div>
        {review.body && (
          <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">{review.body}</p>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function UserProfileClient({ profile }: { profile: PublicProfile }) {
  const supabase      = createClient()
  const loadedTabs    = useRef<Set<Tab>>(new Set(['perfil']))
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Identity & follow ──────────────────────────────────────────
  const [currentUserId,  setCurrentUserId]  = useState<string | null | undefined>(undefined)
  const [isFollowing,    setIsFollowing]    = useState(false)
  const [followsMe,      setFollowsMe]      = useState(false)
  const [followBusy,     setFollowBusy]     = useState(false)

  // ── Stats ──────────────────────────────────────────────────────
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [moviesWatched,  setMoviesWatched]  = useState(0)
  const [watchedThisYear, setWatchedThisYear] = useState(0)

  // ── Pinned favorites ───────────────────────────────────────────
  const [pinned,        setPinned]        = useState<(PinnedSlot | null)[]>([null, null, null, null, null])
  const [searchingSlot, setSearchingSlot] = useState<number | null>(null)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<TmdbResult[]>([])
  const [searchBusy,    setSearchBusy]    = useState(false)

  // ── Tab state ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>('perfil')

  // ── Data ───────────────────────────────────────────────────────
  const [recentWatched,  setRecentWatched]  = useState<WatchedItem[]>([])
  const [watchlistPreview, setWatchlistPreview] = useState<WatchlistItem[]>([])
  const [watchlistCount, setWatchlistCount] = useState(0)
  const [allActivity,    setAllActivity]    = useState<({ kind: 'review'; date: string; data: ReviewItem } | { kind: 'watched'; date: string; data: WatchedItem })[]>([])
  const [allWatched,     setAllWatched]     = useState<WatchedItem[]>([])
  const [allReviews,     setAllReviews]     = useState<ReviewItem[]>([])
  const [allWatchlist,   setAllWatchlist]   = useState<WatchlistItem[]>([])
  const [likedReviews,   setLikedReviews]   = useState<ReviewItem[]>([])

  // ── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    const thisYear = new Date().getFullYear()

    async function init() {
      const [
        authRes, followersRes, followingRes,
        moviesRes, thisYearRes,
        pinnedRes, recentWatchedRes,
        wlCountRes, wlPreviewRes,
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
        supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', profile.id).eq('media_type', 'movie'),
        supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', profile.id).gte('watched_at', `${thisYear}-01-01`),
        supabase.from('pinned_favorites').select('*').eq('user_id', profile.id).order('slot'),
        supabase.from('watched').select('id,media_id,media_type,title,poster_path,watched_at').eq('user_id', profile.id).order('watched_at', { ascending: false }).limit(4),
        supabase.from('watchlist').select('*', { count: 'exact', head: true }).eq('user_id', profile.id),
        supabase.from('watchlist').select('id,media_id,media_type,title,poster_path,added_at').eq('user_id', profile.id).order('added_at', { ascending: false }).limit(6),
      ])

      const uid = authRes.data.user?.id ?? null
      setCurrentUserId(uid)
      setFollowersCount(followersRes.count ?? 0)
      setFollowingCount(followingRes.count ?? 0)
      setMoviesWatched(moviesRes.count ?? 0)
      setWatchedThisYear(thisYearRes.count ?? 0)
      setRecentWatched(recentWatchedRes.data ?? [])
      setWatchlistCount(wlCountRes.count ?? 0)
      setWatchlistPreview(wlPreviewRes.data ?? [])

      // Pinned slots
      const slots: (PinnedSlot | null)[] = [null, null, null, null, null]
      for (const p of pinnedRes.data ?? []) {
        if (p.slot >= 1 && p.slot <= 5) slots[p.slot - 1] = p as PinnedSlot
      }
      setPinned(slots)

      // Follow state (only if logged in and viewing someone else)
      if (uid && uid !== profile.id) {
        const [fwdRes, bwdRes] = await Promise.all([
          supabase.from('follows').select('follower_id').eq('follower_id', uid).eq('following_id', profile.id).maybeSingle(),
          supabase.from('follows').select('follower_id').eq('follower_id', profile.id).eq('following_id', uid).maybeSingle(),
        ])
        setIsFollowing(!!fwdRes.data)
        setFollowsMe(!!bwdRes.data)
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id])

  // ── Lazy tab loading ───────────────────────────────────────────
  useEffect(() => {
    if (loadedTabs.current.has(activeTab)) return
    loadedTabs.current.add(activeTab)

    if (activeTab === 'actividad') loadActividad()
    if (activeTab === 'yavi') {
      supabase.from('watched').select('id,media_id,media_type,title,poster_path,watched_at').eq('user_id', profile.id).order('watched_at', { ascending: false })
        .then(({ data }) => setAllWatched(data ?? []))
    }
    if (activeTab === 'resenas') {
      supabase.from('reviews').select('id,media_id,media_type,title,poster_path,rating,body,recommended,created_at').eq('user_id', profile.id).order('created_at', { ascending: false })
        .then(({ data }) => setAllReviews(data ?? []))
    }
    if (activeTab === 'paraVer') {
      supabase.from('watchlist').select('id,media_id,media_type,title,poster_path,added_at').eq('user_id', profile.id).order('added_at', { ascending: false })
        .then(({ data }) => setAllWatchlist(data ?? []))
    }
    if (activeTab === 'megusta') loadLikedReviews()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  async function loadActividad() {
    const [reviewsRes, watchedRes] = await Promise.all([
      supabase.from('reviews').select('id,media_id,media_type,title,poster_path,rating,body,recommended,created_at').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('watched').select('id,media_id,media_type,title,poster_path,watched_at').eq('user_id', profile.id).order('watched_at', { ascending: false }).limit(50),
    ])
    const merged = [
      ...(reviewsRes.data ?? []).map(r => ({ kind: 'review' as const, date: r.created_at, data: r as ReviewItem })),
      ...(watchedRes.data  ?? []).map(w => ({ kind: 'watched' as const, date: w.watched_at, data: w as WatchedItem })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    setAllActivity(merged)
  }

  async function loadLikedReviews() {
    const { data: likes } = await supabase.from('review_likes').select('review_id').eq('user_id', profile.id)
    if (!likes?.length) { setLikedReviews([]); return }
    const { data: reviews } = await supabase.from('reviews')
      .select('id,user_id,media_id,media_type,title,poster_path,rating,body,recommended,created_at')
      .in('id', likes.map((l: { review_id: string }) => l.review_id))
      .order('created_at', { ascending: false })
    if (!reviews?.length) { setLikedReviews([]); return }
    const authorIds = [...new Set(reviews.map((r: { user_id: string }) => r.user_id))]
    const { data: profiles } = await supabase.from('profiles').select('id,username,avatar_url').in('id', authorIds)
    const pmap = Object.fromEntries((profiles ?? []).map((p: { id: string; username: string | null; avatar_url: string | null }) => [p.id, p]))
    setLikedReviews(reviews.map((r: ReviewItem & { user_id: string }) => ({
      ...r, author: pmap[r.user_id] ?? { username: null, avatar_url: null },
    })))
  }

  // ── Follow toggle ──────────────────────────────────────────────
  async function toggleFollow() {
    if (!currentUserId || currentUserId === profile.id || followBusy) return
    setFollowBusy(true)
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', profile.id)
      setIsFollowing(false)
      setFollowersCount(c => c - 1)
    } else {
      await supabase.from('follows').insert({ follower_id: currentUserId, following_id: profile.id })
      setIsFollowing(true)
      setFollowersCount(c => c + 1)
    }
    setFollowBusy(false)
  }

  // ── Pinned favorites search ────────────────────────────────────
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (!searchQuery.trim()) { setSearchResults([]); setSearchBusy(false); return }
    setSearchBusy(true)
    debounceTimer.current = setTimeout(async () => {
      const res  = await fetch(
        `https://api.themoviedb.org/3/search/multi?api_key=${process.env.NEXT_PUBLIC_TMDB_API_KEY}&query=${encodeURIComponent(searchQuery.trim())}&language=es-AR`
      )
      const data = await res.json()
      setSearchResults(
        (data.results ?? [])
          .filter((r: { media_type: string }) => r.media_type === 'movie' || r.media_type === 'tv')
          .slice(0, 8) as TmdbResult[]
      )
      setSearchBusy(false)
    }, 400)
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [searchQuery])

  async function savePin(slot: number, item: TmdbResult) {
    if (!currentUserId || currentUserId !== profile.id) return
    const row: PinnedSlot = {
      slot, media_id: item.id, media_type: item.media_type,
      title: item.title ?? item.name ?? '', poster_path: item.poster_path ?? null,
    }
    await supabase.from('pinned_favorites').upsert({ user_id: profile.id, ...row }, { onConflict: 'user_id,slot' })
    setPinned(prev => { const n = [...prev]; n[slot - 1] = row; return n })
    setSearchingSlot(null); setSearchQuery(''); setSearchResults([])
  }

  async function removePin(slot: number) {
    if (!currentUserId || currentUserId !== profile.id) return
    await supabase.from('pinned_favorites').delete().eq('user_id', profile.id).eq('slot', slot)
    setPinned(prev => { const n = [...prev]; n[slot - 1] = null; return n })
  }

  // ── Derived ────────────────────────────────────────────────────
  const isOwner     = currentUserId === profile.id
  const displayName = profile.display_name ?? profile.username ?? 'Usuario'
  const hasPinned   = pinned.some(Boolean)

  const TABS: { id: Tab; label: string }[] = [
    { id: 'perfil',    label: 'Perfil'    },
    { id: 'actividad', label: 'Actividad' },
    { id: 'yavi',      label: 'Ya vi'     },
    { id: 'resenas',   label: 'Reseñas'   },
    { id: 'paraVer',   label: 'Para ver'  },
    { id: 'megusta',   label: 'Me gusta'  },
  ]

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950">

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border-b border-zinc-800/60">
        <div className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">

            {/* Avatar */}
            <div className="shrink-0">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-zinc-700 ring-4 ring-zinc-700">
                {profile.avatar_url ? (
                  <Image src={profile.avatar_url} alt={displayName} width={112} height={112} className="w-full h-full object-cover" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-zinc-500">
                    {displayName[0]?.toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 text-center sm:text-left">

              {/* Name row */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mb-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{displayName}</h1>
                {followsMe && (
                  <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-2.5 py-1 rounded-full">
                    Te sigue
                  </span>
                )}
              </div>

              <p className="text-zinc-500 text-sm mb-2">@{profile.username}</p>

              {profile.bio && (
                <p className="text-zinc-400 text-sm leading-relaxed max-w-lg mb-4">{profile.bio}</p>
              )}

              {/* Stats */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-5 mb-4">
                {[
                  { value: moviesWatched,   label: 'Películas' },
                  { value: watchedThisYear, label: 'Este año'  },
                  { value: followingCount,  label: 'Siguiendo' },
                  { value: followersCount,  label: 'Seguidores'},
                ].map((s, i) => (
                  <div key={s.label} className="flex items-center gap-5">
                    {i > 0 && <span className="text-zinc-700 hidden sm:block">·</span>}
                    <div className="text-center sm:text-left">
                      <p className="text-xl font-bold text-white leading-none">{s.value}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5 uppercase tracking-wide">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action button */}
              {currentUserId === undefined ? null : isOwner ? (
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <Settings size={14} /> Editar perfil
                </Link>
              ) : currentUserId ? (
                <button
                  onClick={toggleFollow}
                  disabled={followBusy}
                  className={`inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                    isFollowing
                      ? 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  }`}
                >
                  {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
                  {isFollowing ? 'Siguiendo' : 'Seguir'}
                </button>
              ) : (
                <Link href="/auth" className="inline-flex items-center gap-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg transition-colors">
                  <UserPlus size={14} /> Seguir
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── TAB BAR ────────────────────────────────────────────── */}
      <div className="sticky top-[57px] z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 flex overflow-x-auto no-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 sm:px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB CONTENT ────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* ── PERFIL ── */}
        {activeTab === 'perfil' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-8 lg:gap-10 items-start">

            {/* Main column */}
            <div className="space-y-10">

              {/* Películas favoritas */}
              {(hasPinned || isOwner) && (
                <section>
                  <SectionLabel>Películas favoritas</SectionLabel>
                  <div className="grid grid-cols-5 gap-2 sm:gap-3">
                    {pinned.map((item, idx) => {
                      const slot = idx + 1
                      return item ? (
                        <div key={slot} className="relative group/pin">
                          <Link href={`/${item.media_type}/${item.media_id}`}>
                            <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800">
                              {item.poster_path ? (
                                <Image
                                  src={getPosterUrl(item.poster_path, 'w342')}
                                  alt={item.title}
                                  fill
                                  className="object-cover transition-transform duration-300 group-hover/pin:scale-105"
                                  sizes="(max-width: 640px) 20vw, 180px"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px] text-center px-1">{item.title}</div>
                              )}
                            </div>
                          </Link>
                          {isOwner && (
                            <div className="absolute inset-0 rounded-lg bg-black/60 opacity-0 group-hover/pin:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <button
                                onClick={() => { setSearchingSlot(slot); setSearchQuery('') }}
                                className="bg-zinc-900/90 hover:bg-emerald-600 text-white rounded-full p-1.5 transition-colors"
                                title="Cambiar"
                              >
                                <SearchIcon size={12} />
                              </button>
                              <button
                                onClick={() => removePin(slot)}
                                className="bg-zinc-900/90 hover:bg-red-600 text-white rounded-full p-1.5 transition-colors"
                                title="Quitar"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div key={slot}>
                          <div
                            className={`aspect-[2/3] rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors ${
                              isOwner
                                ? 'border-zinc-700 hover:border-emerald-500 cursor-pointer'
                                : 'border-zinc-800'
                            }`}
                            onClick={() => isOwner && setSearchingSlot(slot)}
                          >
                            {isOwner && <Plus size={18} className="text-zinc-600" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* Actividad reciente */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <SectionLabel>Actividad reciente</SectionLabel>
                  {recentWatched.length > 0 && (
                    <button
                      onClick={() => setActiveTab('actividad')}
                      className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors"
                    >
                      Ver toda la actividad →
                    </button>
                  )}
                </div>
                {recentWatched.length === 0 ? (
                  <p className="text-zinc-600 text-sm">Sin actividad reciente.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 sm:gap-3">
                    {recentWatched.map(w => (
                      <PosterLink
                        key={w.id}
                        mediaId={w.media_id}
                        mediaType={w.media_type}
                        posterPath={w.poster_path}
                        title={w.title}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Sidebar */}
            <aside className="space-y-8">
              {/* Para ver */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <SectionLabel>Para ver</SectionLabel>
                  {watchlistCount > 0 && (
                    <button
                      onClick={() => setActiveTab('paraVer')}
                      className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors"
                    >
                      Ver todos ({watchlistCount}) →
                    </button>
                  )}
                </div>
                {watchlistPreview.length === 0 ? (
                  <p className="text-zinc-700 text-xs">Lista vacía.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {watchlistPreview.slice(0, 6).map(item => (
                      <PosterLink
                        key={item.id}
                        mediaId={item.media_id}
                        mediaType={item.media_type}
                        posterPath={item.poster_path}
                        title={item.title}
                      />
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>
        )}

        {/* ── ACTIVIDAD ── */}
        {activeTab === 'actividad' && (
          allActivity.length === 0 ? (
            <EmptyCard>Sin actividad todavía.</EmptyCard>
          ) : (
            <div>
              {allActivity.map((entry, i) => {
                if (entry.kind === 'review') {
                  return <ReviewCard key={`rev-${entry.data.id}`} review={entry.data} />
                }
                const w = entry.data as WatchedItem
                return (
                  <div key={`wat-${w.id}-${i}`} className="flex items-center gap-4 py-3 border-b border-zinc-800 last:border-0">
                    <PosterLink
                      mediaId={w.media_id} mediaType={w.media_type}
                      posterPath={w.poster_path} title={w.title} width="w-10"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <CheckCircle size={11} className="text-emerald-500 shrink-0" />
                        <span className="text-xs text-zinc-500">Marcó como visto</span>
                      </div>
                      <Link href={`/${w.media_type}/${w.media_id}`} className="text-sm font-medium text-white hover:text-emerald-400 transition-colors line-clamp-1">
                        {w.title}
                      </Link>
                    </div>
                    <span className="text-[11px] text-zinc-600 shrink-0">
                      {new Date(w.watched_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* ── YA VI ── */}
        {activeTab === 'yavi' && (
          allWatched.length === 0 ? (
            <EmptyCard>Sin contenido visto todavía.</EmptyCard>
          ) : (
            <>
              <p className="text-xs text-zinc-600 mb-4">{allWatched.length} título{allWatched.length !== 1 ? 's' : ''}</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {allWatched.map(w => (
                  <PosterLink key={w.id} mediaId={w.media_id} mediaType={w.media_type} posterPath={w.poster_path} title={w.title} />
                ))}
              </div>
            </>
          )
        )}

        {/* ── RESEÑAS ── */}
        {activeTab === 'resenas' && (
          allReviews.length === 0 ? (
            <EmptyCard>Sin reseñas todavía.</EmptyCard>
          ) : (
            <div>
              {allReviews.map(r => <ReviewCard key={r.id} review={r} />)}
            </div>
          )
        )}

        {/* ── PARA VER ── */}
        {activeTab === 'paraVer' && (
          allWatchlist.length === 0 ? (
            <EmptyCard>Lista de pendientes vacía.</EmptyCard>
          ) : (
            <>
              <p className="text-xs text-zinc-600 mb-4">{allWatchlist.length} título{allWatchlist.length !== 1 ? 's' : ''}</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {allWatchlist.map(w => (
                  <PosterLink key={w.id} mediaId={w.media_id} mediaType={w.media_type} posterPath={w.poster_path} title={w.title} />
                ))}
              </div>
            </>
          )
        )}

        {/* ── ME GUSTA ── */}
        {activeTab === 'megusta' && (
          likedReviews.length === 0 ? (
            <EmptyCard>Sin reseñas que le gusten todavía.</EmptyCard>
          ) : (
            <div>
              {likedReviews.map(r => <ReviewCard key={r.id} review={r} showAuthor />)}
            </div>
          )
        )}
      </div>

      {/* ── PINNED FAVORITES SEARCH MODAL ──────────────────────── */}
      {searchingSlot !== null && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={e => {
            if (e.target === e.currentTarget) {
              setSearchingSlot(null); setSearchQuery(''); setSearchResults([])
            }
          }}
        >
          <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <p className="text-sm font-semibold text-white">
                Elegir favorita · Slot {searchingSlot}
              </p>
              <button
                onClick={() => { setSearchingSlot(null); setSearchQuery(''); setSearchResults([]) }}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5 border border-zinc-700 focus-within:border-emerald-500 transition-colors">
                <SearchIcon size={14} className="text-zinc-500 shrink-0" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar película o serie..."
                  className="bg-transparent text-sm text-white placeholder-zinc-500 outline-none flex-1"
                />
                {searchBusy && (
                  <div className="w-3.5 h-3.5 border border-zinc-600 border-t-emerald-400 rounded-full animate-spin shrink-0" />
                )}
              </div>
            </div>
            <div className="px-4 pb-4 min-h-[100px]">
              {searchResults.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto pt-2">
                  {searchResults.map(result => {
                    const label = result.title ?? result.name ?? ''
                    return (
                      <button key={result.id} onClick={() => savePin(searchingSlot!, result)} className="group/res text-left">
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-1 ring-2 ring-transparent group-hover/res:ring-emerald-500 transition-all">
                          {result.poster_path ? (
                            <Image src={getPosterUrl(result.poster_path, 'w185')} alt={label} fill className="object-cover" sizes="90px" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px] text-center p-1">{label}</div>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-400 line-clamp-2 leading-tight">{label}</p>
                      </button>
                    )
                  })}
                </div>
              ) : searchQuery.trim() && !searchBusy ? (
                <p className="text-zinc-600 text-sm text-center pt-6">Sin resultados para &quot;{searchQuery}&quot;</p>
              ) : !searchQuery.trim() ? (
                <p className="text-zinc-700 text-sm text-center pt-6">Escribí el título para buscar</p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
