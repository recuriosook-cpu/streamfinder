'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  UserPlus, UserCheck, Star, CheckCircle, Bookmark,
  MessageSquare, Plus, X, Search as SearchIcon, Film, Tv,
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
  slot: number
  media_id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path: string | null
}

interface ReviewItem {
  id: string
  media_id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  rating: number | null
  body: string | null
  recommended: boolean
  created_at: string
}

interface WatchedItem {
  id: string
  media_id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  watched_at: string
}

interface WatchlistItem {
  id: string
  media_id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  added_at: string
}

interface LikedReview extends ReviewItem {
  author: { username: string | null; avatar_url: string | null }
}

interface TmdbResult {
  id: number
  media_type: 'movie' | 'tv'
  title?: string
  name?: string
  poster_path: string | null
}

type Tab = 'perfil' | 'resenas' | 'yavi' | 'paraVer' | 'megusta'

// ── Small helpers ──────────────────────────────────────────────────────────

function UserAvatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  return (
    <div
      className="rounded-full overflow-hidden bg-zinc-700 shrink-0"
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt={name} width={size} height={size} className="w-full h-full object-cover" unoptimized />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center font-bold text-zinc-400"
          style={{ fontSize: size * 0.38 }}
        >
          {name[0]?.toUpperCase()}
        </div>
      )}
    </div>
  )
}

function PosterGrid({ items, mediaIdKey, mediaTypeKey, posterKey, titleKey }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[]
  mediaIdKey: string
  mediaTypeKey: string
  posterKey: string
  titleKey: string
}) {
  if (items.length === 0) return null
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
      {items.map((item, i) => (
        <Link key={i} href={`/${item[mediaTypeKey]}/${item[mediaIdKey]}`} className="group">
          <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-1.5">
            {item[posterKey] ? (
              <Image
                src={getPosterUrl(item[posterKey], 'w185')}
                alt={item[titleKey]}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 640px) 33vw, 16vw"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center px-1">Sin imagen</div>
            )}
          </div>
          <p className="text-xs text-zinc-400 line-clamp-1 group-hover:text-zinc-200 transition-colors">{item[titleKey]}</p>
        </Link>
      ))}
    </div>
  )
}

function ReviewCard({ review, showAuthor }: {
  review: ReviewItem & { author?: { username: string | null; avatar_url: string | null } }
  showAuthor?: boolean
}) {
  const href = `/${review.media_type}/${review.media_id}`
  return (
    <div className="flex gap-4 bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-4">
      <Link href={href} className="shrink-0">
        <div className="relative w-12 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800">
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
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            review.recommended ? 'bg-emerald-900/60 text-emerald-400' : 'bg-red-900/60 text-red-400'
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

  // ── Auth & follow state ────────────────────────────────────────
  const [currentUserId,  setCurrentUserId]  = useState<string | null>(null)
  const [isFollowing,    setIsFollowing]    = useState(false)
  const [followsMe,      setFollowsMe]      = useState(false)
  const [followBusy,     setFollowBusy]     = useState(false)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [moviesWatched,  setMoviesWatched]  = useState(0)
  const [seriesWatched,  setSeriesWatched]  = useState(0)

  // ── Pinned favorites ───────────────────────────────────────────
  const [pinned,        setPinned]        = useState<(PinnedSlot | null)[]>([null, null, null, null, null])
  const [searchingSlot, setSearchingSlot] = useState<number | null>(null)
  const [searchQuery,   setSearchQuery]   = useState('')
  const [searchResults, setSearchResults] = useState<TmdbResult[]>([])
  const [searchBusy,    setSearchBusy]    = useState(false)

  // ── Tab state ──────────────────────────────────────────────────
  const [activeTab,      setActiveTab]      = useState<Tab>('perfil')
  const [recentReviews,  setRecentReviews]  = useState<ReviewItem[]>([])
  const [recentWatched,  setRecentWatched]  = useState<WatchedItem[]>([])
  const [allReviews,     setAllReviews]     = useState<ReviewItem[]>([])
  const [watchedItems,   setWatchedItems]   = useState<WatchedItem[]>([])
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([])
  const [likedReviews,   setLikedReviews]   = useState<LikedReview[]>([])

  // ── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [
        authRes, followersRes, followingRes,
        watchedCountRes, pinnedRes,
        recentRevRes, recentWatchedRes,
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
        supabase.from('watched').select('media_type').eq('user_id', profile.id),
        supabase.from('pinned_favorites').select('*').eq('user_id', profile.id).order('slot'),
        supabase.from('reviews')
          .select('id,media_id,media_type,title,poster_path,rating,body,recommended,created_at')
          .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('watched')
          .select('id,media_id,media_type,title,poster_path,watched_at')
          .eq('user_id', profile.id).order('watched_at', { ascending: false }).limit(10),
      ])

      const uid = authRes.data.user?.id ?? null
      setCurrentUserId(uid)
      setFollowersCount(followersRes.count ?? 0)
      setFollowingCount(followingRes.count ?? 0)

      const wdata = watchedCountRes.data ?? []
      setMoviesWatched(wdata.filter((w: { media_type: string }) => w.media_type === 'movie').length)
      setSeriesWatched(wdata.filter((w: { media_type: string }) => w.media_type === 'tv').length)

      // Pinned slots
      const slots: (PinnedSlot | null)[] = [null, null, null, null, null]
      for (const p of pinnedRes.data ?? []) {
        if (p.slot >= 1 && p.slot <= 5) slots[p.slot - 1] = p as PinnedSlot
      }
      setPinned(slots)
      setRecentReviews(recentRevRes.data ?? [])
      setRecentWatched(recentWatchedRes.data ?? [])

      // Follow state (only if logged in and viewing someone else's profile)
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

    if (activeTab === 'resenas') {
      supabase.from('reviews')
        .select('id,media_id,media_type,title,poster_path,rating,body,recommended,created_at')
        .eq('user_id', profile.id).order('created_at', { ascending: false })
        .then(({ data }) => setAllReviews(data ?? []))
    }
    if (activeTab === 'yavi') {
      supabase.from('watched')
        .select('id,media_id,media_type,title,poster_path,watched_at')
        .eq('user_id', profile.id).order('watched_at', { ascending: false })
        .then(({ data }) => setWatchedItems(data ?? []))
    }
    if (activeTab === 'paraVer') {
      supabase.from('watchlist')
        .select('id,media_id,media_type,title,poster_path,added_at')
        .eq('user_id', profile.id).order('added_at', { ascending: false })
        .then(({ data }) => setWatchlistItems(data ?? []))
    }
    if (activeTab === 'megusta') {
      loadLikedReviews()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  async function loadLikedReviews() {
    const { data: likes } = await supabase
      .from('review_likes').select('review_id').eq('user_id', profile.id)
    if (!likes?.length) { setLikedReviews([]); return }

    const { data: reviews } = await supabase
      .from('reviews').select('id,media_id,media_type,title,poster_path,rating,body,recommended,created_at,user_id')
      .in('id', likes.map((l: { review_id: string }) => l.review_id))
      .order('created_at', { ascending: false })
    if (!reviews?.length) { setLikedReviews([]); return }

    const authorIds = [...new Set(reviews.map((r: { user_id: string }) => r.user_id))]
    const { data: profiles } = await supabase
      .from('profiles').select('id,username,avatar_url').in('id', authorIds)
    const pmap = Object.fromEntries(
      (profiles ?? []).map((p: { id: string; username: string | null; avatar_url: string | null }) => [p.id, p])
    )
    setLikedReviews(reviews.map((r: ReviewItem & { user_id: string }) => ({
      ...r,
      author: pmap[r.user_id] ?? { username: null, avatar_url: null },
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

  // ── Pinned favorites search (debounced) ────────────────────────
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
      slot,
      media_id:    item.id,
      media_type:  item.media_type,
      title:       item.title ?? item.name ?? '',
      poster_path: item.poster_path ?? null,
    }
    await supabase.from('pinned_favorites').upsert(
      { user_id: profile.id, ...row },
      { onConflict: 'user_id,slot' }
    )
    setPinned(prev => { const n = [...prev]; n[slot - 1] = row; return n })
    setSearchingSlot(null)
    setSearchQuery('')
    setSearchResults([])
  }

  async function removePin(slot: number) {
    if (!currentUserId || currentUserId !== profile.id) return
    await supabase.from('pinned_favorites').delete().eq('user_id', profile.id).eq('slot', slot)
    setPinned(prev => { const n = [...prev]; n[slot - 1] = null; return n })
  }

  // ── Derived ────────────────────────────────────────────────────
  const isOwner     = currentUserId === profile.id
  const displayName = profile.display_name ?? profile.username ?? 'Usuario'

  const activityFeed = [
    ...recentReviews.map(r => ({ kind: 'review'  as const, date: r.created_at,  data: r as ReviewItem })),
    ...recentWatched.map(w => ({ kind: 'watched'  as const, date: w.watched_at, data: w as WatchedItem })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10)

  const hasPinned = pinned.some(p => p !== null)

  const TABS: { id: Tab; label: string }[] = [
    { id: 'perfil',  label: 'Perfil'   },
    { id: 'resenas', label: 'Reseñas'  },
    { id: 'yavi',    label: 'Ya vi'    },
    { id: 'paraVer', label: 'Para ver' },
    { id: 'megusta', label: 'Me gusta' },
  ]

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen">

      {/* ── Profile header ─────────────────────────────────────── */}
      <div className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">

            {/* Avatar */}
            <UserAvatar src={profile.avatar_url} name={displayName} size={96} />

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              {/* Name + badges + follow */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                <h1 className="text-2xl font-bold text-white">{displayName}</h1>
                {followsMe && (
                  <span className="text-xs bg-zinc-700 text-zinc-400 px-2.5 py-0.5 rounded-full border border-zinc-600">
                    Te sigue
                  </span>
                )}
                {/* Follow button — only shown once auth is resolved */}
                {currentUserId !== null && currentUserId !== profile.id && (
                  <button
                    onClick={toggleFollow}
                    disabled={followBusy}
                    className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-lg transition-colors ${
                      isFollowing
                        ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                        : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    }`}
                  >
                    {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
                    {isFollowing ? 'Siguiendo' : 'Seguir'}
                  </button>
                )}
                {currentUserId === null && (
                  <Link
                    href="/auth"
                    className="flex items-center gap-1.5 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 rounded-lg transition-colors"
                  >
                    <UserPlus size={14} /> Seguir
                  </Link>
                )}
              </div>

              <p className="text-zinc-500 text-sm mb-2">@{profile.username}</p>

              {profile.bio && (
                <p className="text-zinc-400 text-sm max-w-md mb-3 leading-relaxed">{profile.bio}</p>
              )}

              {/* Stats row */}
              <div className="flex flex-wrap justify-center sm:justify-start gap-x-6 gap-y-2 mt-1">
                {[
                  { label: 'Películas',  value: moviesWatched,  icon: Film },
                  { label: 'Series',     value: seriesWatched,  icon: Tv   },
                  { label: 'Siguiendo',  value: followingCount             },
                  { label: 'Seguidores', value: followersCount             },
                ].map(s => (
                  <div key={s.label} className="text-center sm:text-left">
                    <p className="text-xl font-bold text-white leading-none">{s.value}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────── */}
      <div className="bg-zinc-900/60 border-b border-zinc-800 sticky top-[57px] z-30">
        <div className="max-w-4xl mx-auto px-4 flex overflow-x-auto no-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-400 text-emerald-400'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* ── PERFIL ── */}
        {activeTab === 'perfil' && (
          <div className="space-y-10">

            {/* Películas favoritas */}
            {(hasPinned || isOwner) && (
              <section>
                <h2 className="text-base font-semibold text-zinc-300 uppercase tracking-wide mb-4">
                  Películas favoritas
                </h2>
                <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                  {pinned.map((item, idx) => {
                    const slot = idx + 1
                    return item ? (
                      // Filled slot
                      <div key={slot} className="relative shrink-0 group/pin">
                        <Link href={`/${item.media_type}/${item.media_id}`}>
                          <div className="relative w-28 sm:w-32 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800">
                            {item.poster_path ? (
                              <Image
                                src={getPosterUrl(item.poster_path, 'w342')}
                                alt={item.title}
                                fill
                                className="object-cover transition-transform duration-300 group-hover/pin:scale-105"
                                sizes="128px"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center px-2">
                                {item.title}
                              </div>
                            )}
                          </div>
                        </Link>
                        {/* Owner controls */}
                        {isOwner && (
                          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-black/50 opacity-0 group-hover/pin:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setSearchingSlot(slot); setSearchQuery('') }}
                              className="bg-zinc-900/90 hover:bg-zinc-700 text-white rounded-full p-1.5 transition-colors"
                              title="Cambiar"
                            >
                              <SearchIcon size={13} />
                            </button>
                            <button
                              onClick={() => removePin(slot)}
                              className="bg-zinc-900/90 hover:bg-red-600 text-white rounded-full p-1.5 transition-colors"
                              title="Quitar"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      // Empty slot
                      <div key={slot} className="shrink-0">
                        <div
                          className={`w-28 sm:w-32 aspect-[2/3] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors ${
                            isOwner
                              ? 'border-zinc-700 hover:border-emerald-500 cursor-pointer'
                              : 'border-zinc-800'
                          }`}
                          onClick={() => isOwner && setSearchingSlot(slot)}
                        >
                          {isOwner && (
                            <>
                              <Plus size={20} className="text-zinc-600" />
                              <span className="text-[11px] text-zinc-600">Agregar</span>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Actividad reciente */}
            <section>
              <h2 className="text-base font-semibold text-zinc-300 uppercase tracking-wide mb-4">
                Actividad reciente
              </h2>
              {activityFeed.length === 0 ? (
                <p className="text-zinc-600 text-sm">Sin actividad reciente.</p>
              ) : (
                <div className="space-y-4">
                  {activityFeed.map((entry, i) => {
                    if (entry.kind === 'review') {
                      const r = entry.data as ReviewItem
                      const href = `/${r.media_type}/${r.media_id}`
                      return (
                        <div key={`r-${r.id}`} className="flex gap-4">
                          <Link href={href} className="shrink-0">
                            <div className="relative w-11 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800">
                              {r.poster_path && (
                                <Image src={getPosterUrl(r.poster_path, 'w92')} alt={r.title} fill className="object-cover" sizes="44px" />
                              )}
                            </div>
                          </Link>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <MessageSquare size={11} className="text-emerald-400 shrink-0" />
                              <span className="text-xs text-zinc-500">Reseñó</span>
                              <Link href={href} className="text-sm font-medium text-white hover:text-emerald-400 transition-colors line-clamp-1">
                                {r.title}
                              </Link>
                            </div>
                            {r.rating && (
                              <div className="flex items-center gap-0.5 mb-1">
                                {[1, 2, 3, 4, 5].map(s => (
                                  <Star key={s} size={10} className="text-yellow-400" fill={s <= r.rating! ? 'currentColor' : 'none'} />
                                ))}
                              </div>
                            )}
                            {r.body && <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">{r.body}</p>}
                            <p className="text-[10px] text-zinc-700 mt-1">
                              {new Date(r.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                      )
                    }
                    // watched
                    const w = entry.data as WatchedItem
                    const href = `/${w.media_type}/${w.media_id}`
                    return (
                      <div key={`w-${w.id}-${i}`} className="flex gap-4">
                        <Link href={href} className="shrink-0">
                          <div className="relative w-11 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800">
                            {w.poster_path && (
                              <Image src={getPosterUrl(w.poster_path, 'w92')} alt={w.title} fill className="object-cover" sizes="44px" />
                            )}
                          </div>
                        </Link>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <CheckCircle size={11} className="text-emerald-400 shrink-0" />
                            <span className="text-xs text-zinc-500">Marcó como visto</span>
                          </div>
                          <Link href={href} className="text-sm font-medium text-white hover:text-emerald-400 transition-colors line-clamp-1 block">
                            {w.title}
                          </Link>
                          <p className="text-[10px] text-zinc-700 mt-1">
                            {new Date(w.watched_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── RESEÑAS ── */}
        {activeTab === 'resenas' && (
          allReviews.length === 0 ? (
            <div className="text-center py-20">
              <MessageSquare size={36} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-zinc-500 text-sm">Sin reseñas todavía.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {allReviews.map(r => <ReviewCard key={r.id} review={r} />)}
            </div>
          )
        )}

        {/* ── YA VI ── */}
        {activeTab === 'yavi' && (
          watchedItems.length === 0 ? (
            <div className="text-center py-20">
              <CheckCircle size={36} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-zinc-500 text-sm">Sin contenido visto todavía.</p>
            </div>
          ) : (
            <PosterGrid
              items={watchedItems}
              mediaIdKey="media_id"
              mediaTypeKey="media_type"
              posterKey="poster_path"
              titleKey="title"
            />
          )
        )}

        {/* ── PARA VER ── */}
        {activeTab === 'paraVer' && (
          watchlistItems.length === 0 ? (
            <div className="text-center py-20">
              <Bookmark size={36} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-zinc-500 text-sm">Lista de pendientes vacía.</p>
            </div>
          ) : (
            <PosterGrid
              items={watchlistItems}
              mediaIdKey="media_id"
              mediaTypeKey="media_type"
              posterKey="poster_path"
              titleKey="title"
            />
          )
        )}

        {/* ── ME GUSTA ── */}
        {activeTab === 'megusta' && (
          likedReviews.length === 0 ? (
            <div className="text-center py-20">
              <MessageSquare size={36} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-zinc-500 text-sm">Sin reseñas que le gusten todavía.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {likedReviews.map(r => <ReviewCard key={r.id} review={r} showAuthor />)}
            </div>
          )
        )}
      </div>

      {/* ── Pinned favorites search modal ──────────────────────── */}
      {searchingSlot !== null && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onClick={e => {
            if (e.target === e.currentTarget) {
              setSearchingSlot(null)
              setSearchQuery('')
              setSearchResults([])
            }
          }}
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Modal header */}
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

            {/* Search input */}
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-center gap-2 bg-zinc-800 rounded-xl px-3 py-2.5 border border-zinc-700 focus-within:border-emerald-500 transition-colors">
                <SearchIcon size={14} className="text-zinc-500 shrink-0" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar película o serie..."
                  className="bg-transparent text-sm text-white placeholder-zinc-500 outline-none flex-1 min-w-0"
                />
                {searchBusy && (
                  <div className="w-3.5 h-3.5 border border-zinc-500 border-t-emerald-400 rounded-full animate-spin shrink-0" />
                )}
              </div>
            </div>

            {/* Results */}
            <div className="px-4 pb-4 min-h-[120px]">
              {searchResults.length > 0 ? (
                <div className="grid grid-cols-4 gap-2.5 max-h-64 overflow-y-auto">
                  {searchResults.map(result => {
                    const label = result.title ?? result.name ?? ''
                    return (
                      <button
                        key={result.id}
                        onClick={() => savePin(searchingSlot!, result)}
                        className="group/res text-left"
                      >
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-1 ring-2 ring-transparent group-hover/res:ring-emerald-500 transition-all">
                          {result.poster_path ? (
                            <Image
                              src={getPosterUrl(result.poster_path, 'w185')}
                              alt={label}
                              fill
                              className="object-cover"
                              sizes="90px"
                            />
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
                <p className="text-zinc-500 text-sm text-center py-8">Sin resultados para &quot;{searchQuery}&quot;</p>
              ) : !searchQuery.trim() ? (
                <p className="text-zinc-600 text-sm text-center py-8">Escribí el título para buscar</p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
