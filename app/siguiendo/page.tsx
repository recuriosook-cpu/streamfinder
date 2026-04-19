'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Users, LogIn, Heart, MessageCircle, Zap, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { getPosterUrl } from '@/lib/tmdb'
import VerifiedBadge, { isVerified } from '@/components/VerifiedBadge'
import StarDisplay from '@/components/StarDisplay'

// ── Constants ─────────────────────────────────────────────────────────────────

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const PAGE_SIZE = 20

const GENRE_MAP: Record<number, string> = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
  14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia ficción',
  53: 'Suspenso', 10752: 'Bélica', 37: 'Western',
  10759: 'Acción y aventura', 10765: 'Sci-Fi y fantasía',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  username: string | null
  avatar_url: string | null
}

interface ActivityItem {
  key: string
  type: 'review' | 'watched' | 'rating'
  userId: string
  sortTime: string
  reviewId?: string
  body?: string | null
  recommended?: boolean
  likes?: { user_id: string }[]
  mediaId: number
  mediaType: string
  title: string
  posterPath: string | null
  rating?: number | null
}

interface CompatItem {
  userId: string
  score: number
  sharedGenreId: number | null
}

interface Achievement {
  id: string
  emoji: string
  name: string
  description: string
  current: number
  target: number
  completed: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function runConcurrently(tasks: (() => Promise<void>)[], limit: number) {
  let i = 0
  const worker = async () => { while (i < tasks.length) await tasks[i++]() }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
}

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

function jaccardScore(a: Set<number>, b: Set<number>): number {
  if (a.size === 0 || b.size === 0) return 0
  const inter = [...a].filter(x => b.has(x)).length
  const union = new Set([...a, ...b]).size
  return Math.round((inter / union) * 100)
}

function topGenreSet(
  items: { genre_ids: number[] | null }[],
  n = 5,
): { top: Set<number>; counts: Record<number, number> } {
  const counts: Record<number, number> = {}
  for (const item of items) {
    for (const gid of item.genre_ids ?? []) {
      counts[gid] = (counts[gid] ?? 0) + 1
    }
  }
  const top = new Set(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([id]) => Number(id)),
  )
  return { top, counts }
}

async function fetchGenreIds(mediaType: string, mediaId: number): Promise<number[]> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${mediaId}?api_key=${TMDB_KEY}&language=es-AR`,
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.genre_ids ?? data.genres?.map((g: { id: number }) => g.id) ?? []) as number[]
  } catch { return [] }
}

// fetch genre_ids for items missing them (max `limit` TMDB calls)
async function enrichGenres(
  items: { media_id: number; media_type: string; genre_ids: number[] | null }[],
  limit = 10,
): Promise<{ genre_ids: number[] | null }[]> {
  let tmdbCalls = 0
  return Promise.all(
    items.map(async item => {
      if ((item.genre_ids?.length ?? 0) > 0) return item
      if (tmdbCalls >= limit) return item
      tmdbCalls++
      const ids = await fetchGenreIds(item.media_type, item.media_id)
      return { ...item, genre_ids: ids }
    }),
  )
}

function compatColor(score: number): string {
  if (score >= 70) return '#1DB954'
  if (score >= 40) return '#F59E0B'
  return '#EF4444'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function UserAvatar({ profile, size = 9 }: { profile: Profile; size?: number }) {
  const username = profile.username ?? '?'
  const cls = `w-${size} h-${size} rounded-full bg-zinc-700 overflow-hidden ring-2 ring-zinc-600 hover:ring-emerald-500 transition-all shrink-0`
  return (
    <div className={cls}>
      {profile.avatar_url ? (
        <img src={profile.avatar_url} alt={username} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-400">
          {username[0]?.toUpperCase()}
        </div>
      )}
    </div>
  )
}

function ActivityBadge({ type }: { type: ActivityItem['type'] }) {
  const styles = {
    review:  'bg-emerald-900/50 text-emerald-400',
    watched: 'bg-zinc-700 text-zinc-400',
    rating:  'bg-yellow-900/50 text-yellow-400',
  }
  const labels = { review: 'Reseña', watched: 'Vio', rating: 'Valoró' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[type]}`}>
      {labels[type]}
    </span>
  )
}

function ActivityCard({
  item,
  currentUserId,
  profiles,
  onToggleLike,
}: {
  item: ActivityItem
  currentUserId: string
  profiles: Map<string, Profile>
  onToggleLike: (reviewId: string) => void
}) {
  const profile = profiles.get(item.userId)
  const username = profile?.username ?? 'Usuario'
  const mediaHref = `/${item.mediaType}/${item.mediaId}`
  const liked = item.likes?.some(l => l.user_id === currentUserId) ?? false
  const likeCount = item.likes?.length ?? 0

  return (
    <div className="bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <Link href={`/usuario/${username}`}>
          {profile ? <UserAvatar profile={profile} /> : (
            <div className="w-9 h-9 rounded-full bg-zinc-700 shrink-0" />
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            <Link
              href={`/usuario/${username}`}
              className="text-sm font-semibold text-white hover:text-emerald-400 transition-colors"
            >
              {username}
            </Link>
            {isVerified(username) && <VerifiedBadge />}
            <ActivityBadge type={item.type} />
          </div>
          <p className="text-xs text-zinc-500">{timeAgo(item.sortTime)}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-3">
        <Link href={mediaHref} className="shrink-0">
          <div className="relative w-14 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-700">
            {item.posterPath ? (
              <Image
                src={getPosterUrl(item.posterPath, 'w92')}
                alt={item.title}
                fill
                className="object-cover"
                sizes="56px"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center p-1">
                Sin imagen
              </div>
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <Link
            href={mediaHref}
            className="text-sm font-semibold text-white hover:text-emerald-400 transition-colors line-clamp-1 block mb-1.5"
          >
            {item.title}
          </Link>

          {/* Rating row */}
          {item.rating != null && (
            <div className="mb-1.5">
              <StarDisplay rating={item.rating} size={12} />
            </div>
          )}

          {/* Review body */}
          {item.body && (
            <p className="text-sm text-zinc-300 line-clamp-4 leading-relaxed">{item.body}</p>
          )}

          {/* Actions */}
          {item.type === 'review' && item.reviewId && (
            <div className="flex items-center gap-4 mt-2.5">
              <button
                onClick={() => onToggleLike(item.reviewId!)}
                className={`flex items-center gap-1.5 text-xs transition-colors ${
                  liked ? 'text-red-400' : 'text-zinc-500 hover:text-red-400'
                }`}
              >
                <Heart size={13} fill={liked ? 'currentColor' : 'none'} />
                {likeCount > 0 ? `${likeCount} me gusta` : 'Me gusta'}
              </button>
              <Link
                href={`/review/${item.reviewId}`}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <MessageCircle size={13} />
                Comentar
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CompatCard({ item, profiles }: { item: CompatItem; profiles: Map<string, Profile> }) {
  const profile = profiles.get(item.userId)
  const username = profile?.username ?? 'Usuario'
  const color = compatColor(item.score)
  const genreName = item.sharedGenreId ? GENRE_MAP[item.sharedGenreId] : null
  const label =
    item.score === 0 ? 'Sin datos suficientes'
    : genreName ? `Ambos aman ${genreName}`
    : item.score >= 70 ? 'Gustos muy similares'
    : item.score >= 40 ? 'Algunos gustos en común'
    : 'Gustos muy diferentes'

  return (
    <Link
      href={`/usuario/${username}`}
      className="flex items-center gap-3 bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-4 hover:border-zinc-600 transition-colors"
    >
      {profile ? <UserAvatar profile={profile} size={10} /> : (
        <div className="w-10 h-10 rounded-full bg-zinc-700 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold text-white">{username}</span>
            {isVerified(username) && <VerifiedBadge />}
          </div>
          <span className="text-sm font-bold tabular-nums" style={{ color }}>
            {item.score}%
          </span>
        </div>
        <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden mb-1.5">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${item.score}%`, backgroundColor: color }}
          />
        </div>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </Link>
  )
}

function AchievementCard({ a }: { a: Achievement }) {
  const pct = Math.min(Math.round((a.current / a.target) * 100), 100)
  return (
    <div className={`flex items-start gap-3.5 rounded-xl p-4 border transition-colors ${
      a.completed ? 'bg-emerald-950/30 border-emerald-800/40' : 'bg-zinc-800/50 border-zinc-700/40'
    }`}>
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0"
        style={{ backgroundColor: a.completed ? 'rgba(29,185,84,0.15)' : 'rgba(39,39,42,0.6)' }}
      >
        {a.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="font-semibold text-sm text-white leading-tight">{a.name}</p>
          {a.completed && (
            <span className="text-xs font-semibold text-emerald-400 shrink-0">¡Completado!</span>
          )}
        </div>
        <p className="text-xs text-zinc-500 mb-2 leading-snug">{a.description}</p>
        <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden mb-1.5">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: '#1DB954' }}
          />
        </div>
        <p className="text-xs" style={{ color: a.completed ? '#1DB954' : '#71717a' }}>
          {a.completed
            ? `✓ ${a.current} de ${a.target}`
            : `${a.current} de ${a.target} · Faltan ${a.target - a.current}`}
        </p>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
        active
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'activity' | 'compat' | 'achievements'

export default function SiguiendoPage() {
  const supabase = createClient()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('activity')
  const [loadingBase, setLoadingBase] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map())

  // Activity
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Compatibility
  const [compatItems, setCompatItems] = useState<CompatItem[]>([])
  const [compatLoading, setCompatLoading] = useState(false)
  const [compatLoaded, setCompatLoaded] = useState(false)

  // Achievements
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [achievementsLoading, setAchievementsLoading] = useState(false)
  const [achievementsLoaded, setAchievementsLoaded] = useState(false)

  // ── Step 1: auth + follows + profiles ──────────────────────────────────────
  useEffect(() => {
    async function bootstrap() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoadingBase(false); return }
      setCurrentUserId(user.id)

      const { data: followRows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)

      const ids = (followRows ?? []).map((r: { following_id: string }) => r.following_id)
      setFollowingIds(ids)

      if (ids.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', ids)
        const map = new Map<string, Profile>()
        for (const p of (profileRows ?? []) as Profile[]) map.set(p.id, p)
        setProfiles(map)
      }

      setLoadingBase(false)
    }
    bootstrap()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Step 2: activity feed ──────────────────────────────────────────────────
  useEffect(() => {
    if (followingIds.length === 0) return
    setActivityLoading(true)

    async function loadActivity() {
      const [reviewsRes, watchedRes, ratingsRes] = await Promise.all([
        supabase
          .from('reviews')
          .select('id, user_id, media_id, media_type, title, poster_path, rating, body, recommended, created_at, review_likes(user_id)')
          .in('user_id', followingIds)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('watched')
          .select('id, user_id, media_id, media_type, title, poster_path, watched_at')
          .in('user_id', followingIds)
          .order('watched_at', { ascending: false })
          .limit(50),
        supabase
          .from('ratings')
          .select('id, user_id, media_id, media_type, title, poster_path, rating, rated_at')
          .in('user_id', followingIds)
          .order('rated_at', { ascending: false })
          .limit(50),
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reviewItems: ActivityItem[] = ((reviewsRes.data ?? []) as any[]).map(r => ({
        key: `review-${r.id}`,
        type: 'review' as const,
        userId: r.user_id,
        sortTime: r.created_at,
        reviewId: r.id,
        mediaId: r.media_id,
        mediaType: r.media_type,
        title: r.title,
        posterPath: r.poster_path,
        rating: r.rating,
        body: r.body,
        recommended: r.recommended,
        likes: r.review_likes ?? [],
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const watchedItems: ActivityItem[] = ((watchedRes.data ?? []) as any[]).map(w => ({
        key: `watched-${w.id}`,
        type: 'watched' as const,
        userId: w.user_id,
        sortTime: w.watched_at,
        mediaId: w.media_id,
        mediaType: w.media_type,
        title: w.title,
        posterPath: w.poster_path,
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ratingItems: ActivityItem[] = ((ratingsRes.data ?? []) as any[]).map(r => ({
        key: `rating-${r.id}`,
        type: 'rating' as const,
        userId: r.user_id,
        sortTime: r.rated_at,
        mediaId: r.media_id,
        mediaType: r.media_type,
        title: r.title,
        posterPath: r.poster_path,
        rating: r.rating,
      }))

      const merged = [...reviewItems, ...watchedItems, ...ratingItems]
        .sort((a, b) => b.sortTime.localeCompare(a.sortTime))

      setActivityItems(merged)
      setActivityLoading(false)
    }

    loadActivity()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followingIds])

  // ── Step 3: compatibility (lazy) ───────────────────────────────────────────
  const loadCompat = useCallback(async () => {
    if (!currentUserId || followingIds.length === 0) {
      setCompatItems([])
      setCompatLoaded(true)
      return
    }
    setCompatLoading(true)

    // Fetch current user's watched
    const { data: myWatched } = await supabase
      .from('watched')
      .select('media_id, media_type, genre_ids')
      .eq('user_id', currentUserId)
      .order('watched_at', { ascending: false })
      .limit(50)

    const myEnriched = await enrichGenres(
      (myWatched ?? []) as { media_id: number; media_type: string; genre_ids: number[] | null }[],
      15,
    )
    const { top: myTop, counts: myCounts } = topGenreSet(myEnriched)

    // Fetch each friend's watched and calculate score
    const results = await Promise.all(
      followingIds.map(async (friendId) => {
        const { data: friendWatched } = await supabase
          .from('watched')
          .select('media_id, media_type, genre_ids')
          .eq('user_id', friendId)
          .order('watched_at', { ascending: false })
          .limit(30)

        const friendEnriched = await enrichGenres(
          (friendWatched ?? []) as { media_id: number; media_type: string; genre_ids: number[] | null }[],
          10,
        )
        const { top: friendTop } = topGenreSet(friendEnriched)
        const score = jaccardScore(myTop, friendTop)

        // Find best shared genre (highest count in my history that's also in friend's top)
        const shared = [...myTop].filter(g => friendTop.has(g))
        const bestShared = shared.sort((a, b) => (myCounts[b] ?? 0) - (myCounts[a] ?? 0))[0] ?? null

        return { userId: friendId, score, sharedGenreId: bestShared }
      }),
    )

    setCompatItems(results.sort((a, b) => b.score - a.score))
    setCompatLoading(false)
    setCompatLoaded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, followingIds])

  useEffect(() => {
    if (tab === 'compat' && !compatLoaded) loadCompat()
  }, [tab, compatLoaded, loadCompat])

  // ── Achievements (lazy) ────────────────────────────────────────────────────
  const loadAchievements = useCallback(async () => {
    if (!currentUserId) { setAchievementsLoaded(true); return }
    setAchievementsLoading(true)
    const uid = currentUserId

    // --- Parallel Supabase queries ---
    const [
      totalRes, moviesRes, tvRes,
      reviewsRes, followingRes, followersRes,
      reviewBodiesRes, watchedItemsRes,
    ] = await Promise.all([
      supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('media_type', 'movie'),
      supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('media_type', 'tv'),
      supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
      supabase.from('reviews').select('body').eq('user_id', uid),
      supabase.from('watched').select('media_id, media_type, genre_ids').eq('user_id', uid).limit(200),
    ])

    const totalWatched  = totalRes.count ?? 0
    const totalMovies   = moviesRes.count ?? 0
    const totalTV       = tvRes.count ?? 0
    const totalReviews  = reviewsRes.count ?? 0
    const totalFollowing = followingRes.count ?? 0
    const totalFollowers = followersRes.count ?? 0
    const longReviews   = (reviewBodiesRes.data ?? []).filter(r => (r.body?.length ?? 0) >= 200).length

    type WRow = { media_id: number; media_type: string; genre_ids: number[] | null }
    const watchedRows = (watchedItemsRes.data ?? []) as WRow[]

    // --- Collect items that need TMDB (missing genre_ids OR is a movie) ---
    const toFetch = new Map<string, { media_id: number; media_type: string }>()
    for (const row of watchedRows) {
      const key = `${row.media_type}:${row.media_id}`
      if ((row.genre_ids?.length ?? 0) === 0 || row.media_type === 'movie') {
        toFetch.set(key, { media_id: row.media_id, media_type: row.media_type })
      }
    }

    // --- Fetch TMDB with concurrency 5, capped at 80 ---
    type TmdbData = { genre_ids: number[]; original_language?: string; release_date?: string }
    const tmdbCache = new Map<string, TmdbData>()
    const fetchList = [...toFetch.values()].slice(0, 80)

    await runConcurrently(fetchList.map(({ media_id, media_type }) => async () => {
      const key = `${media_type}:${media_id}`
      try {
        const res = await fetch(`https://api.themoviedb.org/3/${media_type}/${media_id}?api_key=${TMDB_KEY}&language=es-AR`)
        if (!res.ok) return
        const d = await res.json()
        tmdbCache.set(key, {
          genre_ids: d.genre_ids ?? d.genres?.map((g: { id: number }) => g.id) ?? [],
          original_language: d.original_language,
          release_date: d.release_date ?? d.first_air_date,
        })
      } catch { /* skip */ }
    }), 5)

    // --- Genre counts ---
    const genreCounts: Record<number, number> = {}
    for (const row of watchedRows) {
      const genres = (row.genre_ids?.length ?? 0) > 0
        ? row.genre_ids!
        : (tmdbCache.get(`${row.media_type}:${row.media_id}`)?.genre_ids ?? [])
      for (const gid of genres) genreCounts[gid] = (genreCounts[gid] ?? 0) + 1
    }

    // --- Unique languages (movies only) ---
    const langs = new Set<string>()
    for (const row of watchedRows.filter(r => r.media_type === 'movie')) {
      const lang = tmdbCache.get(`movie:${row.media_id}`)?.original_language
      if (lang) langs.add(lang)
    }

    // --- Classics (movies before 1980) ---
    let classics = 0
    for (const row of watchedRows.filter(r => r.media_type === 'movie')) {
      const rd = tmdbCache.get(`movie:${row.media_id}`)?.release_date
      if (rd && rd < '1980-01-01') classics++
    }

    // --- Build + sort ---
    const raw: Achievement[] = [
      { id: 'first',      emoji: '🎬', name: 'Primera vez',              description: 'Marcá tu primera película o serie como vista',     current: Math.min(totalWatched, 1),           target: 1   },
      { id: 'ten',        emoji: '🍿', name: 'Cinéfilo en progreso',      description: 'Ver 10 películas',                                  current: Math.min(totalMovies, 10),           target: 10  },
      { id: 'hundred',    emoji: '🏆', name: 'Centenar de películas',     description: 'Ver 100 películas',                                 current: Math.min(totalMovies, 100),          target: 100 },
      { id: 'critic',     emoji: '⭐', name: 'Crítico nato',              description: 'Escribir 5 reseñas',                               current: Math.min(totalReviews, 5),           target: 5   },
      { id: 'tvfan',      emoji: '📺', name: 'Seriéfilo',                 description: 'Ver 5 series completas',                           current: Math.min(totalTV, 5),                target: 5   },
      { id: 'world',      emoji: '🌍', name: 'Viajero del cine',          description: 'Ver películas de 5 idiomas/países distintos',      current: Math.min(langs.size, 5),             target: 5   },
      { id: 'drama',      emoji: '🎭', name: 'Amante del drama',          description: 'Ver 20 dramas',                                    current: Math.min(genreCounts[18] ?? 0, 20),  target: 20  },
      { id: 'comedy',     emoji: '😂', name: 'Rey de la comedia',         description: 'Ver 20 comedias',                                  current: Math.min(genreCounts[35] ?? 0, 20),  target: 20  },
      { id: 'horror',     emoji: '👻', name: 'Valiente',                  description: 'Ver 10 películas de terror',                       current: Math.min(genreCounts[27] ?? 0, 10),  target: 10  },
      { id: 'scifi',      emoji: '🤖', name: 'Explorador del futuro',     description: 'Ver 10 películas de ciencia ficción',              current: Math.min(genreCounts[878] ?? 0, 10), target: 10  },
      { id: 'thriller',   emoji: '🕵️', name: 'Maestro del suspenso',     description: 'Ver 10 thrillers',                                 current: Math.min(genreCounts[53] ?? 0, 10),  target: 10  },
      { id: 'classic',    emoji: '🎞️', name: 'Clásico imprescindible',   description: 'Ver 5 películas anteriores a 1980',                current: Math.min(classics, 5),               target: 5   },
      { id: 'social',     emoji: '❤️', name: 'Social',                   description: 'Seguir a 5 usuarios',                             current: Math.min(totalFollowing, 5),          target: 5   },
      { id: 'writer',     emoji: '✍️', name: 'Narrador',                 description: 'Escribir una reseña de más de 200 caracteres',    current: Math.min(longReviews, 1),             target: 1   },
      { id: 'influencer', emoji: '🌟', name: 'Influencer',               description: 'Conseguir 10 seguidores',                         current: Math.min(totalFollowers, 10),         target: 10  },
    ].map(a => ({ ...a, completed: a.current >= a.target }))

    raw.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? -1 : 1
      return (b.current / b.target) - (a.current / a.target)
    })

    setAchievements(raw)
    setAchievementsLoading(false)
    setAchievementsLoaded(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId])

  useEffect(() => {
    if (tab === 'achievements' && !achievementsLoaded) loadAchievements()
  }, [tab, achievementsLoaded, loadAchievements])

  // ── Toggle like ────────────────────────────────────────────────────────────
  async function toggleLike(reviewId: string) {
    if (!currentUserId) return
    const item = activityItems.find(i => i.reviewId === reviewId)
    if (!item || item.type !== 'review') return
    const liked = item.likes?.some(l => l.user_id === currentUserId)
    if (liked) {
      await supabase.from('review_likes').delete().eq('review_id', reviewId).eq('user_id', currentUserId)
      setActivityItems(prev => prev.map(i =>
        i.reviewId === reviewId
          ? { ...i, likes: (i.likes ?? []).filter(l => l.user_id !== currentUserId) }
          : i,
      ))
    } else {
      await supabase.from('review_likes').insert({ review_id: reviewId, user_id: currentUserId })
      setActivityItems(prev => prev.map(i =>
        i.reviewId === reviewId
          ? { ...i, likes: [...(i.likes ?? []), { user_id: currentUserId }] }
          : i,
      ))
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loadingBase) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!currentUserId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <LogIn size={40} className="text-zinc-600" />
        <p className="text-zinc-400">Iniciá sesión para ver la actividad de tus seguidos</p>
        <Link
          href="/auth"
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg font-medium transition-colors"
        >
          Iniciar sesión
        </Link>
      </div>
    )
  }

  const visibleItems = activityItems.slice(0, visibleCount)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <h1 className="text-2xl font-bold mb-5 flex items-center gap-2">
        <Users size={22} />
        Siguiendo
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
        <TabButton
          active={tab === 'activity'}
          onClick={() => setTab('activity')}
          icon={<Zap size={15} />}
          label="Actividad"
        />
        <TabButton
          active={tab === 'compat'}
          onClick={() => setTab('compat')}
          icon={<Heart size={15} />}
          label="Compatibilidad"
        />
        <TabButton
          active={tab === 'achievements'}
          onClick={() => setTab('achievements')}
          icon={<Trophy size={15} />}
          label="Logros"
        />
      </div>

      {/* ── Actividad ── */}
      {tab === 'activity' && (
        <>
          {activityLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-4 animate-pulse">
                  <div className="flex gap-2.5 mb-3">
                    <div className="w-9 h-9 rounded-full bg-zinc-700 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-zinc-700 rounded w-1/3" />
                      <div className="h-2.5 bg-zinc-700 rounded w-1/5" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-14 aspect-[2/3] bg-zinc-700 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="h-3 bg-zinc-700 rounded w-2/3" />
                      <div className="h-2.5 bg-zinc-700 rounded w-full" />
                      <div className="h-2.5 bg-zinc-700 rounded w-5/6" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : followingIds.length === 0 ? (
            <div className="text-center py-20">
              <Users size={40} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-zinc-400 mb-1">Seguí a otros usuarios para ver su actividad acá</p>
              <p className="text-zinc-600 text-sm">Buscá usuarios desde sus perfiles para comenzar a seguirlos.</p>
            </div>
          ) : activityItems.length === 0 ? (
            <div className="text-center py-20">
              <Zap size={40} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-zinc-400">Todavía no hay actividad de tus seguidos.</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {visibleItems.map(item => (
                  <ActivityCard
                    key={item.key}
                    item={item}
                    currentUserId={currentUserId}
                    profiles={profiles}
                    onToggleLike={toggleLike}
                  />
                ))}
              </div>
              {visibleCount < activityItems.length && (
                <button
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="mt-5 w-full py-2.5 rounded-xl border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 text-sm font-medium transition-colors"
                >
                  Ver más ({activityItems.length - visibleCount} restantes)
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* ── Compatibilidad ── */}
      {tab === 'compat' && (
        <>
          {compatLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-4 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-zinc-700 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                      <div className="h-3 bg-zinc-700 rounded w-1/3" />
                      <div className="h-3 bg-zinc-700 rounded w-10" />
                    </div>
                    <div className="h-1.5 bg-zinc-700 rounded-full w-full" />
                    <div className="h-2.5 bg-zinc-700 rounded w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : followingIds.length === 0 ? (
            <div className="text-center py-20">
              <Heart size={40} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-zinc-400">Seguí usuarios para ver tu compatibilidad con ellos.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-500 mb-4">
                Calculado según los géneros más vistos por vos y cada usuario.
              </p>
              <div className="space-y-3">
                {compatItems.map(item => (
                  <CompatCard key={item.userId} item={item} profiles={profiles} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Logros ── */}
      {tab === 'achievements' && (
        <>
          {achievementsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3.5 bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-4 animate-pulse">
                  <div className="w-12 h-12 rounded-full bg-zinc-700 shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3.5 bg-zinc-700 rounded w-1/3" />
                    <div className="h-2.5 bg-zinc-700 rounded w-2/3" />
                    <div className="h-1.5 bg-zinc-700 rounded-full w-full mt-3" />
                    <div className="h-2.5 bg-zinc-700 rounded w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-zinc-500">
                  {achievements.filter(a => a.completed).length} de {achievements.length} logros completados
                </p>
                <span className="text-xs font-semibold text-emerald-400">
                  {achievements.filter(a => a.completed).length}/{achievements.length}
                </span>
              </div>
              {achievements.filter(a => a.completed).length > 0 && (
                <p className="text-xs text-zinc-600 uppercase tracking-wider font-semibold mb-2">Completados</p>
              )}
              <div className="space-y-3">
                {achievements.filter(a => a.completed).map(a => <AchievementCard key={a.id} a={a} />)}
              </div>
              {achievements.filter(a => !a.completed).length > 0 && (
                <p className="text-xs text-zinc-600 uppercase tracking-wider font-semibold mt-5 mb-2">En progreso</p>
              )}
              <div className="space-y-3">
                {achievements.filter(a => !a.completed).map(a => <AchievementCard key={a.id} a={a} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
