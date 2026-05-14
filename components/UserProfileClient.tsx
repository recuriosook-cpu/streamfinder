'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  UserPlus, UserCheck, Plus, X,
  Search as SearchIcon, CheckCircle,
  Pencil, Check, Share2, Ban,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useBlockedUsers } from '@/lib/use-blocked-users'
import { getPosterUrl } from '@/lib/tmdb'
import { addPoints, getLevelInfo } from '@/lib/points'
import { sendNotification } from '@/lib/notify'
import { usePushPrompt } from '@/lib/use-push-prompt'
import ReviewCard from '@/components/ReviewCard'
import StarDisplay from '@/components/StarDisplay'

// ── Social icons ───────────────────────────────────────────────────────────

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" fill="none"/>
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>
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
  username_changed_at?: string | null
  points?: number | null
  level?: number | null
}

interface PinnedSlot {
  slot: number; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null
}

interface ReviewItem {
  id: string; user_id: string; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null
  rating: number | null; body: string | null; recommended: boolean; has_spoiler: boolean
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

interface FavoriteItem {
  id: string; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null; created_at: string
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

type Tab = 'perfil' | 'yavi' | 'resenas' | 'listas' | 'paraVer' | 'favoritos' | 'stats'

interface StatsData {
  moviesMonth: number
  seriesMonth: number
  moviesYear: number
  seriesYear: number
}

interface MonthlyData    { month: string; year: number; count: number }
interface FavPlatform    { name: string; logoPath: string; count: number }
interface ExtRating      { title: string; posterPath: string | null; rating: number; mediaId: number; mediaType: string }
interface TopInteractor  { userId: string; username: string | null; displayName: string | null; avatarUrl: string | null; count: number }

interface PersonStat {
  id: number
  name: string
  profilePath: string | null
  count: number
}

interface RichStats {
  tooFew:        boolean
  totalMinutes:  number
  minutesMonth:  number
  minutesYear:   number
  topGenres:     { name: string; count: number }[]
  topDecades:    { decade: string; count: number }[]
  topLanguages:  { name: string; count: number; pct: number }[]
  topActor:      PersonStat | null
  topActress:    PersonStat | null
  topDirector:   PersonStat | null
}

// ── Design helpers ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#A0A0B0] mb-3">
      {children}
    </p>
  )
}

function EmptyCard({
  children, icon, actionLabel, actionHref,
}: {
  children: React.ReactNode; icon?: string; actionLabel?: string; actionHref?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
      {icon && <div className="text-6xl select-none">{icon}</div>}
      <p className="text-zinc-500 text-sm max-w-xs leading-relaxed">{children}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="text-sm font-semibold text-black bg-[#FFFD02] hover:bg-[#E5EB00] px-5 py-2.5 rounded-full transition-colors"
        >
          {actionLabel} →
        </Link>
      )}
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
      <div className={`relative ${width} aspect-[2/3] rounded-md overflow-hidden bg-[#1C1C27]`}>
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
  const fileInputRef  = useRef<HTMLInputElement>(null)

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

  // ── Ya vi filters ──────────────────────────────────────────────
  const [watchedFilter,  setWatchedFilter]  = useState<'all' | 'movie' | 'tv'>('all')
  const [watchedSort,    setWatchedSort]    = useState<'recent' | 'name' | 'rated'>('recent')
  const [watchedRatings, setWatchedRatings] = useState<Map<string, number>>(new Map())

  // ── Data ───────────────────────────────────────────────────────
  const [recentActivity,   setRecentActivity]   = useState<ActivityItem[]>([])
  const [watchlistPreview, setWatchlistPreview] = useState<WatchlistItem[]>([])
  const [watchlistCount,   setWatchlistCount]   = useState(0)
  const [allWatched,       setAllWatched]       = useState<WatchedItem[]>([])
  const [allReviews,       setAllReviews]       = useState<ReviewItem[]>([])
  const [allWatchlist,     setAllWatchlist]     = useState<WatchlistItem[]>([])
  const [allFavorites,     setAllFavorites]     = useState<FavoriteItem[]>([])
  const [userLists,        setUserLists]        = useState<{ id: string; title: string; itemCount: number; likeCount: number; previews: (string | null)[] }[]>([])

  // ── Stats tab data ─────────────────────────────────────────────
  const [statsData,    setStatsData]    = useState<StatsData | null>(null)
  const [richStats,    setRichStats]    = useState<RichStats | null>(null)
  const [richBusy,     setRichBusy]     = useState(false)
  const [weeklyMinutes, setWeeklyMinutes] = useState(0)
  const [sharedToast,  setSharedToast]  = useState<string | null>(null)
  // Extended stats
  const [monthlyData,    setMonthlyData]    = useState<MonthlyData[]>([])
  const [favPlatform,    setFavPlatform]    = useState<FavPlatform | null>(null)
  const [extTopRating,   setExtTopRating]   = useState<ExtRating | null>(null)
  const [extLowRating,   setExtLowRating]   = useState<ExtRating | null>(null)
  const [topInteractors, setTopInteractors] = useState<TopInteractor[]>([])

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
  const [avatarFile,       setAvatarFile]       = useState<File | null>(null)
  const [avatarPreview,    setAvatarPreview]    = useState<string | null>(null)

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
        supabase.from('reviews').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(8),
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
        .range(0, 9999)
        .then(({ data }) => setAllWatched(data ?? []))
      supabase.from('ratings').select('media_id,media_type,rating')
        .eq('user_id', profile.id)
        .range(0, 9999)
        .then(({ data }) => {
          setWatchedRatings(new Map(
            (data ?? []).map((r: { media_id: number; media_type: string; rating: number }) =>
              [`${r.media_type}:${r.media_id}`, r.rating]
            )
          ))
        })
    }
    if (activeTab === 'resenas') {
      supabase.from('reviews').select('*, review_likes(user_id)')
        .eq('user_id', profile.id).order('created_at', { ascending: false })
        .range(0, 9999)
        .then(({ data }) => setAllReviews((data ?? []) as ReviewItem[]))
    }
    if (activeTab === 'paraVer') {
      supabase.from('watchlist').select('id,media_id,media_type,title,poster_path,added_at')
        .eq('user_id', profile.id).order('added_at', { ascending: false })
        .range(0, 9999)
        .then(({ data }) => setAllWatchlist(data ?? []))
    }
    if (activeTab === 'favoritos') {
      supabase.from('favorites').select('id,media_id,media_type,title,poster_path,created_at')
        .eq('user_id', profile.id).order('created_at', { ascending: false })
        .range(0, 9999)
        .then(({ data }) => setAllFavorites(data ?? []))
    }
    if (activeTab === 'listas') {
      supabase.from('lists')
        .select('id,title')
        .eq('user_id', profile.id)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .then(async ({ data: rawLists }) => {
          if (!rawLists?.length) { setUserLists([]); return }
          const ids = rawLists.map(l => l.id)
          const [likesRes, itemsRes] = await Promise.all([
            supabase.from('list_likes').select('list_id').in('list_id', ids),
            supabase.from('list_items').select('list_id,poster_path').in('list_id', ids).order('position').limit(200),
          ])
          const likesByList: Record<string, number> = {}
          for (const l of (likesRes.data ?? [])) likesByList[l.list_id] = (likesByList[l.list_id] ?? 0) + 1
          const itemsByList: Record<string, { poster_path: string | null }[]> = {}
          for (const i of (itemsRes.data ?? [])) {
            itemsByList[i.list_id] = itemsByList[i.list_id] ?? []
            itemsByList[i.list_id].push(i)
          }
          setUserLists(rawLists.map(l => ({
            id: l.id, title: l.title,
            likeCount: likesByList[l.id] ?? 0,
            itemCount: (itemsByList[l.id] ?? []).length,
            previews: (itemsByList[l.id] ?? []).slice(0, 4).map(i => i.poster_path),
          })))
        })
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
        addPoints(currentUserId, 1)      // follower gains 1 pt for following
        addPoints(profile.id, 3)         // followed user gains 3 pts
        // Notify the followed user — done client-side since DB triggers are unavailable
        await sendNotification(supabase as Parameters<typeof sendNotification>[0], {
          user_id:  profile.id,
          actor_id: currentUserId,
          type:     'follow',
        })
        // Prompt for push after first follow action (fire-and-forget)
        promptForPush()
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
    // Rate limit: once per 30 days
    if (profile.username_changed_at) {
      const nextAvailable = new Date(new Date(profile.username_changed_at).getTime() + 30 * 24 * 60 * 60 * 1000)
      if (new Date() < nextAvailable) {
        const formatted = nextAvailable.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
        setUsernameError(`Solo podés cambiar tu @ una vez por mes. Próximo cambio disponible el ${formatted}`)
        return
      }
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
    const usernameChanged    = newUsername !== profile.username

    // Avatar upload — separate call as per spec
    let newAvatarUrl = localProfile.avatar_url
    if (avatarFile) {
      const extension = avatarFile.name.split('.').pop() ?? 'jpg'
      const { error } = await supabase.storage
        .from('avatars')
        .upload(`${currentUserId}/avatar.${extension}`, avatarFile, { upsert: true })
      if (error) {
        console.error('[avatar upload]', error)
      } else {
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(`${currentUserId}/avatar.${extension}`)
        newAvatarUrl = publicUrl + '?t=' + Date.now()
        await supabase.from('profiles').update({ avatar_url: newAvatarUrl }).eq('id', profile.id)
      }
    }

    // Main profile update
    await supabase.from('profiles').update({
      display_name,
      bio,
      username: newUsername,
      instagram_username,
      tiktok_username,
      x_username,
      ...(usernameChanged ? { username_changed_at: new Date().toISOString() } : {}),
    }).eq('id', profile.id)

    setLocalProfile(p => ({
      ...p,
      display_name,
      bio,
      username: newUsername,
      instagram_username,
      tiktok_username,
      x_username,
      avatar_url: newAvatarUrl,
    }))
    setAvatarFile(null)
    setAvatarPreview(null)
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
        await sendNotification(supabase as Parameters<typeof sendNotification>[0], {
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

    // ── Weekly minutes ─────────────────────────────────────────────
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    supabase
      .from('watched')
      .select('runtime')
      .eq('user_id', profile.id)
      .gte('watched_at', weekAgo)
      .range(0, 9999)
      .then(({ data }) => {
        const mins = (data ?? []).reduce((acc: number, r: { runtime: number | null }) => acc + (r.runtime ?? 0), 0)
        setWeeklyMinutes(mins)
      })

    // ── Monthly activity (last 12 months) ─────────────────────────
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)
    twelveMonthsAgo.setDate(1)
    const { data: watchedDates } = await supabase
      .from('watched')
      .select('watched_at')
      .eq('user_id', profile.id)
      .gte('watched_at', twelveMonthsAgo.toISOString())
      .range(0, 9999)
    const monthly = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(); d.setMonth(d.getMonth() - (11 - i))
      const m = d.getMonth(); const y = d.getFullYear()
      return {
        month: d.toLocaleString('es-AR', { month: 'short' }),
        year: y,
        count: (watchedDates ?? []).filter((w: { watched_at: string }) => {
          const wd = new Date(w.watched_at)
          return wd.getMonth() === m && wd.getFullYear() === y
        }).length,
      }
    })
    setMonthlyData(monthly)

    // ── Best / worst rated ──────────────────────────────────────────
    const { data: ratingsData } = await supabase
      .from('ratings')
      .select('media_id, media_type, title, poster_path, rating')
      .eq('user_id', profile.id)
      .order('rating', { ascending: false })
      .range(0, 9999)
    if (ratingsData?.length) {
      const top = ratingsData[0] as { media_id: number; media_type: string; title: string; poster_path: string | null; rating: number }
      const low = ratingsData[ratingsData.length - 1] as typeof top
      setExtTopRating({ title: top.title, posterPath: top.poster_path, rating: top.rating, mediaId: top.media_id, mediaType: top.media_type })
      setExtLowRating({ title: low.title, posterPath: low.poster_path, rating: low.rating, mediaId: low.media_id, mediaType: low.media_type })
    }

    // ── Top interactors (owner only) ────────────────────────────────
    if (currentUserId === profile.id) {
      const { data: myReviews } = await supabase.from('reviews').select('id').eq('user_id', profile.id).range(0, 9999)
      const myReviewIds = (myReviews ?? []).map((r: { id: string }) => r.id)
      if (myReviewIds.length > 0) {
        const likersRes = await supabase.from('review_likes').select('user_id').in('review_id', myReviewIds)
        let commentersData: { user_id: string }[] = []
        try {
          const cr = await supabase.from('review_comments').select('user_id').in('review_id', myReviewIds)
          commentersData = (cr.data ?? []) as { user_id: string }[]
        } catch { /* table may not exist */ }
        const countMap = new Map<string, number>()
        for (const r of [...(likersRes.data ?? []), ...commentersData]) {
          if (r.user_id !== profile.id) countMap.set(r.user_id, (countMap.get(r.user_id) ?? 0) + 1)
        }
        const sorted = [...countMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        if (sorted.length > 0) {
          const { data: pRows } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', sorted.map(s => s[0]))
          const pMap = Object.fromEntries((pRows ?? []).map((p: { id: string }) => [p.id, p])) as unknown as Record<string, { username: string | null; display_name: string | null; avatar_url: string | null } | undefined>
          setTopInteractors(sorted.map(([uid, count]) => {
            const p = pMap[uid]
            return { userId: uid, username: p?.username ?? null, displayName: p?.display_name ?? null, avatarUrl: p?.avatar_url ?? null, count }
          }))
        }
      }
    }

    // ── Favorite platform — async, non-blocking ──────────────────────
    const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
    if (TMDB_KEY) {
      const { data: recentMovies } = await supabase
        .from('watched').select('media_id').eq('user_id', profile.id).eq('media_type', 'movie')
        .order('watched_at', { ascending: false }).limit(20)
      if (recentMovies?.length) {
        const providerCounts = new Map<string, { name: string; logoPath: string; count: number }>()
        await Promise.allSettled((recentMovies as { media_id: number }[]).map(async item => {
          try {
            const res = await fetch(`https://api.themoviedb.org/3/movie/${item.media_id}/watch/providers?api_key=${TMDB_KEY}`)
            if (!res.ok) return
            const d = await res.json()
            const providers = d.results?.AR?.flatrate ?? d.results?.US?.flatrate ?? []
            if (providers[0]) {
              const p = providers[0]; const key = p.provider_name
              const existing = providerCounts.get(key)
              providerCounts.set(key, existing ? { ...existing, count: existing.count + 1 } : { name: p.provider_name, logoPath: p.logo_path, count: 1 })
            }
          } catch { /* skip */ }
        }))
        const top = [...providerCounts.values()].sort((a, b) => b.count - a.count)[0]
        if (top) setFavPlatform(top)
      }
    }

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

  // ── Share statistic ────────────────────────────────────────────
  async function shareStatistic(
    statType: string,
    statTitle: string,
    statValue: string,
    statDetail?: string,
    statImageUrl?: string,
  ) {
    if (!currentUserId) return
    await supabase.from('shared_stats').insert({
      user_id:       currentUserId,
      stat_type:     statType,
      stat_title:    statTitle,
      stat_value:    statValue,
      stat_detail:   statDetail ?? null,
      stat_image_url: statImageUrl ?? null,
    })
    setSharedToast('¡Estadística compartida en tu feed!')
    setTimeout(() => setSharedToast(null), 3000)
  }

  // ── Block ──────────────────────────────────────────────────────
  const [showBlockConfirm, setShowBlockConfirm] = useState(false)
  const [blockBusy, setBlockBusy]               = useState(false)
  const { blockedIds, blockUser, unblockUser }  = useBlockedUsers()
  const { promptForPush } = usePushPrompt(currentUserId ?? null)

  // ── Derived ────────────────────────────────────────────────────
  const isOwner   = currentUserId === profile.id
  const isBlocked = !isOwner && currentUserId != null && blockedIds.has(profile.id)
  const displayName = localProfile.display_name ?? localProfile.username ?? 'Usuario'
  const hasPinned   = pinned.some(Boolean)

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'perfil',    label: 'Perfil'                                                         },
    { id: 'yavi',      label: 'Ya vi',     count: moviesWatched + seriesWatched || undefined   },
    { id: 'resenas',   label: 'Reseñas',   count: allReviews.length || undefined               },
    { id: 'listas',    label: 'Listas',    count: userLists.length || undefined                },
    { id: 'paraVer',   label: 'Para ver',  count: watchlistCount || undefined                  },
    { id: 'favoritos', label: 'Me gusta',  count: allFavorites.length || undefined             },
    ...(isOwner ? [{ id: 'stats' as Tab, label: 'Estadísticas' }] : []),
  ]

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0A0A0F]">

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="relative bg-[#13131A] border-b border-[#2A2A3A]/60 overflow-hidden">
        {/* Backdrop blur from first pinned poster */}
        {(() => {
          const bannerPoster = pinned.find(Boolean)?.poster_path
            ?? (recentActivity[0]?.data as { poster_path?: string | null } | undefined)?.poster_path
          return bannerPoster ? (
            <div className="absolute inset-0 z-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://image.tmdb.org/t/p/w342${bannerPoster}`}
                alt=""
                className="w-full h-full object-cover blur-2xl scale-110 opacity-15"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-[#13131A]/50 to-[#13131A]" />
            </div>
          ) : null
        })()}
        <div className="relative z-10 max-w-5xl mx-auto px-4 py-8 sm:py-10">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">

            {/* Avatar */}
            <div className="shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-zinc-700 ring-4 ring-[#FFFD02]/30 shadow-xl">
                {localProfile.avatar_url ? (
                  <Image src={localProfile.avatar_url} alt={displayName} width={96} height={96} className="w-full h-full object-cover" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl font-bold bg-[#2A2A3A] text-[#FFFD02]">
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
                {(localProfile.username === 'Ferlageok' || localProfile.username === 'ferlageok') && <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="10" fill="#1D9BF0"/><path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                {followsMe && (
                  <span className="text-xs bg-[#1C1C27] border border-[#2A2A3A] text-[#A0A0B0] px-2.5 py-1 rounded-full">
                    Te sigue
                  </span>
                )}
              </div>

              <p className="text-[#A0A0B0] text-sm mb-3">@{localProfile.username}</p>

              {/* Level badge */}
              {(() => {
                const pts   = localProfile.points ?? 0
                const lvl   = localProfile.level ?? 1
                const info  = getLevelInfo(lvl, pts)
                return (
                  <div
                    className="inline-flex flex-col gap-1.5 mb-3 group"
                    title={info.next
                      ? `${pts} puntos · Faltan ${info.next.min - pts} para ${info.next.name}`
                      : `${pts} puntos · Nivel máximo`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg leading-none">{info.emoji}</span>
                      <span className="text-sm font-semibold text-[#F5A623]">{info.name}</span>
                      {info.next && (
                        <span className="text-xs text-[#A0A0B0]">→ {info.next.name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${info.pct}%`, backgroundColor: '#FFFD02' }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-600">
                        {info.next ? `${pts}/${info.next.min} pts` : `${pts} pts`}
                      </span>
                    </div>
                  </div>
                )
              })()}

              {localProfile.bio && (
                <p className="text-[#A0A0B0] text-sm leading-relaxed max-w-lg mb-4">{localProfile.bio}</p>
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
                      className="text-[#A0A0B0] hover:text-white transition-colors"
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
                      className="text-[#A0A0B0] hover:text-white transition-colors"
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
                      className="text-[#A0A0B0] hover:text-white transition-colors"
                    >
                      <XIcon />
                    </a>
                  )}
                </div>
              )}

              {/* Stats — cards */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-5">
                {[
                  { value: moviesWatched,  label: 'Películas',  onClick: undefined },
                  { value: seriesWatched,  label: 'Series',     onClick: undefined },
                  { value: followingCount, label: 'Siguiendo',  onClick: () => loadFollowList('following') },
                  { value: followersCount, label: 'Seguidores', onClick: () => loadFollowList('followers') },
                ].map(s => (
                  s.onClick ? (
                    <button
                      key={s.label}
                      onClick={s.onClick}
                      className="bg-[#0A0A0F] border border-[#2A2A3A] hover:border-[#FFFD02]/40 rounded-xl px-4 py-2.5 text-center transition-colors group min-w-[72px]"
                    >
                      <p className="text-xl font-bold text-white leading-none group-hover:text-[#FFFD02] transition-colors">{s.value}</p>
                      <p className="text-[10px] text-[#A0A0B0] mt-0.5 uppercase tracking-wide">{s.label}</p>
                    </button>
                  ) : (
                    <div key={s.label} className="bg-[#0A0A0F] border border-[#2A2A3A] rounded-xl px-4 py-2.5 text-center min-w-[72px]">
                      <p className="text-xl font-bold text-white leading-none">{s.value}</p>
                      <p className="text-[10px] text-[#A0A0B0] mt-0.5 uppercase tracking-wide">{s.label}</p>
                    </div>
                  )
                ))}
              </div>

              {/* Action button */}
              {currentUserId === undefined ? null : isOwner ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setEditName(localProfile.display_name ?? '')
                      setEditBio(localProfile.bio ?? '')
                      setEditUsername(localProfile.username ?? '')
                      setEditInstagram(localProfile.instagram_username ?? '')
                      setEditTiktok(localProfile.tiktok_username ?? '')
                      setEditX(localProfile.x_username ?? '')
                      setUsernameError(null)
                      setAvatarFile(null)
                      setAvatarPreview(null)
                      setIsEditing(true)
                    }}
                    className="inline-flex items-center gap-2 text-sm font-medium bg-[#1C1C27] hover:bg-zinc-700 border border-[#2A2A3A] text-zinc-300 hover:text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <Pencil size={13} /> Editar perfil
                  </button>
                  <Link
                    href="/importar"
                    className="inline-flex items-center gap-1.5 text-xs text-[#A0A0B0] hover:text-white transition-colors"
                  >
                    📥 Importar desde Letterboxd →
                  </Link>
                </div>
              ) : currentUserId ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={toggleFollow}
                    disabled={followBusy}
                    className={`inline-flex items-center gap-2 text-sm font-medium px-5 py-2 rounded-lg transition-colors ${
                      isFollowing
                        ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-400'
                        : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white'
                    }`}
                  >
                    {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
                    {isFollowing ? 'Siguiendo' : 'Seguir'}
                  </button>
                  <button
                    onClick={() => isBlocked ? unblockUser(profile.id) : setShowBlockConfirm(true)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors bg-[#1C1C27] hover:bg-zinc-700 border border-[#2A2A3A] text-zinc-400 hover:text-white"
                  >
                    <Ban size={14} />
                    {isBlocked ? 'Desbloquear' : 'Bloquear'}
                  </button>
                </div>
              ) : (
                <Link href="/auth" className="inline-flex items-center gap-2 text-sm font-medium bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-5 py-2 rounded-lg transition-colors">
                  <UserPlus size={14} /> Seguir
                </Link>
              )}
            </div>
          </div>
        </div>
        </div>

      {/* ── TAB BAR ────────────────────────────────────────────── */}
      {!isBlocked && (
      <div className="sticky top-[57px] z-30 bg-[#0A0A0F]/95 backdrop-blur border-b border-[#2A2A3A]">
        <div className="max-w-5xl mx-auto px-4 flex overflow-x-auto no-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-3 sm:py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#FFFD02] text-white'
                  : 'border-transparent text-[#A0A0B0] hover:text-zinc-300'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full tabular-nums ${
                  activeTab === tab.id ? 'bg-[#FFFD02]/20 text-[#FFFD02]' : 'bg-[#2A2A3A] text-[#A0A0B0]'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* ── TAB CONTENT ────────────────────────────────────────── */}
      {isBlocked ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center max-w-5xl mx-auto px-4">
          <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center">
            <Ban size={24} className="text-zinc-500" />
          </div>
          <div>
            <p className="text-base font-semibold text-white">Has bloqueado a este usuario</p>
            <p className="text-sm text-zinc-500 mt-1">No podés ver su contenido mientras esté bloqueado</p>
          </div>
          <button
            onClick={() => unblockUser(profile.id)}
            className="text-sm font-medium bg-[#1C1C27] hover:bg-zinc-700 border border-[#2A2A3A] text-zinc-300 hover:text-white px-4 py-2 rounded-lg transition-colors"
          >
            Desbloquear
          </button>
        </div>
      ) : (
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
                            <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27]">
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
                                className="bg-[#13131A]/90 hover:bg-[#E5EB00] text-black rounded-full p-1.5 transition-colors"
                                title="Cambiar"
                              >
                                <SearchIcon size={12} />
                              </button>
                              <button
                                onClick={() => removePin(slot)}
                                className="bg-[#13131A]/90 hover:bg-red-600 text-white rounded-full p-1.5 transition-colors"
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
                                ? 'border-[#2A2A3A] hover:border-[#FFFD02] cursor-pointer'
                                : 'border-[#2A2A3A]'
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
                      className="text-xs text-[#A0A0B0] hover:text-[#FFFD02] transition-colors"
                    >
                      Ver reseñas →
                    </button>
                  )}
                </div>
                {recentActivity.length === 0 ? (
                  <p className="text-zinc-600 text-sm">Sin actividad reciente.</p>
                ) : (
                  <div className="divide-y divide-[#2A2A3A]/60">
                    {recentActivity.map((item, i) => {
                      const d    = item.data
                      const href = item.kind === 'review' ? `/review/${d.id}` : `/${d.media_type}/${d.media_id}`
                      const date = new Date(item.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
                      return (
                        <div key={`${item.kind}-${d.id}-${i}`} className="flex items-start gap-3 py-3">
                          {/* Poster */}
                          <Link href={href} className="shrink-0">
                            <div className="relative w-10 aspect-[2/3] rounded overflow-hidden bg-[#1C1C27]">
                              {d.poster_path && (
                                <Image src={getPosterUrl(d.poster_path, 'w92')} alt={d.title} fill className="object-cover" sizes="40px" />
                              )}
                            </div>
                          </Link>
                          {/* Info */}
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-start justify-between gap-2">
                              <Link href={href} className="text-sm font-medium text-white hover:text-[#FFFD02] transition-colors line-clamp-1">
                                {d.title}
                              </Link>
                              <span className="text-[11px] text-zinc-600 shrink-0">{date}</span>
                            </div>
                            {/* Kind badge + stars row */}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                item.kind === 'review'
                                  ? 'bg-[#FFFD02]/10 text-[#FFFD02]'
                                  : 'bg-yellow-900/40 text-yellow-400'
                              }`}>
                                {item.kind === 'review' ? 'Reseña' : 'Valoración'}
                              </span>
                              {d.rating != null && (
                                <StarDisplay rating={d.rating} size={10} />
                              )}
                            </div>
                            {/* Review excerpt */}
                            {item.kind === 'review' && (item.data as ReviewItem).body && (
                              <p className="text-xs text-[#A0A0B0] line-clamp-2 mt-1 leading-relaxed">
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
                      className="text-xs text-[#A0A0B0] hover:text-[#FFFD02] transition-colors"
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
        {activeTab === 'yavi' && (() => {
          const filtered = watchedFilter === 'all'
            ? allWatched
            : allWatched.filter(w => w.media_type === watchedFilter)
          const displayed = [...filtered].sort((a, b) => {
            if (watchedSort === 'name') return a.title.localeCompare(b.title, 'es')
            if (watchedSort === 'rated') {
              const ra = watchedRatings.get(`${a.media_type}:${a.media_id}`) ?? 0
              const rb = watchedRatings.get(`${b.media_type}:${b.media_id}`) ?? 0
              return rb - ra
            }
            return 0
          })
          return allWatched.length === 0 ? (
            <EmptyCard
              icon="🎬"
              actionLabel={isOwner ? 'Empezar →' : undefined}
              actionHref={isOwner ? '/que-ver' : undefined}
            >
              {isOwner
                ? 'Todavía no marcaste películas como vistas. Empezá a llevar registro de lo que ves.'
                : `${localProfile.username ?? 'Este usuario'} todavía no tiene películas marcadas como vistas.`}
            </EmptyCard>
          ) : (
            <>
              {/* Filter + sort bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-1.5">
                  {(['all', 'movie', 'tv'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setWatchedFilter(f)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        watchedFilter === f ? 'bg-[#FFFD02] text-black' : 'bg-[#1C1C27] text-[#A0A0B0] hover:text-white'
                      }`}
                    >
                      {f === 'all' ? 'Todo' : f === 'movie' ? 'Películas' : 'Series'}
                    </button>
                  ))}
                </div>
                <select
                  value={watchedSort}
                  onChange={e => setWatchedSort(e.target.value as 'recent' | 'name' | 'rated')}
                  className="bg-[#1C1C27] text-zinc-300 text-xs rounded-lg px-3 py-1.5 border border-[#2A2A3A] outline-none focus:border-[#FFFD02] cursor-pointer"
                >
                  <option value="recent">Más reciente</option>
                  <option value="rated">Mejor calificadas</option>
                  <option value="name">Nombre</option>
                </select>
              </div>
              <p className="text-xs text-zinc-600 mb-4">
                {displayed.length} título{displayed.length !== 1 ? 's' : ''}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {displayed.map(w => {
                  const rating = watchedRatings.get(`${w.media_type}:${w.media_id}`)
                  return (
                    <Link key={w.id} href={`/${w.media_type}/${w.media_id}`} className="group block">
                      <div className="relative w-full aspect-[2/3] rounded-md overflow-hidden bg-[#1C1C27] mb-1.5">
                        {w.poster_path ? (
                          <Image
                            src={getPosterUrl(w.poster_path, 'w185')}
                            alt={w.title} fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                            sizes="160px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px] text-center px-1">
                            {w.title}
                          </div>
                        )}
                        {rating && (
                          <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="text-center">
                              <p className="text-2xl font-bold" style={{ color: '#FFFD02' }}>{rating}</p>
                              <p className="text-[11px] text-white/70 mt-0.5">★ Tu nota</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-tight line-clamp-1 group-hover:text-white transition-colors">
                        {w.title}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </>
          )
        })()}

        {/* ── RESEÑAS ── */}
        {activeTab === 'resenas' && (
          allReviews.length === 0 ? (
            <EmptyCard
              icon="✍️"
              actionLabel={isOwner ? 'Calificar mi primera peli →' : undefined}
              actionHref={isOwner ? '/que-ver' : undefined}
            >
              {isOwner
                ? 'Todavía no escribiste reseñas. Cuando califiques una peli con texto, va a aparecer acá.'
                : `${localProfile.username ?? 'Este usuario'} todavía no tiene reseñas públicas.`}
            </EmptyCard>
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
                  hasSpoiler={r.has_spoiler ?? false}
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

        {/* ── LISTAS ── */}
        {activeTab === 'listas' && (
          <>
            {isOwner && (
              <div className="mb-5">
                <Link href="/listas/nueva"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-black bg-[#FFFD02] hover:bg-[#E5EB00] transition-colors">
                  <Plus size={16} /> Crear nueva lista
                </Link>
              </div>
            )}
            {userLists.length === 0 ? (
              <EmptyCard
                icon="📋"
                actionLabel={isOwner ? 'Crear lista →' : undefined}
                actionHref={isOwner ? '/listas/nueva' : undefined}
              >
                {isOwner
                  ? 'Creá tu primera lista. Por ejemplo: tu top 10 personal, o las pendientes del verano.'
                  : `${localProfile.username ?? 'Este usuario'} todavía no tiene listas públicas.`}
              </EmptyCard>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {userLists.map(l => (
                <Link key={l.id} href={`/listas/${l.id}`}
                  className="group bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 hover:border-[#FFFD02]/50 transition-all block">
                  {/* Preview grid */}
                  <div className="flex gap-1 mb-3 h-16">
                    {l.previews.length > 0 ? l.previews.map((p, i) => (
                      <div key={i} className="flex-1 rounded-md overflow-hidden bg-[#1C1C27]">
                        {p ? (
                          <Image src={`https://image.tmdb.org/t/p/w185${p}`} alt="" width={60} height={64} className="w-full h-full object-cover" />
                        ) : <div className="w-full h-full bg-[#1C1C27]" />}
                      </div>
                    )) : null}
                    {Array.from({ length: Math.max(0, 4 - l.previews.length) }).map((_, i) => (
                      <div key={`e-${i}`} className="flex-1 rounded-md bg-[#1C1C27]" />
                    ))}
                  </div>
                  <p className="text-sm font-semibold text-white group-hover:text-[#FFFD02] transition-colors line-clamp-1 mb-1">{l.title}</p>
                  <p className="text-xs text-[#A0A0B0]">{l.itemCount} títulos · {l.likeCount} likes</p>
                </Link>
              ))}
              </div>
            )}
          </>
        )}

        {/* ── PARA VER ── */}
        {activeTab === 'paraVer' && (
          allWatchlist.length === 0 ? (
            <EmptyCard
              icon="🔖"
              actionLabel={isOwner ? 'Explorar películas →' : undefined}
              actionHref={isOwner ? '/que-ver' : undefined}
            >
              {isOwner
                ? 'Tu watchlist está vacía. Agregá películas que querés ver para no perderte nada.'
                : `${localProfile.username ?? 'Este usuario'} no tiene títulos en su watchlist.`}
            </EmptyCard>
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

        {/* ── ME GUSTA ── */}
        {activeTab === 'favoritos' && (
          allFavorites.length === 0 ? (
            <EmptyCard
              icon="❤️"
              actionLabel={isOwner ? 'Explorar →' : undefined}
              actionHref={isOwner ? '/que-ver' : undefined}
            >
              {isOwner
                ? 'Marcá tus películas favoritas. Las que más te gustaron, para tenerlas a mano.'
                : `${localProfile.username ?? 'Este usuario'} todavía no marcó favoritos.`}
            </EmptyCard>
          ) : (
            <>
              <p className="text-xs text-zinc-600 mb-4">{allFavorites.length} título{allFavorites.length !== 1 ? 's' : ''}</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
                {allFavorites.map(f => (
                  <Link key={f.id} href={`/${f.media_type}/${f.media_id}`} className="group block">
                    <div className="relative w-full aspect-[2/3] rounded-md overflow-hidden bg-[#1C1C27] mb-1.5">
                      {f.poster_path ? (
                        <Image
                          src={getPosterUrl(f.poster_path, 'w185')}
                          alt={f.title}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          sizes="160px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px] text-center px-1">
                          {f.title}
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-tight line-clamp-2 group-hover:text-white transition-colors">
                      {f.title}
                    </p>
                  </Link>
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
                <div className="w-7 h-7 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
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
                      <div key={period.label} className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
                        <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#A0A0B0] mb-3">{period.label}</p>
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#A0A0B0]">Películas</span>
                            <span className="text-lg font-bold text-white">{period.movies}</span>
                          </div>
                          <div className="w-full bg-[#1C1C27] rounded-full h-1">
                            <div
                              className="bg-[#FFFD02] h-1 rounded-full transition-all"
                              style={{ width: period.movies + period.series > 0 ? `${(period.movies / (period.movies + period.series)) * 100}%` : '0%' }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[#A0A0B0]">Series</span>
                            <span className="text-lg font-bold text-white">{period.series}</span>
                          </div>
                          <div className="w-full bg-[#1C1C27] rounded-full h-1">
                            <div
                              className="bg-sky-500 h-1 rounded-full transition-all"
                              style={{ width: period.movies + period.series > 0 ? `${(period.series / (period.movies + period.series)) * 100}%` : '0%' }}
                            />
                          </div>
                          <p className="text-xs text-zinc-600 pt-0.5 border-t border-[#2A2A3A]">
                            {period.movies + period.series} total
                          </p>
                          {/* Hours — show only once richStats loaded */}
                          {period.minutes !== undefined && period.minutes > 0 && (
                            <p className="text-[11px] text-[#A0A0B0]">
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
                  <div className="flex items-center gap-3 text-[#A0A0B0] text-sm py-4">
                    <div className="w-5 h-5 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin shrink-0" />
                    Calculando estadísticas…
                  </div>
                )}

                {!richBusy && richStats && !richStats.tooFew && (
                  <>
                    {/* ── Horas vistas ──────────────────────────── */}
                    {richStats.totalMinutes > 0 && (
                      <div>
                        <SectionLabel>Horas vistas en total</SectionLabel>
                        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-6">
                          <div className="flex items-end justify-between gap-3">
                            <div className="flex items-end gap-3">
                              <span className="text-5xl font-black text-white leading-none">
                                {Math.floor(richStats.totalMinutes / 60)}
                                <span className="text-2xl font-bold text-[#FFFD02] ml-1">h</span>
                              </span>
                              <span className="text-2xl font-bold text-[#A0A0B0] leading-none mb-0.5">
                                {richStats.totalMinutes % 60}
                                <span className="text-base font-semibold ml-1">min</span>
                              </span>
                            </div>
                            {isOwner && (
                              <button
                                onClick={() => shareStatistic(
                                  'watch_hours_total',
                                  `Horas vistas en total por ${localProfile.username}`,
                                  `${Math.floor(richStats.totalMinutes / 60)}h ${richStats.totalMinutes % 60}min`,
                                  weeklyMinutes > 0 ? `Esta semana: ${Math.floor(weeklyMinutes / 60)}h ${weeklyMinutes % 60}min` : undefined,
                                )}
                                className="flex items-center gap-1.5 text-xs text-[#A0A0B0] hover:text-[#FFFD02] transition-colors px-3 py-1.5 rounded-lg border border-[#2A2A3A] hover:border-[#FFFD02]"
                              >
                                <Share2 size={13} />
                                Compartir
                              </button>
                            )}
                          </div>
                          {weeklyMinutes > 0 && (
                            <p className="text-xs text-[#A0A0B0] mt-3 pt-3 border-t border-[#2A2A3A]">
                              Esta semana: {Math.floor(weeklyMinutes / 60)}h {weeklyMinutes % 60}min
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Géneros más vistos ────────────────────── */}
                    {richStats.topGenres.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <SectionLabel>Géneros más vistos</SectionLabel>
                          {isOwner && (
                            <button
                              onClick={() => shareStatistic(
                                'top_genre',
                                `Género favorito de ${localProfile.username}`,
                                richStats.topGenres[0].name,
                                `Visto en ${richStats.topGenres[0].count} título${richStats.topGenres[0].count !== 1 ? 's' : ''}`,
                              )}
                              className="flex items-center gap-1.5 text-xs text-[#A0A0B0] hover:text-[#FFFD02] transition-colors px-3 py-1.5 rounded-lg border border-[#2A2A3A] hover:border-[#FFFD02] mb-3"
                            >
                              <Share2 size={13} />
                              Compartir
                            </button>
                          )}
                        </div>
                        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 space-y-4">
                          {richStats.topGenres.map((g, i) => {
                            const max = richStats.topGenres[0].count
                            const pct = Math.round((g.count / max) * 100)
                            return (
                              <div key={g.name}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-sm font-medium text-white">
                                    {i === 0 && <span className="text-[#FFFD02] mr-1.5">▲</span>}
                                    {g.name}
                                  </span>
                                  <span className="text-xs text-[#A0A0B0]">{g.count} título{g.count !== 1 ? 's' : ''}</span>
                                </div>
                                <div className="w-full bg-[#1C1C27] rounded-full h-1.5">
                                  <div
                                    className="bg-[#FFFD02] h-1.5 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Décadas favoritas ─────────────────────── */}
                    {richStats.topDecades?.length > 0 && (
                      <div>
                        <SectionLabel>Décadas favoritas</SectionLabel>
                        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 space-y-4">
                          {richStats.topDecades.map((d, i) => {
                            const max = richStats.topDecades[0].count
                            const pct = Math.round((d.count / max) * 100)
                            return (
                              <div key={d.decade}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-sm font-medium text-white">
                                    {i === 0 && <span className="text-[#FFFD02] mr-1.5">▲</span>}
                                    {d.decade}
                                  </span>
                                  <span className="text-xs text-[#A0A0B0]">{d.count} título{d.count !== 1 ? 's' : ''}</span>
                                </div>
                                <div className="w-full bg-[#1C1C27] rounded-full h-1.5">
                                  <div
                                    className="bg-[#FFFD02] h-1.5 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Idiomas más vistos ────────────────────── */}
                    {richStats.topLanguages?.length > 0 && (
                      <div>
                        <SectionLabel>Idiomas más vistos</SectionLabel>
                        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 space-y-4">
                          {richStats.topLanguages.map((l, i) => (
                            <div key={l.name}>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-sm font-medium text-white">
                                  {i === 0 && l.name !== 'Otros' && <span className="text-[#FFFD02] mr-1.5">▲</span>}
                                  {l.name}
                                </span>
                                <span className="text-xs text-[#A0A0B0]">{l.pct}%</span>
                              </div>
                              <div className="w-full bg-[#1C1C27] rounded-full h-1.5">
                                <div
                                  className="h-1.5 rounded-full transition-all"
                                  style={{
                                    width: `${l.pct}%`,
                                    backgroundColor: l.name === 'Otros' ? '#52525b' : '#FFFD02',
                                  }}
                                />
                              </div>
                            </div>
                          ))}
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
                          ).filter(row => row.person !== null).map(({ label, person }) => {
                            const statTypeMap: Record<string, string> = {
                              'Actor favorito':    'top_actor',
                              'Actriz favorita':   'top_actress',
                              'Director favorito': 'top_director',
                            }
                            return (
                              <div key={label} className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 flex items-center gap-4">
                                {/* Square photo */}
                                <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-zinc-700">
                                  {person!.profilePath ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={`https://image.tmdb.org/t/p/w185${person!.profilePath}`}
                                      alt={person!.name}
                                      className="w-full h-full object-cover"
                                      style={{ objectPosition: 'top center' }}
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold bg-[#2A2A3A] text-[#FFFD02]">
                                      {person!.name.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#A0A0B0] mb-0.5">{label}</p>
                                  <p className="text-base font-bold text-white truncate">{person!.name}</p>
                                  <p className="text-xs text-[#A0A0B0] mt-0.5">
                                    Apareció en {person!.count} título{person!.count !== 1 ? 's' : ''} que viste
                                  </p>
                                </div>
                                {isOwner && (
                                  <button
                                    onClick={() => shareStatistic(
                                      statTypeMap[label] ?? 'top_actor',
                                      `${label} de ${localProfile.username}`,
                                      person!.name,
                                      `Apareció en ${person!.count} título${person!.count !== 1 ? 's' : ''} que viste`,
                                      person!.profilePath ? `https://image.tmdb.org/t/p/w185${person!.profilePath}` : undefined,
                                    )}
                                    className="shrink-0 flex items-center gap-1 text-xs text-[#A0A0B0] hover:text-[#FFFD02] transition-colors p-2 rounded-lg border border-[#2A2A3A] hover:border-[#FFFD02]"
                                    title="Compartir"
                                  >
                                    <Share2 size={13} />
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!richBusy && richStats?.tooFew && (
                  <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-6 text-center">
                    <p className="text-[#A0A0B0] text-sm">
                      Mirá más contenido para ver tus estadísticas detalladas.
                    </p>
                  </div>
                )}

                {/* ── Gráfico mensual ──────────────────────────── */}
                {monthlyData.length > 0 && monthlyData.some(m => m.count > 0) && (
                  <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
                    <p className="text-[13px] font-semibold uppercase tracking-wider mb-5" style={{ color: '#FFFD02' }}>Actividad mensual</p>
                    {(() => {
                      const maxCount = Math.max(...monthlyData.map(m => m.count), 1)
                      const nowMonth = new Date().getMonth(); const nowYear = new Date().getFullYear()
                      return (
                        <div className="flex items-end gap-1.5" style={{ height: 140 }}>
                          {monthlyData.map((m, i) => {
                            const isCurrent = m.month === new Date().toLocaleString('es-AR', { month: 'short' }) && m.year === nowYear
                            const barH = Math.max(m.count > 0 ? Math.round((m.count / maxCount) * 100) : 0, m.count > 0 ? 4 : 0)
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                {m.count > 0 && (
                                  <span className="text-[10px] font-semibold" style={{ color: isCurrent ? '#FFFD02' : '#A0A0B0' }}>{m.count}</span>
                                )}
                                <div className="w-full rounded-t-sm transition-all duration-500" style={{ height: `${barH}%`, minHeight: m.count > 0 ? 4 : 0, backgroundColor: isCurrent ? '#FFFD02' : '#2A2A3A' }} />
                                <span className="text-[10px] text-[#A0A0B0] truncate w-full text-center">{m.month}</span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* ── Mejor y peor calificada ──────────────────── */}
                {(extTopRating || extLowRating) && (
                  <div>
                    <p className="text-[13px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#FFFD02' }}>Tus valoraciones extremas</p>
                    <div className="grid grid-cols-2 gap-3">
                      {extTopRating && (
                        <Link href={`/${extTopRating.mediaType}/${extTopRating.mediaId}`} className="bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/40 rounded-2xl p-4 flex gap-3 transition-colors">
                          {extTopRating.posterPath && (
                            <Image src={getPosterUrl(extTopRating.posterPath, 'w92')} alt={extTopRating.title} width={40} height={60} className="rounded-md object-cover shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#22c55e' }}>Tu favorita ⭐</p>
                            <p className="text-xs font-semibold text-white line-clamp-2 mb-1">{extTopRating.title}</p>
                            <p className="text-sm font-bold" style={{ color: '#22c55e' }}>{extTopRating.rating}/5</p>
                          </div>
                        </Link>
                      )}
                      {extLowRating && extLowRating.mediaId !== extTopRating?.mediaId && (
                        <Link href={`/${extLowRating.mediaType}/${extLowRating.mediaId}`} className="bg-[#13131A] border border-[#2A2A3A] hover:border-red-900/40 rounded-2xl p-4 flex gap-3 transition-colors">
                          {extLowRating.posterPath && (
                            <Image src={getPosterUrl(extLowRating.posterPath, 'w92')} alt={extLowRating.title} width={40} height={60} className="rounded-md object-cover shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#ef4444' }}>La peor 💀</p>
                            <p className="text-xs font-semibold text-white line-clamp-2 mb-1">{extLowRating.title}</p>
                            <p className="text-sm font-bold" style={{ color: '#ef4444' }}>{extLowRating.rating}/5</p>
                          </div>
                        </Link>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Plataforma favorita ──────────────────────── */}
                {favPlatform && (
                  <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5 flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#1C1C27] shrink-0">
                      {favPlatform.logoPath ? (
                        <Image src={`https://image.tmdb.org/t/p/original${favPlatform.logoPath}`} alt={favPlatform.name} width={56} height={56} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white bg-[#2A2A3A]">{favPlatform.name[0]}</div>
                      )}
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#A0A0B0] mb-0.5">Tu plataforma favorita</p>
                      <p className="text-base font-bold text-white">{favPlatform.name}</p>
                      <p className="text-xs text-[#A0A0B0] mt-0.5">{favPlatform.count} título{favPlatform.count !== 1 ? 's' : ''} vistos</p>
                    </div>
                  </div>
                )}

                {/* ── Top interactores (solo owner) ───────────── */}
                {topInteractors.length > 0 && (
                  <div>
                    <p className="text-[13px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#FFFD02' }}>Quiénes más interactúan con vos</p>
                    <div className="space-y-2">
                      {topInteractors.map(u => (
                        <Link key={u.userId} href={`/usuario/${u.username}`} className="flex items-center gap-3 bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/30 rounded-xl p-3 transition-colors">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-[#1C1C27] shrink-0">
                            {u.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u.avatarUrl} alt={u.displayName ?? u.username ?? ''} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-[#2A2A3A] text-[#FFFD02]">
                                {(u.displayName ?? u.username ?? '?')[0]?.toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{u.displayName ?? u.username}</p>
                            <p className="text-xs text-[#A0A0B0]">{u.count} interacción{u.count !== 1 ? 'es' : ''}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        )}
      </div>
      )}{/* end isBlocked ternary */}

      {/* ── FOLLOW LIST MODAL ─────────────────────────────────── */}
      {followListMode && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setFollowListMode(null) }}
        >
          <div className="bg-[#13131A] border border-[#2A2A3A]/60 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A3A] shrink-0">
              <p className="text-sm font-semibold text-white">
                {followListMode === 'followers' ? 'Seguidores' : 'Siguiendo'}
              </p>
              <button onClick={() => setFollowListMode(null)} className="text-[#A0A0B0] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-3 py-3">
              {followListBusy ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : followList.length === 0 ? (
                <p className="text-[#A0A0B0] text-sm text-center py-10">
                  Sin {followListMode === 'followers' ? 'seguidores' : 'seguidos'} todavía.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {followList.map(u => {
                    const name    = u.display_name ?? u.username ?? 'Usuario'
                    const isMe    = currentUserId === u.id
                    const isFwg   = followingInList.has(u.id)
                    return (
                      <div key={u.id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-[#1C1C27] transition-colors">
                        <Link href={`/usuario/${u.username}`} onClick={() => setFollowListMode(null)} className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                            {u.avatar_url ? (
                              <Image src={u.avatar_url} alt={name} width={36} height={36} className="w-full h-full object-cover" unoptimized />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-[#2A2A3A] text-[#FFFD02]">
                                {name[0]?.toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{name}</p>
                            <p className="text-xs text-[#A0A0B0] truncate">@{u.username}</p>
                          </div>
                        </Link>
                        {!isMe && currentUserId && (
                          <button
                            onClick={() => toggleFollowInList(u.id)}
                            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                              isFwg
                                ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-400'
                                : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white'
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
          <div className="bg-[#13131A] border border-[#2A2A3A]/60 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A3A]">
              <p className="text-sm font-semibold text-white">Editar perfil</p>
              <button onClick={() => setIsEditing(false)} className="text-[#A0A0B0] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4 max-h-[60vh] overflow-y-auto">

              {/* Avatar */}
              <div className="flex flex-col items-center gap-2 pb-1">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-700 ring-2 ring-zinc-600 shrink-0">
                  {(avatarPreview ?? localProfile.avatar_url) ? (
                    <Image
                      src={avatarPreview ?? localProfile.avatar_url!}
                      alt="avatar"
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl font-bold bg-[#2A2A3A] text-[#FFFD02]">
                      {displayName[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-[#FFFD02] hover:text-[#FFF84D] font-medium transition-colors"
                >
                  Cambiar foto
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (file.size > 5 * 1024 * 1024) {
                      alert('La imagen no puede superar los 5 MB')
                      return
                    }
                    setAvatarFile(file)
                    setAvatarPreview(URL.createObjectURL(file))
                  }}
                />
              </div>

              {/* Username */}
              <div>
                <label className="text-xs font-medium text-[#A0A0B0] uppercase tracking-wider block mb-1.5">
                  Nombre de usuario (@)
                </label>
                <div className="relative">
                  <input
                    value={editUsername}
                    onChange={e => { setEditUsername(e.target.value); setUsernameError(null) }}
                    onBlur={() => checkUsername(editUsername)}
                    placeholder="tu_usuario"
                    maxLength={30}
                    className={`w-full bg-[#1C1C27] border rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors ${
                      usernameError ? 'border-red-500' : 'border-[#2A2A3A] focus:border-[#FFFD02]'
                    }`}
                  />
                  {usernameChecking && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border border-zinc-500 border-t-[#FFFD02] rounded-full animate-spin" />
                  )}
                </div>
                {usernameError && (
                  <p className="text-[11px] text-red-400 mt-1">{usernameError}</p>
                )}
              </div>

              {/* Display name */}
              <div>
                <label className="text-xs font-medium text-[#A0A0B0] uppercase tracking-wider block mb-1.5">
                  Nombre a mostrar
                </label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder={localProfile.username ?? 'Tu nombre'}
                  maxLength={50}
                  className="w-full bg-[#1C1C27] border border-[#2A2A3A] focus:border-[#FFFD02] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
                />
              </div>

              {/* Bio */}
              <div>
                <label className="text-xs font-medium text-[#A0A0B0] uppercase tracking-wider block mb-1.5">
                  Bio
                </label>
                <textarea
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  placeholder="Contá algo sobre vos..."
                  maxLength={200}
                  rows={3}
                  className="w-full bg-[#1C1C27] border border-[#2A2A3A] focus:border-[#FFFD02] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors resize-none"
                />
                <p className="text-[11px] text-zinc-600 text-right mt-1">{editBio.length}/200</p>
              </div>

              {/* Social divider */}
              <div className="border-t border-[#2A2A3A] pt-1">
                <p className="text-[11px] font-semibold text-[#A0A0B0] uppercase tracking-wider mb-3">Redes sociales</p>

                {/* Instagram */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[#A0A0B0]"><InstagramIcon /></span>
                    <input
                      value={editInstagram}
                      onChange={e => setEditInstagram(e.target.value)}
                      placeholder="@usuario"
                      maxLength={60}
                      className="flex-1 bg-[#1C1C27] border border-[#2A2A3A] focus:border-[#FFFD02] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
                    />
                  </div>

                  {/* TikTok */}
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[#A0A0B0]"><TikTokIcon /></span>
                    <input
                      value={editTiktok}
                      onChange={e => setEditTiktok(e.target.value)}
                      placeholder="@usuario"
                      maxLength={60}
                      className="flex-1 bg-[#1C1C27] border border-[#2A2A3A] focus:border-[#FFFD02] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
                    />
                  </div>

                  {/* X */}
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[#A0A0B0]"><XIcon /></span>
                    <input
                      value={editX}
                      onChange={e => setEditX(e.target.value)}
                      placeholder="@usuario"
                      maxLength={60}
                      className="flex-1 bg-[#1C1C27] border border-[#2A2A3A] focus:border-[#FFFD02] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 flex justify-end gap-3 border-t border-[#2A2A3A] pt-4">
              <button
                onClick={() => setIsEditing(false)}
                className="text-sm text-[#A0A0B0] hover:text-white px-4 py-2 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={saveProfile}
                disabled={editSaving || !!usernameError || usernameChecking}
                className="inline-flex items-center gap-2 text-sm font-medium bg-[#FFFD02] hover:bg-[#E5EB00] disabled:opacity-40 disabled:cursor-not-allowed text-black px-5 py-2 rounded-lg transition-colors"
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
          <div className="bg-[#13131A] border border-[#2A2A3A]/60 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A3A]">
              <p className="text-sm font-semibold text-white">
                Elegir favorita · Slot {searchingSlot}
              </p>
              <button
                onClick={() => { setSearchingSlot(null); setSearchQuery(''); setSearchResults([]) }}
                className="text-[#A0A0B0] hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2 bg-[#1C1C27] rounded-xl px-3 py-2.5 border border-[#2A2A3A] focus-within:border-[#FFFD02] transition-colors">
                <SearchIcon size={14} className="text-[#A0A0B0] shrink-0" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar película o serie..."
                  className="bg-transparent text-sm text-white placeholder-zinc-500 outline-none flex-1"
                />
                {searchBusy && (
                  <div className="w-3.5 h-3.5 border border-zinc-600 border-t-[#FFFD02] rounded-full animate-spin shrink-0" />
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
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-1 ring-2 ring-transparent group-hover/res:ring-[#FFFD02] transition-all">
                          {result.poster_path ? (
                            <Image src={getPosterUrl(result.poster_path, 'w185')} alt={label} fill className="object-cover" sizes="90px" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px] text-center p-1">{label}</div>
                          )}
                        </div>
                        <p className="text-[10px] text-[#A0A0B0] line-clamp-2 leading-tight">{label}</p>
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

      {/* ── BLOCK CONFIRM MODAL ────────────────────────────────── */}
      {showBlockConfirm && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget && !blockBusy) setShowBlockConfirm(false) }}
        >
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl w-full max-w-xs shadow-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-white">¿Bloquear a @{localProfile.username}?</p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              No verás más su contenido y no podrá interactuar con vos.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBlockConfirm(false)}
                disabled={blockBusy}
                className="flex-1 py-2 rounded-lg border border-[#2A2A3A] text-sm text-zinc-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setBlockBusy(true)
                  await blockUser(profile.id)
                  setShowBlockConfirm(false)
                  setBlockBusy(false)
                }}
                disabled={blockBusy}
                className="flex-1 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm text-white font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {blockBusy
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Ban size={13} /> Bloquear</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SHARED TOAST ───────────────────────────────────────── */}
      {sharedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-[#13131A] border border-[#FFFD02]/60 rounded-full shadow-2xl text-sm font-medium text-[#FFFD02] flex items-center gap-2 animate-fade-in-up pointer-events-none">
          <Share2 size={14} />
          {sharedToast}
        </div>
      )}
    </div>
  )
}
