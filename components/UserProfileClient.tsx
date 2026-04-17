'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  UserPlus, UserCheck, Star, Plus, X,
  Search as SearchIcon, CheckCircle,
  Pencil, Check,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { getPosterUrl } from '@/lib/tmdb'
import ReviewCard from '@/components/ReviewCard'

// ── Constants ──────────────────────────────────────────────────────────────

const VERIFIED_USERS = ['Ferlageok']

// ── Verified badge ─────────────────────────────────────────────────────────

function VerifiedBadge() {
  return (
    <span title="Cuenta verificada" className="inline-flex shrink-0 cursor-default">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="10" fill="#1D9BF0"/>
        <path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  )
}

// ── Social icons ───────────────────────────────────────────────────────────

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#F58529"/>
          <stop offset="50%" stopColor="#DD2A7B"/>
          <stop offset="100%" stopColor="#8134AF"/>
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="url(#ig-grad)" strokeWidth="2" fill="none"/>
      <circle cx="12" cy="12" r="4" stroke="url(#ig-grad)" strokeWidth="2" fill="none"/>
      <circle cx="17.5" cy="6.5" r="1" fill="url(#ig-grad)"/>
    </svg>
  )
}

function TikTokIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.35 6.35 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V9.02a8.28 8.28 0 0 0 4.84 1.54V7.12a4.85 4.85 0 0 1-1.07-.43z" fill="currentColor"/>
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.635L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
    </svg>
  )
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface PublicProfile {
  id: string
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  instagram_username?: string | null
  tiktok_username?: string | null
  x_username?: string | null
}

interface PinnedSlot {
  slot: number; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null
}

interface ReviewItem {
  id: string; user_id: string; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null
  rating: number | null; body: string | null; recommended: boolean
  created_at: string
  review_likes?: { user_id: string }[]
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

interface RatingItem {
  id: string; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null
  rating: number; rated_at: string
}

interface ActivityItem {
  kind: 'review' | 'rating'
  date: string
  data: ReviewItem | RatingItem
}

interface TmdbResult {
  id: number; media_type: 'movie' | 'tv'
  title?: string; name?: string; poster_path: string | null
}

type Tab = 'perfil' | 'yavi' | 'resenas' | 'paraVer' | 'stats'

interface StatsData {
  moviesMonth: number
  seriesMonth: number
  moviesYear: number
  seriesYear: number
}

interface PersonStat {
  id: number
  name: string
  profilePath: string | null
  count: number
}

interface RichStats {
  tooFew:       boolean
  totalMinutes: number
  minutesMonth: number
  minutesYear:  number
  topGenres:    { name: string; count: number }[]
  topActor:     PersonStat | null
  topActress:   PersonStat | null
  topDirector:  PersonStat | null
}

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

// ── Main component ─────────────────────────────────────────────────────────

export default function UserProfileClient({ profile }: { profile: PublicProfile }) {
  const supabase      = useRef(createClient()).current
  const loadedTabs    = useRef<Set<Tab>>(new Set(['perfil']))
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Local profile state (updates after inline edit) ────────────
  const [localProfile, setLocalProfile] = useState(profile)

  // ── Identity & follow ──────────────────────────────────────────
  const [currentUserId, setCurrentUserId] = useState<string | null | undefined>(undefined)
  const [isFollowing,   setIsFollowing]   = useState(false)
  const [followsMe,     setFollowsMe]     = useState(false)
  const [followBusy,    setFollowBusy]    = useState(false)

  // ── Stats ──────────────────────────────────────────────────────
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
  const [activeTab, setActiveTab] = useState<Tab>('perfil')

  // ── Data ───────────────────────────────────────────────────────
  const [recentActivity,   setRecentActivity]   = useState<ActivityItem[]>([])
  const [watchlistPreview, setWatchlistPreview] = useState<WatchlistItem[]>([])
  const [watchlistCount,   setWatchlistCount]   = useState(0)
  const [allWatched,       setAllWatched]       = useState<WatchedItem[]>([])
  const [allReviews,       setAllReviews]       = useState<ReviewItem[]>([])
  const [allWatchlist,     setAllWatchlist]     = useState<WatchlistItem[]>([])

  // ── Stats tab data ─────────────────────────────────────────────
  const [statsData,  setStatsData]  = useState<StatsData | null>(null)
  const [richStats,  setRichStats]  = useState<RichStats | null>(null)
  const [richBusy,   setRichBusy]   = useState(false)

  // ── Inline edit ────────────────────────────────────────────────
  const [isEditing,        setIsEditing]        = useState(false)
  const [editName,         setEditName]         = useState(profile.display_name ?? '')
  const [editBio,          setEditBio]          = useState(profile.bio ?? '')
  const [editUsername,     setEditUsername]     = useState(profile.username ?? '')
  const [editInstagram,    setEditInstagram]    = useState(profile.instagram_username ?? '')
  const [editTiktok,       setEditTiktok]       = useState(profile.tiktok_username ?? '')
  const [editX,            setEditX]            = useState(profile.x_username ?? '')
  const [usernameError,    setUsernameError]    = useState<string | null>(null)
  const [usernameChecking, setUsernameChecking] = useState(false)
  const [editSaving,       setEditSaving]       = useState(false)

  // ── Follow list modal ──────────────────────────────────────────
  const [followListMode,    setFollowListMode]    = useState<'followers' | 'following' | null>(null)
  const [followList,        setFollowList]        = useState<PublicProfile[]>([])
  const [followListBusy,    setFollowListBusy]    = useState(false)
  const [followingInList,   setFollowingInList]   = useState<Set<string>>(new Set())

  // ── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [
        authRes, followersRes, followingRes,
        moviesRes, seriesRes,
        pinnedRes, recentReviewsRes, recentRatingsRes,
        wlCountRes, wlPreviewRes,
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profile.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profile.id),
        supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', profile.id).eq('media_type', 'movie'),
        supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', profile.id).eq('media_type', 'tv'),
        supabase.from('pinned_favorites').select('*').eq('user_id', profile.id).order('slot'),
        supabase.from('reviews').select('id,user_id,media_id,media_type,title,poster_path,rating,body,recommended,created_at').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(8),
        supabase.from('ratings').select('id,media_id,media_type,title,poster_path,rating,rated_at').eq('user_id', profile.id).order('rated_at', { ascending: false }).limit(8),
        supabase.from('watchlist').select('*', { count: 'exact', head: true }).eq('user_id', profile.id),
        supabase.from('watchlist').select('id,media_id,media_type,title,poster_path,added_at').eq('user_id', profile.id).order('added_at', { ascending: false }).limit(6),
      ])

      // Log RLS errors to browser console for debugging
      if (followersRes.error)      console.error('[profile] follows (followers):', followersRes.error)
      if (followingRes.error)      console.error('[profile] follows (following):', followingRes.error)
      if (moviesRes.error)         console.error('[profile] watched movies:', moviesRes.error)
      if (seriesRes.error)         console.error('[profile] watched series:', seriesRes.error)
      if (recentReviewsRes.error)  console.error('[profile] recent reviews:', recentReviewsRes.error)
      if (recentRatingsRes.error)  console.error('[profile] recent ratings:', recentRatingsRes.error)
      if (wlCountRes.error)        console.error('[profile] watchlist count:', wlCountRes.error)
      if (wlPreviewRes.error)      console.error('[profile] watchlist preview:', wlPreviewRes.error)

      const uid = authRes.data.user?.id ?? null
      setCurrentUserId(uid)
      setFollowersCount(followersRes.count ?? 0)
      setFollowingCount(followingRes.count ?? 0)
      setMoviesWatched(moviesRes.count ?? 0)
      setSeriesWatched(seriesRes.count ?? 0)
      setWatchlistCount(wlCountRes.count ?? 0)
      setWatchlistPreview(wlPreviewRes.data ?? [])

      // Merge reviews + ratings, deduplicating by media_id:
      // If a review exists for a given media_id, the review card already shows
      // stars (review.rating) — skip any standalone rating for the same content.
      const reviews = (recentReviewsRes.data ?? []) as ReviewItem[]
      const ratings  = (recentRatingsRes.data ?? []) as RatingItem[]
      const reviewedIds = new Set(reviews.map(r => r.media_id))
      const standaloneRatings = ratings.filter(r => !reviewedIds.has(r.media_id))

      const acts: ActivityItem[] = [
        ...reviews.map(r => ({ kind: 'review' as const, date: r.created_at, data: r })),
        ...standaloneRatings.map(r => ({ kind: 'rating' as const, date: r.rated_at, data: r })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8)
      setRecentActivity(acts)

      const slots: (PinnedSlot | null)[] = [null, null, null, null, null]
      for (const p of pinnedRes.data ?? []) {
        if (p.slot >= 1 && p.slot <= 5) slots[p.slot - 1] = p as PinnedSlot
      }
      setPinned(slots)

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

    if (activeTab === 'yavi') {
      supabase.from('watched').select('id,media_id,media_type,title,poster_path,watched_at')
        .eq('user_id', profile.id).order('watched_at', { ascending: false })
        .then(({ data }) => setAllWatched(data ?? []))
    }
    if (activeTab === 'resenas') {
      supabase.from('reviews').select('id,user_id,media_id,media_type,title,poster_path,rating,body,recommended,created_at,review_likes(user_id)')
        .eq('user_id', profile.id).order('created_at', { ascending: false })
        .then(({ data }) => setAllReviews((data ?? []) as ReviewItem[]))
    }
    if (activeTab === 'paraVer') {
      supabase.from('watchlist').select('id,media_id,media_type,title,poster_path,added_at')
        .eq('user_id', profile.id).order('added_at', { ascending: false })
        .then(({ data }) => setAllWatchlist(data ?? []))
    }
    if (activeTab === 'stats') loadStats()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // ── Follow toggle ──────────────────────────────────────────────
  async function toggleFollow() {
    if (!currentUserId || currentUserId === profile.id || followBusy) return
    setFollowBusy(true)
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', profile.id)
      setIsFollowing(false)
      setFollowersCount(c => c - 1)
    } else {
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: currentUserId, following_id: profile.id })
      if (!error) {
        // Notify the followed user — done client-side since DB triggers are unavailable
        await supabase.from('notifications').insert({
          user_id:  profile.id,
          actor_id: currentUserId,
          type:     'follow',
        })
      }
      setIsFollowing(true)
      setFollowersCount(c => c + 1)
    }
    setFollowBusy(false)
  }

  // ── Inline profile edit ────────────────────────────────────────
  async function checkUsername(val: string) {
    const trimmed = val.trim()
    if (!trimmed || trimmed === profile.username) { setUsernameError(null); return }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(trimmed)) {
      setUsernameError('Solo letras, números y guión bajo (3-30 caracteres)')
      return
    }
    setUsernameChecking(true)
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', trimmed)
      .neq('id', profile.id)
      .maybeSingle()
    setUsernameChecking(false)
    setUsernameError(data ? 'Este nombre de usuario ya está en uso' : null)
  }

  async function saveProfile() {
    if (!currentUserId || currentUserId !== profile.id || editSaving) return
    if (usernameError) return
    setEditSaving(true)

    const newUsername  = editUsername.trim() || profile.username
    const display_name = editName.trim()     || null
    const bio          = editBio.trim()      || null
    const instagram_username = editInstagram.replace(/^@/, '').trim() || null
    const tiktok_username    = editTiktok.replace(/^@/, '').trim()    || null
    const x_username         = editX.replace(/^@/, '').trim()         || null

    await supabase.from('profiles').update({
      display_name,
      bio,
      username: newUsername,
      instagram_username,
      tiktok_username,
      x_username,
    }).eq('id', profile.id)

    setLocalProfile(p => ({
      ...p,
      display_name,
      bio,
      username: newUsername,
      instagram_username,
      tiktok_username,
      x_username,
    }))
    setEditSaving(false)
    setIsEditing(false)
  }

  // ── Follow list modal ─────────────────────────────────────────
  async function loadFollowList(mode: 'followers' | 'following') {
    setFollowListMode(mode)
    setFollowList([])
    setFollowingInList(new Set())
    setFollowListBusy(true)
    const isFollowers = mode === 'followers'
    const { data: rows } = await supabase
      .from('follows')
      .select(isFollowers ? 'follower_id' : 'following_id')
      .eq(isFollowers ? 'following_id' : 'follower_id', profile.id)
    const ids: string[] = (rows ?? []).map(
      (r: Record<string, string>) => isFollowers ? r.follower_id : r.following_id
    )
    if (ids.length === 0) { setFollowListBusy(false); return }
    const [profilesRes, followingRes] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', ids),
      currentUserId
        ? supabase.from('follows').select('following_id').eq('follower_id', currentUserId).in('following_id', ids)
        : Promise.resolve({ data: [] as { following_id: string }[] }),
    ])
    setFollowList((profilesRes.data ?? []) as PublicProfile[])
    setFollowingInList(new Set(
      (followingRes.data ?? []).map((r: { following_id: string }) => r.following_id)
    ))
    setFollowListBusy(false)
  }

  async function toggleFollowInList(targetId: string) {
    if (!currentUserId || currentUserId === targetId) return
    const nowFollowing = followingInList.has(targetId)
    setFollowingInList(prev => {
      const next = new Set(prev)
      nowFollowing ? next.delete(targetId) : next.add(targetId)
      return next
    })
    if (nowFollowing) {
      await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', targetId)
    } else {
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: currentUserId, following_id: targetId })
      if (!error) {
        await supabase.from('notifications').insert({
          user_id:  targetId,
          actor_id: currentUserId,
          type:     'follow',
        })
      }
    }
  }

  // ── Review like toggle (Reseñas tab) ──────────────────────────
  async function toggleReviewLike(reviewId: string) {
    if (!currentUserId) return
    const review = allReviews.find(r => r.id === reviewId)
    if (!review) return
    const liked = review.review_likes?.some(l => l.user_id === currentUserId) ?? false
    if (liked) {
      await supabase.from('review_likes').delete().eq('review_id', reviewId).eq('user_id', currentUserId)
      setAllReviews(prev => prev.map(r =>
        r.id === reviewId
          ? { ...r, review_likes: (r.review_likes ?? []).filter(l => l.user_id !== currentUserId) }
          : r
      ))
    } else {
      await supabase.from('review_likes').insert({ review_id: reviewId, user_id: currentUserId })
      setAllReviews(prev => prev.map(r =>
        r.id === reviewId
          ? { ...r, review_likes: [...(r.review_likes ?? []), { user_id: currentUserId }] }
          : r
      ))
    }
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

  // ── Stats load ────────────────────────────────────────────────
  async function loadStats() {
    const now       = new Date()
    const thisYear  = now.getFullYear()
    const thisMonth = `${thisYear}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const [mMonth, sMonth, mYear, sYear] = await Promise.all([
      supabase.from('watched').select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id).eq('media_type', 'movie').gte('watched_at', thisMonth),
      supabase.from('watched').select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id).eq('media_type', 'tv').gte('watched_at', thisMonth),
      supabase.from('watched').select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id).eq('media_type', 'movie').gte('watched_at', `${thisYear}-01-01`),
      supabase.from('watched').select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id).eq('media_type', 'tv').gte('watched_at', `${thisYear}-01-01`),
    ])

    setStatsData({
      moviesMonth: mMonth.count ?? 0,
      seriesMonth: sMonth.count ?? 0,
      moviesYear:  mYear.count  ?? 0,
      seriesYear:  sYear.count  ?? 0,
    })

    // ── Rich stats (genres, hours, people) — heavier, separate state ───
    setRichBusy(true)
    try {
      const res  = await fetch(`/api/user-stats?userId=${profile.id}`)
      const data = await res.json() as RichStats
      setRichStats(data)
    } catch {
      // ignore — rich stats section won't render
    } finally {
      setRichBusy(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────
  const isOwner     = currentUserId === profile.id
  const displayName = localProfile.display_name ?? localProfile.username ?? 'Usuario'
  const hasPinned   = pinned.some(Boolean)

  const TABS: { id: Tab; label: string }[] = [
    { id: 'perfil',  label: 'Perfil'       },
    { id: 'yavi',    label: 'Ya vi'        },
    { id: 'resenas', label: 'Reseñas'      },
    { id: 'paraVer', label: 'Para ver'     },
    ...(isOwner ? [{ id: 'stats' as Tab, label: 'Estadísticas' }] : []),
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
                {localProfile.avatar_url ? (
                  <Image src={localProfile.avatar_url} alt={displayName} width={112} height={112} className="w-full h-full object-cover" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-zinc-500">
                    {displayName[0]?.toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 text-center sm:text-left">

              {/* Name + badge row */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{displayName}</h1>
                {localProfile.username && VERIFIED_USERS.includes(localProfile.username) && (
                  <VerifiedBadge />
                )}
                {followsMe && (
                  <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-2.5 py-1 rounded-full">
                    Te sigue
                  </span>
                )}
              </div>

              <p className="text-zinc-500 text-sm mb-3">@{localProfile.username}</p>

              {localProfile.bio && (
                <p className="text-zinc-400 text-sm leading-relaxed max-w-lg mb-4">{localProfile.bio}</p>
              )}

              {/* Social links */}
              {(localProfile.instagram_username || localProfile.tiktok_username || localProfile.x_username) && (
                <div className="flex items-center justify-center sm:justify-start gap-3 mb-4">
                  {localProfile.instagram_username && (
                    <a
                      href={`https://instagram.com/${localProfile.instagram_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`@${localProfile.instagram_username} en Instagram`}
                      className="text-zinc-400 hover:text-white transition-colors"
                    >
                      <InstagramIcon />
                    </a>
                  )}
                  {localProfile.tiktok_username && (
                    <a
                      href={`https://tiktok.com/@${localProfile.tiktok_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`@${localProfile.tiktok_username} en TikTok`}
                      className="text-zinc-400 hover:text-white transition-colors"
                    >
                      <TikTokIcon />
                    </a>
                  )}
                  {localProfile.x_username && (
                    <a
                      href={`https://x.com/${localProfile.x_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`@${localProfile.x_username} en X`}
                      className="text-zinc-400 hover:text-white transition-colors"
                    >
                      <XIcon />
                    </a>
                  )}
                </div>
              )}

              {/* Stats */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-2 mb-5">
                {[
                  { value: moviesWatched,  label: 'Películas',  onClick: undefined },
                  { value: seriesWatched,  label: 'Series',     onClick: undefined },
                  { value: followingCount, label: 'Siguiendo',  onClick: () => loadFollowList('following') },
                  { value: followersCount, label: 'Seguidores', onClick: () => loadFollowList('followers') },
                ].map((s, i) => (
                  <div key={s.label} className="flex items-center gap-6">
                    {i > 0 && <span className="text-zinc-700 hidden sm:block select-none">·</span>}
                    {s.onClick ? (
                      <button onClick={s.onClick} className="text-center sm:text-left group cursor-pointer">
                        <p className="text-xl font-bold text-white leading-none group-hover:text-emerald-400 transition-colors">{s.value}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5 uppercase tracking-wide group-hover:text-zinc-400 transition-colors">{s.label}</p>
                      </button>
                    ) : (
                      <div className="text-center sm:text-left">
                        <p className="text-xl font-bold text-white leading-none">{s.value}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5 uppercase tracking-wide">{s.label}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Action button */}
              {currentUserId === undefined ? null : isOwner ? (
                <button
                  onClick={() => {
                    setEditName(localProfile.display_name ?? '')
                    setEditBio(localProfile.bio ?? '')
                    setEditUsername(localProfile.username ?? '')
                    setEditInstagram(localProfile.instagram_username ?? '')
                    setEditTiktok(localProfile.tiktok_username ?? '')
                    setEditX(localProfile.x_username ?? '')
                    setUsernameError(null)
                    setIsEditing(true)
                  }}
                  className="inline-flex items-center gap-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white px-4 py-2 rounded-lg transition-colors"
                >
                  <Pencil size={13} /> Editar perfil
                </button>
              ) : currentUserId ? (
                <button
                  onClick={toggleFollow}
                  disabled={followBusy}
                  className={`inline-flex items-center gap-2 text-sm font-medium px-5 py-2 rounded-lg transition-colors ${
                    isFollowing
                      ? 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  }`}
                >
                  {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
                  {isFollowing ? 'Siguiendo' : 'Seguir'}
                </button>
              ) : (
                <Link href="/auth" className="inline-flex items-center gap-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg transition-colors">
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
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
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
                  {recentActivity.length > 0 && (
                    <button
                      onClick={() => setActiveTab('resenas')}
                      className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors"
                    >
                      Ver reseñas →
                    </button>
                  )}
                </div>
                {recentActivity.length === 0 ? (
                  <p className="text-zinc-600 text-sm">Sin actividad reciente.</p>
                ) : (
                  <div className="divide-y divide-zinc-800/60">
                    {recentActivity.map((item, i) => {
                      const d    = item.data
                      const href = item.kind === 'review' ? `/review/${d.id}` : `/${d.media_type}/${d.media_id}`
                      const date = new Date(item.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
                      return (
                        <div key={`${item.kind}-${d.id}-${i}`} className="flex items-start gap-3 py-3">
                          {/* Poster */}
                          <Link href={href} className="shrink-0">
                            <div className="relative w-10 aspect-[2/3] rounded overflow-hidden bg-zinc-800">
                              {d.poster_path && (
                                <Image src={getPosterUrl(d.poster_path, 'w92')} alt={d.title} fill className="object-cover" sizes="40px" />
                              )}
                            </div>
                          </Link>
                          {/* Info */}
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-start justify-between gap-2">
                              <Link href={href} className="text-sm font-medium text-white hover:text-emerald-400 transition-colors line-clamp-1">
                                {d.title}
                              </Link>
                              <span className="text-[11px] text-zinc-600 shrink-0">{date}</span>
                            </div>
                            {/* Kind badge + stars row */}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                item.kind === 'review'
                                  ? 'bg-emerald-900/40 text-emerald-400'
                                  : 'bg-yellow-900/40 text-yellow-400'
                              }`}>
                                {item.kind === 'review' ? 'Reseña' : 'Valoración'}
                              </span>
                              {d.rating != null && (
                                <div className="flex items-center gap-0.5">
                                  {[1,2,3,4,5].map(s => (
                                    <Star key={s} size={10} className="text-yellow-400" fill={s <= d.rating! ? 'currentColor' : 'none'} />
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Review excerpt */}
                            {item.kind === 'review' && (item.data as ReviewItem).body && (
                              <p className="text-xs text-zinc-500 line-clamp-2 mt-1 leading-relaxed">
                                {(item.data as ReviewItem).body}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* Sidebar */}
            <aside className="space-y-8">
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

        {/* ── YA VI ── */}
        {activeTab === 'yavi' && (
          allWatched.length === 0 ? (
            <EmptyCard>Sin contenido visto todavía.</EmptyCard>
          ) : (
            <>
              <p className="text-xs text-zinc-600 mb-4">{allWatched.length} título{allWatched.length !== 1 ? 's' : ''}</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
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
            <div className="space-y-4">
              {allReviews.map(r => (
                <ReviewCard
                  key={r.id}
                  id={r.id}
                  authorId={profile.id}
                  authorUsername={localProfile.username ?? 'Usuario'}
                  authorDisplayName={localProfile.display_name}
                  authorAvatarUrl={localProfile.avatar_url}
                  mediaId={r.media_id}
                  mediaType={r.media_type}
                  mediaTitle={r.title}
                  mediaPosterPath={r.poster_path}
                  rating={r.rating}
                  recommended={r.recommended}
                  body={r.body}
                  date={r.created_at}
                  likeCount={r.review_likes?.length ?? 0}
                  likedByCurrentUser={r.review_likes?.some(l => l.user_id === currentUserId) ?? false}
                  isOwn={isOwner}
                  currentUserId={currentUserId ?? null}
                  onLike={() => toggleReviewLike(r.id)}
                />
              ))}
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
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                {allWatchlist.map(w => (
                  <PosterLink key={w.id} mediaId={w.media_id} mediaType={w.media_type} posterPath={w.poster_path} title={w.title} />
                ))}
              </div>
            </>
          )
        )}

        {/* ── ESTADÍSTICAS ── */}
        {activeTab === 'stats' && (
          <div className="max-w-2xl">
            {statsData === null ? (
              <div className="flex justify-center py-20">
                <div className="w-7 h-7 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-8">

                {/* ── Period breakdown ────────────────────────────── */}
                <div>
                  <SectionLabel>Contenido visto</SectionLabel>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      {
                        label:   'Este mes',
                        movies:  statsData.moviesMonth,
                        series:  statsData.seriesMonth,
                        minutes: richStats?.minutesMonth,
                      },
                      {
                        label:   'Este año',
                        movies:  statsData.moviesYear,
                        series:  statsData.seriesYear,
                        minutes: richStats?.minutesYear,
                      },
                      {
                        label:   'Total',
                        movies:  moviesWatched,
                        series:  seriesWatched,
                        minutes: richStats?.totalMinutes,
                      },
                    ].map(period => (
                      <div key={period.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                        <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-zinc-500 mb-3">{period.label}</p>
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400">Películas</span>
                            <span className="text-lg font-bold text-white">{period.movies}</span>
                          </div>
                          <div className="w-full bg-zinc-800 rounded-full h-1">
                            <div
                              className="bg-emerald-500 h-1 rounded-full transition-all"
                              style={{ width: period.movies + period.series > 0 ? `${(period.movies / (period.movies + period.series)) * 100}%` : '0%' }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-400">Series</span>
                            <span className="text-lg font-bold text-white">{period.series}</span>
                          </div>
                          <div className="w-full bg-zinc-800 rounded-full h-1">
                            <div
                              className="bg-sky-500 h-1 rounded-full transition-all"
                              style={{ width: period.movies + period.series > 0 ? `${(period.series / (period.movies + period.series)) * 100}%` : '0%' }}
                            />
                          </div>
                          <p className="text-xs text-zinc-600 pt-0.5 border-t border-zinc-800">
                            {period.movies + period.series} total
                          </p>
                          {/* Hours — show only once richStats loaded */}
                          {period.minutes !== undefined && period.minutes > 0 && (
                            <p className="text-[11px] text-zinc-500">
                              {Math.floor(period.minutes / 60)}h {period.minutes % 60}min
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Rich stats ──────────────────────────────────── */}
                {richBusy && (
                  <div className="flex items-center gap-3 text-zinc-500 text-sm py-4">
                    <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    Calculando estadísticas…
                  </div>
                )}

                {!richBusy && richStats && !richStats.tooFew && (
                  <>
                    {/* ── Horas vistas ──────────────────────────── */}
                    {richStats.totalMinutes > 0 && (
                      <div>
                        <SectionLabel>Horas vistas en total</SectionLabel>
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex items-end gap-3">
                          <span className="text-5xl font-black text-white leading-none">
                            {Math.floor(richStats.totalMinutes / 60)}
                            <span className="text-2xl font-bold text-emerald-400 ml-1">h</span>
                          </span>
                          <span className="text-2xl font-bold text-zinc-400 leading-none mb-0.5">
                            {richStats.totalMinutes % 60}
                            <span className="text-base font-semibold ml-1">min</span>
                          </span>
                        </div>
                      </div>
                    )}

                    {/* ── Géneros más vistos ────────────────────── */}
                    {richStats.topGenres.length > 0 && (
                      <div>
                        <SectionLabel>Géneros más vistos</SectionLabel>
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
                          {richStats.topGenres.map((g, i) => {
                            const max = richStats.topGenres[0].count
                            const pct = Math.round((g.count / max) * 100)
                            return (
                              <div key={g.name}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-sm font-medium text-white">
                                    {i === 0 && <span className="text-emerald-400 mr-1.5">▲</span>}
                                    {g.name}
                                  </span>
                                  <span className="text-xs text-zinc-500">{g.count} título{g.count !== 1 ? 's' : ''}</span>
                                </div>
                                <div className="w-full bg-zinc-800 rounded-full h-1.5">
                                  <div
                                    className="bg-emerald-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Personas favoritas ────────────────────── */}
                    {(richStats.topActor || richStats.topActress || richStats.topDirector) && (
                      <div>
                        <SectionLabel>Personas favoritas</SectionLabel>
                        <div className="space-y-3">
                          {(
                            [
                              { label: 'Actor favorito',    person: richStats.topActor    },
                              { label: 'Actriz favorita',   person: richStats.topActress  },
                              { label: 'Director favorito', person: richStats.topDirector },
                            ] as { label: string; person: PersonStat | null }[]
                          ).filter(row => row.person !== null).map(({ label, person }) => (
                            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                              {/* Circular photo */}
                              <div className="shrink-0 w-14 h-14 rounded-full overflow-hidden bg-zinc-700">
                                {person!.profilePath ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={`https://image.tmdb.org/t/p/w185${person!.profilePath}`}
                                    alt={person!.name}
                                    className="w-full h-full object-cover object-top"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xl font-bold text-zinc-500">
                                    {person!.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-zinc-500 mb-0.5">{label}</p>
                                <p className="text-base font-bold text-white truncate">{person!.name}</p>
                                <p className="text-xs text-zinc-400 mt-0.5">
                                  Apareció en {person!.count} título{person!.count !== 1 ? 's' : ''} que viste
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!richBusy && richStats?.tooFew && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
                    <p className="text-zinc-400 text-sm">
                      Mirá más contenido para ver tus estadísticas detalladas.
                    </p>
                  </div>
                )}

              </div>
            )}
          </div>
        )}
      </div>

      {/* ── FOLLOW LIST MODAL ─────────────────────────────────── */}
      {followListMode && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setFollowListMode(null) }}
        >
          <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
              <p className="text-sm font-semibold text-white">
                {followListMode === 'followers' ? 'Seguidores' : 'Siguiendo'}
              </p>
              <button onClick={() => setFollowListMode(null)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-3 py-3">
              {followListBusy ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : followList.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-10">
                  Sin {followListMode === 'followers' ? 'seguidores' : 'seguidos'} todavía.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {followList.map(u => {
                    const name    = u.display_name ?? u.username ?? 'Usuario'
                    const isMe    = currentUserId === u.id
                    const isFwg   = followingInList.has(u.id)
                    return (
                      <div key={u.id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors">
                        <Link href={`/usuario/${u.username}`} onClick={() => setFollowListMode(null)} className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                            {u.avatar_url ? (
                              <Image src={u.avatar_url} alt={name} width={36} height={36} className="w-full h-full object-cover" unoptimized />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-500">
                                {name[0]?.toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{name}</p>
                            <p className="text-xs text-zinc-500 truncate">@{u.username}</p>
                          </div>
                        </Link>
                        {!isMe && currentUserId && (
                          <button
                            onClick={() => toggleFollowInList(u.id)}
                            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                              isFwg
                                ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                                : 'bg-emerald-500 hover:bg-emerald-600 text-white'
                            }`}
                          >
                            {isFwg ? 'Siguiendo' : 'Seguir'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── INLINE EDIT MODAL ──────────────────────────────────── */}
      {isEditing && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setIsEditing(false) }}
        >
          <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <p className="text-sm font-semibold text-white">Editar perfil</p>
              <button onClick={() => setIsEditing(false)} className="text-zinc-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Username */}
              <div>
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Nombre de usuario (@)
                </label>
                <div className="relative">
                  <input
                    value={editUsername}
                    onChange={e => { setEditUsername(e.target.value); setUsernameError(null) }}
                    onBlur={() => checkUsername(editUsername)}
                    placeholder="tu_usuario"
                    maxLength={30}
                    className={`w-full bg-zinc-800 border rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors ${
                      usernameError ? 'border-red-500' : 'border-zinc-700 focus:border-emerald-500'
                    }`}
                  />
                  {usernameChecking && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border border-zinc-500 border-t-emerald-400 rounded-full animate-spin" />
                  )}
                </div>
                {usernameError && (
                  <p className="text-[11px] text-red-400 mt-1">{usernameError}</p>
                )}
              </div>

              {/* Display name */}
              <div>
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Nombre a mostrar
                </label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder={localProfile.username ?? 'Tu nombre'}
                  maxLength={50}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider block mb-1.5">
                  Bio
                </label>
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  placeholder="Contá algo sobre vos..."
                  maxLength={200}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors resize-none"
                />
                <p className="text-[11px] text-zinc-600 text-right mt-1">{editBio.length}/200</p>
              </div>

              {/* Social divider */}
              <div className="border-t border-zinc-800 pt-1">
                <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Redes sociales</p>

                {/* Instagram */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0"><InstagramIcon /></span>
                    <input
                      value={editInstagram}
                      onChange={e => setEditInstagram(e.target.value)}
                      placeholder="@usuario"
                      maxLength={60}
                      className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
                    />
                  </div>

                  {/* TikTok */}
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-white"><TikTokIcon /></span>
                    <input
                      value={editTiktok}
                      onChange={e => setEditTiktok(e.target.value)}
                      placeholder="@usuario"
                      maxLength={60}
                      className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
                    />
                  </div>

                  {/* X */}
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-white"><XIcon /></span>
                    <input
                      value={editX}
                      onChange={e => setEditX(e.target.value)}
                      placeholder="@usuario"
                      maxLength={60}
                      className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 flex justify-end gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={() => setIsEditing(false)}
                className="text-sm text-zinc-400 hover:text-white px-4 py-2 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveProfile}
                disabled={editSaving || !!usernameError || usernameChecking}
                className="inline-flex items-center gap-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg transition-colors"
              >
                {editSaving
                  ? <div className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
                  : <Check size={14} />
                }
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

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
