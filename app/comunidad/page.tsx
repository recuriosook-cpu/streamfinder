'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Users, LogIn, Heart, MessageCircle, Bookmark, Plus, Check, BarChart2, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import VerifiedBadge, { isVerified } from '@/components/VerifiedBadge'
import StarDisplay from '@/components/StarDisplay'
import type { User } from '@supabase/supabase-js'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB = 'https://api.themoviedb.org/3'
const PAGE_SIZE = 20

// ── Genre map (name → TMDB id) ────────────────────────────────────────────────

const GENRE_TO_ID: Record<string, number> = {
  'Acción': 28, 'Comedia': 35, 'Drama': 18, 'Terror': 27,
  'Ciencia ficción': 878, 'Thriller': 53, 'Animación': 16,
  'Romance': 10749, 'Documental': 99, 'Aventura': 12,
  'Fantasía': 14, 'Misterio': 9648, 'Historia': 36,
  'Crimen': 80, 'Musical': 10402, 'Western': 37, 'Guerra': 10752, 'Familia': 10751,
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile { id: string; username: string | null; display_name: string | null; avatar_url: string | null }

interface ReviewFeed {
  key: string; type: 'review'; userId: string; sortTime: string
  reviewId: string; mediaId: number; mediaType: string
  mediaTitle: string; mediaPosterPath: string | null
  rating: number | null; body: string | null
  likeCount: number; likedByMe: boolean
}
interface RatingFeed {
  key: string; type: 'rating'; userId: string; sortTime: string
  mediaId: number; mediaType: string
  mediaTitle: string; mediaPosterPath: string | null; rating: number
}
interface WatchlistFeed {
  key: string; type: 'watchlist'; userId: string; sortTime: string
  mediaId: number; mediaType: string; mediaTitle: string; mediaPosterPath: string | null
}
interface SharedStatFeed {
  key: string; type: 'shared_stat'; userId: string; sortTime: string
  statId: string; statTitle: string; statValue: string; statDetail: string | null; statImageUrl: string | null
  likeCount: number; likedByMe: boolean
}
interface LevelUpFeed {
  key: string; type: 'level_up'; userId: string; sortTime: string; levelName: string
}
interface RecommendationFeed {
  key: string; type: 'recommendation'
  movieId: number; title: string; year: string
  posterPath: string | null; backdropPath: string | null
}

type FeedItem = ReviewFeed | RatingFeed | WatchlistFeed | SharedStatFeed | LevelUpFeed | RecommendationFeed

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function Badge({ label, color }: { label: string; color: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    green:  { bg: 'rgba(34,197,94,0.12)',   text: '#22c55e' },
    yellow: { bg: 'rgba(234,179,8,0.12)',   text: '#eab308' },
    blue:   { bg: 'rgba(59,130,246,0.12)',  text: '#60a5fa' },
    purple: { bg: 'rgba(107,63,231,0.12)',  text: '#6B3FE7' },
    gold:   { bg: 'rgba(245,166,35,0.12)',  text: '#F5A623' },
  }
  const s = styles[color] ?? styles.purple
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: s.bg, color: s.text }}>
      {label}
    </span>
  )
}

function Avatar({ profile, size = 9 }: { profile: UserProfile; size?: number }) {
  const name = profile.display_name ?? profile.username ?? '?'
  const px = size * 4
  return (
    <Link href={`/usuario/${profile.username}`} className="shrink-0">
      <div
        className="rounded-full overflow-hidden bg-zinc-700 ring-2 ring-zinc-600 hover:ring-[#6B3FE7] transition-all"
        style={{ width: px, height: px }}
      >
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[#A0A0B0]">
            {name[0]?.toUpperCase()}
          </div>
        )}
      </div>
    </Link>
  )
}

function Poster({ path, title, mediaType, mediaId, size = 14 }: {
  path: string | null; title: string; mediaType: string; mediaId: number; size?: number
}) {
  const px = size * 4
  return (
    <Link href={`/${mediaType}/${mediaId}`} className="shrink-0">
      <div
        className="rounded-lg overflow-hidden bg-[#1C1C27]"
        style={{ width: px, aspectRatio: '2/3' }}
      >
        {path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w92${path}`}
            alt={title}
            width={px}
            height={Math.round(px * 1.5)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#A0A0B0] text-[9px] text-center p-1">{title}</div>
        )}
      </div>
    </Link>
  )
}

// ── Feed cards ────────────────────────────────────────────────────────────────

function ReviewCard({ item, profiles, currentUserId, onLike }: {
  item: ReviewFeed; profiles: Map<string, UserProfile>; currentUserId: string; onLike: (id: string) => void
}) {
  const p = profiles.get(item.userId)
  if (!p) return null
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Avatar profile={p} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <Link href={`/usuario/${p.username}`} className="text-sm font-semibold text-white hover:text-[#6B3FE7] transition-colors">
              {p.display_name ?? p.username}
            </Link>
            {isVerified(p.username) && <VerifiedBadge size={13} />}
            <Badge label="Reseña" color="green" />
            <span className="text-[11px] text-[#A0A0B0] ml-auto shrink-0">{timeAgo(item.sortTime)}</span>
          </div>
          <div className="flex gap-3 mt-2">
            <Poster path={item.mediaPosterPath} title={item.mediaTitle} mediaType={item.mediaType} mediaId={item.mediaId} />
            <div className="flex-1 min-w-0">
              <Link href={`/${item.mediaType}/${item.mediaId}`} className="text-sm font-semibold text-white hover:text-[#6B3FE7] transition-colors line-clamp-1 block">
                {item.mediaTitle}
              </Link>
              {item.rating != null && <div className="mt-1"><StarDisplay rating={item.rating} size={11} /></div>}
              {item.body && (
                <p className="text-sm text-zinc-300 line-clamp-3 leading-relaxed mt-1">{item.body}</p>
              )}
              <div className="flex items-center gap-4 mt-2">
                <button
                  onClick={() => onLike(item.reviewId)}
                  className={`flex items-center gap-1.5 text-xs transition-colors ${item.likedByMe ? 'text-red-400' : 'text-[#A0A0B0] hover:text-red-400'}`}
                >
                  <Heart size={13} fill={item.likedByMe ? 'currentColor' : 'none'} />
                  {item.likeCount > 0 ? `${item.likeCount} me gusta` : 'Me gusta'}
                </button>
                <Link href={`/review/${item.reviewId}`} className="flex items-center gap-1.5 text-xs text-[#A0A0B0] hover:text-zinc-300 transition-colors">
                  <MessageCircle size={13} />
                  Comentar
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RatingCard({ item, profiles }: { item: RatingFeed; profiles: Map<string, UserProfile> }) {
  const p = profiles.get(item.userId)
  if (!p) return null
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Avatar profile={p} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <Link href={`/usuario/${p.username}`} className="text-sm font-semibold text-white hover:text-[#6B3FE7] transition-colors">
              {p.display_name ?? p.username}
            </Link>
            {isVerified(p.username) && <VerifiedBadge size={13} />}
            <Badge label="Valoró" color="yellow" />
            <span className="text-[11px] text-[#A0A0B0] ml-auto shrink-0">{timeAgo(item.sortTime)}</span>
          </div>
          <div className="flex gap-3 mt-2">
            <Poster path={item.mediaPosterPath} title={item.mediaTitle} mediaType={item.mediaType} mediaId={item.mediaId} />
            <div className="min-w-0">
              <Link href={`/${item.mediaType}/${item.mediaId}`} className="text-sm font-semibold text-white hover:text-[#6B3FE7] transition-colors line-clamp-1 block mb-1.5">
                {item.mediaTitle}
              </Link>
              <StarDisplay rating={item.rating} size={14} />
              <p className="text-xs text-[#A0A0B0] mt-1">Le dio {item.rating}/5 ⭐</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function WatchlistCard({ item, profiles, currentUserId, onAdd }: {
  item: WatchlistFeed; profiles: Map<string, UserProfile>; currentUserId: string
  onAdd: (mediaId: number, mediaType: string, title: string, posterPath: string | null) => Promise<boolean>
}) {
  const p = profiles.get(item.userId)
  const [added, setAdded] = useState(false)
  const [adding, setAdding] = useState(false)
  if (!p) return null
  const isOwn = item.userId === currentUserId
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Avatar profile={p} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <Link href={`/usuario/${p.username}`} className="text-sm font-semibold text-white hover:text-[#6B3FE7] transition-colors">
              {p.display_name ?? p.username}
            </Link>
            {isVerified(p.username) && <VerifiedBadge size={13} />}
            <Badge label="Quiere ver" color="blue" />
            <span className="text-[11px] text-[#A0A0B0] ml-auto shrink-0">{timeAgo(item.sortTime)}</span>
          </div>
          <div className="flex gap-3 mt-2">
            <Poster path={item.mediaPosterPath} title={item.mediaTitle} mediaType={item.mediaType} mediaId={item.mediaId} />
            <div className="min-w-0 flex flex-col gap-2">
              <Link href={`/${item.mediaType}/${item.mediaId}`} className="text-sm font-semibold text-white hover:text-[#6B3FE7] transition-colors line-clamp-1 block">
                {item.mediaTitle}
              </Link>
              {!isOwn && (
                <button
                  onClick={async () => {
                    if (added || adding) return
                    setAdding(true)
                    const ok = await onAdd(item.mediaId, item.mediaType, item.mediaTitle, item.mediaPosterPath)
                    if (ok) setAdded(true)
                    setAdding(false)
                  }}
                  disabled={added || adding}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full self-start transition-all"
                  style={{
                    backgroundColor: added ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)',
                    color: added ? '#22c55e' : '#60a5fa',
                  }}
                >
                  {added ? <Check size={12} /> : <Plus size={12} />}
                  {added ? 'Agregado' : 'Agregar a mi lista'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SharedStatCard({ item, profiles, currentUserId, onLike }: {
  item: SharedStatFeed; profiles: Map<string, UserProfile>; currentUserId: string; onLike: (id: string) => void
}) {
  const p = profiles.get(item.userId)
  if (!p) return null
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
      <div className="flex items-start gap-3">
        <Avatar profile={p} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            <Link href={`/usuario/${p.username}`} className="text-sm font-semibold text-white hover:text-[#6B3FE7] transition-colors">
              {p.display_name ?? p.username}
            </Link>
            {isVerified(p.username) && <VerifiedBadge size={13} />}
            <Badge label="Estadística" color="purple" />
            <span className="text-[11px] text-[#A0A0B0] ml-auto shrink-0">{timeAgo(item.sortTime)}</span>
          </div>
          <div className="flex gap-3 items-center bg-[#1C1C27]/60 rounded-xl p-3 border border-[#2A2A3A]">
            {item.statImageUrl ? (
              <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 bg-zinc-700">
                <Image src={item.statImageUrl} alt={item.statValue} width={48} height={48} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
                <BarChart2 size={20} className="text-[#A0A0B0]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#A0A0B0]">{item.statTitle}</p>
              <p className="text-base font-bold" style={{ color: '#6B3FE7' }}>{item.statValue}</p>
              {item.statDetail && <p className="text-xs text-[#A0A0B0] mt-0.5">{item.statDetail}</p>}
            </div>
          </div>
          <div className="mt-2.5">
            <button
              onClick={() => onLike(item.statId)}
              className={`flex items-center gap-1.5 text-xs transition-colors ${item.likedByMe ? 'text-red-400' : 'text-[#A0A0B0] hover:text-red-400'}`}
            >
              <Heart size={13} fill={item.likedByMe ? 'currentColor' : 'none'} />
              {item.likeCount > 0 ? `${item.likeCount} me gusta` : 'Me gusta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LevelUpCard({ item, profiles }: { item: LevelUpFeed; profiles: Map<string, UserProfile> }) {
  const p = profiles.get(item.userId)
  if (!p) return null
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
      <div className="flex items-center gap-3">
        <Avatar profile={p} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link href={`/usuario/${p.username}`} className="text-sm font-semibold text-white hover:text-[#6B3FE7] transition-colors">
              {p.display_name ?? p.username}
            </Link>
            {isVerified(p.username) && <VerifiedBadge size={13} />}
            <Badge label="Logro" color="gold" />
            <span className="text-[11px] text-[#A0A0B0] ml-auto shrink-0">{timeAgo(item.sortTime)}</span>
          </div>
          <p className="text-sm text-[#A0A0B0] mt-1">
            🎉 Subió al nivel{' '}
            <span className="font-semibold" style={{ color: '#F5A623' }}>{item.levelName}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function RecommendationCard({ item, currentUserId, supabase }: {
  item: RecommendationFeed; currentUserId: string
  supabase: ReturnType<typeof createClient>
}) {
  const [watched,   setWatched]   = useState(false)
  const [liked,     setLiked]     = useState(false)
  const [watchlist, setWatchlist] = useState(false)
  const [busy,      setBusy]      = useState(false)

  const act = async (type: 'watched' | 'liked' | 'watchlist') => {
    if (busy || !currentUserId) return
    setBusy(true)
    const base = { user_id: currentUserId, media_id: item.movieId, media_type: 'movie', title: item.title, poster_path: item.posterPath }
    if (type === 'watched') {
      if (!watched) await supabase.from('watched').upsert({ ...base, watched_at: new Date().toISOString() }, { onConflict: 'user_id,media_id,media_type' })
      else await supabase.from('watched').delete().eq('user_id', currentUserId).eq('media_id', item.movieId).eq('media_type', 'movie')
      setWatched(v => !v)
    }
    if (type === 'liked') {
      if (!liked) await supabase.from('favorites').upsert({ ...base, genre_ids: [] }, { onConflict: 'user_id,media_id,media_type' })
      else await supabase.from('favorites').delete().eq('user_id', currentUserId).eq('media_id', item.movieId).eq('media_type', 'movie')
      setLiked(v => !v)
    }
    if (type === 'watchlist') {
      if (!watchlist) await supabase.from('watchlist').upsert(base, { onConflict: 'user_id,media_id,media_type' })
      else await supabase.from('watchlist').delete().eq('user_id', currentUserId).eq('media_id', item.movieId).eq('media_type', 'movie')
      setWatchlist(v => !v)
    }
    setBusy(false)
  }

  return (
    <div className="bg-[#13131A] border border-[#6B3FE7]/40 rounded-xl overflow-hidden">
      {/* Backdrop header */}
      {item.backdropPath && (
        <div className="relative h-24 w-full overflow-hidden">
          <Image src={`https://image.tmdb.org/t/p/w780${item.backdropPath}`} alt={item.title} fill className="object-cover opacity-40" sizes="600px" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#13131A] via-transparent to-[#13131A]" />
        </div>
      )}
      <div className="p-4 -mt-2">
        <div className="flex gap-3 items-start">
          <Link href={`/movie/${item.movieId}`} className="shrink-0">
            <div className="w-14 aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27]" style={{ marginTop: item.backdropPath ? '-32px' : 0 }}>
              {item.posterPath ? (
                <Image src={`https://image.tmdb.org/t/p/w185${item.posterPath}`} alt={item.title} width={56} height={84} className="w-full h-full object-cover" />
              ) : null}
            </div>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={12} style={{ color: '#6B3FE7' }} />
              <span className="text-[10px] font-semibold" style={{ color: '#6B3FE7' }}>Recomendado para vos</span>
            </div>
            <Link href={`/movie/${item.movieId}`} className="text-sm font-semibold text-white hover:text-[#6B3FE7] transition-colors line-clamp-1 block">
              {item.title}
            </Link>
            {item.year && <p className="text-xs text-[#A0A0B0] mt-0.5">{item.year}</p>}
            <div className="flex gap-2 mt-2.5 flex-wrap">
              {[
                { type: 'watched' as const, label: watched ? '✓ Vista' : '👁 Ya la vi',    active: watched, color: '#22c55e' },
                { type: 'liked'   as const, label: liked   ? '♥ Gustó'  : '♡ Me gusta',   active: liked,   color: '#ef4444' },
                { type: 'watchlist' as const, label: watchlist ? '✓ En lista' : '🔖 Ver después', active: watchlist, color: '#60a5fa' },
              ].map(btn => (
                <button
                  key={btn.type}
                  onClick={() => act(btn.type)}
                  disabled={busy}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-all disabled:opacity-50"
                  style={{
                    backgroundColor: btn.active ? `${btn.color}22` : '#1C1C27',
                    color: btn.active ? btn.color : '#A0A0B0',
                    border: `1px solid ${btn.active ? btn.color + '60' : '#2A2A3A'}`,
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Active user card (shown when no following) ────────────────────────────────

function ActiveUserCard({ profile, currentUserId, supabase }: {
  profile: UserProfile; currentUserId: string; supabase: ReturnType<typeof createClient>
}) {
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)
  const name = profile.display_name ?? profile.username ?? 'Usuario'
  const toggle = async () => {
    if (busy || profile.id === currentUserId) return
    setBusy(true)
    if (!following) {
      await supabase.from('follows').insert({ follower_id: currentUserId, following_id: profile.id })
    } else {
      await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', profile.id)
    }
    setFollowing(v => !v)
    setBusy(false)
  }
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#13131A] border border-[#2A2A3A]">
      <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-700 shrink-0">
        {profile.avatar_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[#A0A0B0]">{name[0]?.toUpperCase()}</div>
        }
      </div>
      <div className="flex-1 min-w-0">
        <Link href={`/usuario/${profile.username}`} className="text-sm font-semibold text-white hover:text-[#6B3FE7] transition-colors block truncate">
          {name}
        </Link>
        <p className="text-xs text-[#A0A0B0] truncate">@{profile.username}</p>
      </div>
      {profile.id !== currentUserId && (
        <button
          onClick={toggle}
          disabled={busy}
          className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-all"
          style={{
            backgroundColor: following ? 'transparent' : '#6B3FE7',
            color: following ? '#A0A0B0' : '#fff',
            border: following ? '1px solid #2A2A3A' : 'none',
          }}
        >
          {following ? 'Siguiendo' : 'Seguir'}
        </button>
      )}
    </div>
  )
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-full bg-[#1C1C27] shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-[#1C1C27] rounded w-1/3" />
              <div className="flex gap-3">
                <div className="w-10 aspect-[2/3] bg-[#1C1C27] rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3 bg-[#1C1C27] rounded w-2/3" />
                  <div className="h-2.5 bg-[#1C1C27] rounded w-full" />
                  <div className="h-2.5 bg-[#1C1C27] rounded w-5/6" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ComunidadPage() {
  const supabase = useRef(createClient()).current

  const [user,          setUser]          = useState<User | null | undefined>(undefined)
  const [currentUserId, setCurrentUserId] = useState('')
  const [followingIds,  setFollowingIds]  = useState<string[]>([])
  const [profiles,      setProfiles]      = useState<Map<string, UserProfile>>(new Map())
  const [recommendations, setRecommendations] = useState<RecommendationFeed[]>([])
  const [rawFeed,       setRawFeed]       = useState<FeedItem[]>([])   // reviews+ratings+watchlist+stats+levelups
  const [displayFeed,   setDisplayFeed]   = useState<FeedItem[]>([])   // merged with recommendations
  const [visibleCount,  setVisibleCount]  = useState(PAGE_SIZE)
  const [loading,       setLoading]       = useState(true)
  const [feedLoading,   setFeedLoading]   = useState(false)
  const [activeUsers,   setActiveUsers]   = useState<UserProfile[]>([])

  // ── Step 1: auth + follows + profiles ──────────────────────────────────────
  useEffect(() => {
    async function bootstrap() {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) { setUser(null); setLoading(false); return }
      setUser(u)
      setCurrentUserId(u.id)

      const [followsRes, profileRes] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', u.id),
        supabase.from('profiles').select('favorite_genres').eq('id', u.id).maybeSingle(),
      ])

      const ids = (followsRes.data ?? []).map((r: { following_id: string }) => r.following_id)
      setFollowingIds(ids)

      // Load active users for "no following" state
      if (ids.length === 0) {
        const { data: active } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .neq('id', u.id)
          .order('points', { ascending: false, nullsFirst: false })
          .limit(6)
        setActiveUsers((active ?? []) as UserProfile[])
      }

      // Load friend profiles
      if (ids.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', ids)
        const map = new Map<string, UserProfile>()
        for (const p of (profileRows ?? []) as UserProfile[]) map.set(p.id, p)
        setProfiles(map)
      }

      setLoading(false)

      // Load recommendations based on genres
      const genres: string[] = profileRes.data?.favorite_genres ?? []
      loadRecommendations(genres)

      // Load feed
      if (ids.length > 0) loadFeed(ids, u.id)
    }
    bootstrap()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recommendations from TMDB ──────────────────────────────────────────────
  const loadRecommendations = useCallback(async (genres: string[]) => {
    if (!TMDB_KEY) return
    const genreIds = genres
      .map(g => GENRE_TO_ID[g])
      .filter(Boolean)
      .slice(0, 3)
    const genreParam = genreIds.length > 0 ? `&with_genres=${genreIds.join(',')}` : ''
    try {
      const res = await fetch(
        `${TMDB}/discover/movie?api_key=${TMDB_KEY}&language=es-AR&sort_by=vote_average.desc&vote_count.gte=500&page=1${genreParam}`
      )
      if (!res.ok) return
      const data = await res.json()
      type M = { id: number; title: string; release_date?: string; poster_path: string | null; backdrop_path: string | null }
      const recs: RecommendationFeed[] = ((data.results ?? []) as M[]).slice(0, 8).map(m => ({
        key: `rec-${m.id}`,
        type: 'recommendation',
        movieId: m.id,
        title: m.title,
        year: (m.release_date ?? '').slice(0, 4),
        posterPath: m.poster_path,
        backdropPath: m.backdrop_path,
      }))
      setRecommendations(recs)
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Feed from Supabase ─────────────────────────────────────────────────────
  const loadFeed = useCallback(async (followIds: string[], uid: string) => {
    setFeedLoading(true)
    const [reviewsRes, ratingsRes, watchlistRes, statsRes, levelUpsRes] = await Promise.all([
      supabase
        .from('reviews')
        .select('id, user_id, media_id, media_type, title, poster_path, rating, body, created_at, review_likes(user_id)')
        .in('user_id', followIds)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('ratings')
        .select('id, user_id, media_id, media_type, title, poster_path, rating, rated_at')
        .in('user_id', followIds)
        .gte('rating', 3.5)
        .order('rated_at', { ascending: false })
        .limit(40),
      supabase
        .from('watchlist')
        .select('id, user_id, media_id, media_type, title, poster_path, added_at')
        .in('user_id', followIds)
        .order('added_at', { ascending: false })
        .limit(30),
      supabase
        .from('shared_stats')
        .select('id, user_id, stat_title, stat_value, stat_detail, stat_image_url, created_at, shared_stat_likes(user_id)')
        .in('user_id', followIds)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('notifications')
        .select('id, user_id, review_title, created_at')
        .in('user_id', followIds)
        .eq('type', 'level_up')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    // Build reviewed media set to deduplicate ratings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewedSet = new Set((reviewsRes.data ?? []).map((r: any) => `${r.user_id}:${r.media_id}:${r.media_type}`))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviews: ReviewFeed[] = ((reviewsRes.data ?? []) as any[]).map(r => ({
      key: `review-${r.id}`,
      type: 'review' as const,
      userId: r.user_id,
      sortTime: r.created_at,
      reviewId: r.id,
      mediaId: r.media_id,
      mediaType: r.media_type,
      mediaTitle: r.title,
      mediaPosterPath: r.poster_path,
      rating: r.rating,
      body: r.body,
      likeCount: Array.isArray(r.review_likes) ? r.review_likes.length : 0,
      likedByMe: Array.isArray(r.review_likes) && r.review_likes.some((l: { user_id: string }) => l.user_id === uid),
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ratings: RatingFeed[] = ((ratingsRes.data ?? []) as any[])
      .filter(r => !reviewedSet.has(`${r.user_id}:${r.media_id}:${r.media_type}`))
      .map(r => ({
        key: `rating-${r.id}`,
        type: 'rating' as const,
        userId: r.user_id,
        sortTime: r.rated_at,
        mediaId: r.media_id,
        mediaType: r.media_type,
        mediaTitle: r.title,
        mediaPosterPath: r.poster_path,
        rating: r.rating,
      }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const watchlist: WatchlistFeed[] = ((watchlistRes.data ?? []) as any[]).map(w => ({
      key: `watchlist-${w.id}`,
      type: 'watchlist' as const,
      userId: w.user_id,
      sortTime: w.added_at,
      mediaId: w.media_id,
      mediaType: w.media_type,
      mediaTitle: w.title,
      mediaPosterPath: w.poster_path,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats: SharedStatFeed[] = ((statsRes.data ?? []) as any[]).map(s => ({
      key: `stat-${s.id}`,
      type: 'shared_stat' as const,
      userId: s.user_id,
      sortTime: s.created_at,
      statId: s.id,
      statTitle: s.stat_title,
      statValue: s.stat_value,
      statDetail: s.stat_detail,
      statImageUrl: s.stat_image_url,
      likeCount: Array.isArray(s.shared_stat_likes) ? s.shared_stat_likes.length : 0,
      likedByMe: Array.isArray(s.shared_stat_likes) && s.shared_stat_likes.some((l: { user_id: string }) => l.user_id === uid),
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const levelUps: LevelUpFeed[] = ((levelUpsRes.data ?? []) as any[]).map(n => ({
      key: `levelup-${n.id}`,
      type: 'level_up' as const,
      userId: n.user_id,
      sortTime: n.created_at,
      levelName: n.review_title ?? 'nuevo nivel',
    }))

    const merged = [...reviews, ...ratings, ...watchlist, ...stats, ...levelUps]
      .sort((a, b) => b.sortTime.localeCompare(a.sortTime))

    setRawFeed(merged)
    setFeedLoading(false)
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Merge feed + recommendations ───────────────────────────────────────────
  useEffect(() => {
    if (rawFeed.length === 0 && recommendations.length === 0) {
      setDisplayFeed([])
      return
    }
    const result: FeedItem[] = []
    let recIdx = 0
    rawFeed.forEach((item, i) => {
      result.push(item)
      // Insert a recommendation every 4 organic items
      if ((i + 1) % 4 === 0 && recIdx < recommendations.length) {
        result.push(recommendations[recIdx++])
      }
    })
    // Append remaining recommendations if feed is short
    if (rawFeed.length < 4 && recIdx < recommendations.length) {
      result.push(recommendations[recIdx])
    }
    setDisplayFeed(result)
  }, [rawFeed, recommendations])

  // ── Like toggles ───────────────────────────────────────────────────────────
  const toggleReviewLike = async (reviewId: string) => {
    if (!currentUserId) return
    setRawFeed(prev => prev.map(item => {
      if (item.type !== 'review' || item.reviewId !== reviewId) return item
      const liked = !item.likedByMe
      if (liked) supabase.from('review_likes').insert({ review_id: reviewId, user_id: currentUserId })
      else supabase.from('review_likes').delete().eq('review_id', reviewId).eq('user_id', currentUserId)
      return { ...item, likedByMe: liked, likeCount: item.likeCount + (liked ? 1 : -1) }
    }))
  }

  const toggleStatLike = async (statId: string) => {
    if (!currentUserId) return
    setRawFeed(prev => prev.map(item => {
      if (item.type !== 'shared_stat' || item.statId !== statId) return item
      const liked = !item.likedByMe
      if (liked) supabase.from('shared_stat_likes').insert({ stat_id: statId, user_id: currentUserId })
      else supabase.from('shared_stat_likes').delete().eq('stat_id', statId).eq('user_id', currentUserId)
      return { ...item, likedByMe: liked, likeCount: item.likeCount + (liked ? 1 : -1) }
    }))
  }

  const addToWatchlist = async (
    mediaId: number, mediaType: string, title: string, posterPath: string | null,
  ): Promise<boolean> => {
    if (!currentUserId) return false
    const { error } = await supabase.from('watchlist').upsert(
      { user_id: currentUserId, media_id: mediaId, media_type: mediaType, title, poster_path: posterPath },
      { onConflict: 'user_id,media_id,media_type' }
    )
    return !error
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Users size={22} /> Comunidad</h1>
        <FeedSkeleton />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
        <LogIn size={40} className="text-zinc-600" />
        <p className="text-[#A0A0B0]">Iniciá sesión para ver la actividad de tu comunidad</p>
        <Link href="/auth" className="bg-[#6B3FE7] hover:bg-[#5A32C7] text-white px-5 py-2 rounded-lg font-medium transition-colors">
          Iniciar sesión
        </Link>
      </div>
    )
  }

  const visibleItems = displayFeed.slice(0, visibleCount)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Users size={22} />
        Comunidad
      </h1>

      {/* No following banner */}
      {followingIds.length === 0 && (
        <div className="mb-6 bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <p className="text-sm font-semibold text-white mb-1">Seguí a otros usuarios para ver su actividad acá</p>
          <p className="text-xs text-[#A0A0B0] mb-4">Descubrí qué están viendo y leyendo otros cinéfilos.</p>
          {activeUsers.length > 0 && (
            <div className="space-y-2">
              {activeUsers.map(u => (
                <ActiveUserCard key={u.id} profile={u} currentUserId={currentUserId} supabase={supabase} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Feed */}
      {feedLoading ? (
        <FeedSkeleton />
      ) : displayFeed.length === 0 && followingIds.length > 0 ? (
        <div className="text-center py-20">
          <Sparkles size={40} className="mx-auto text-zinc-700 mb-3" />
          <p className="text-[#A0A0B0]">Todavía no hay actividad de tus seguidos.</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {visibleItems.map(item => {
              if (item.type === 'review') return (
                <ReviewCard key={item.key} item={item} profiles={profiles} currentUserId={currentUserId} onLike={toggleReviewLike} />
              )
              if (item.type === 'rating') return (
                <RatingCard key={item.key} item={item} profiles={profiles} />
              )
              if (item.type === 'watchlist') return (
                <WatchlistCard key={item.key} item={item} profiles={profiles} currentUserId={currentUserId} onAdd={addToWatchlist} />
              )
              if (item.type === 'shared_stat') return (
                <SharedStatCard key={item.key} item={item} profiles={profiles} currentUserId={currentUserId} onLike={toggleStatLike} />
              )
              if (item.type === 'level_up') return (
                <LevelUpCard key={item.key} item={item} profiles={profiles} />
              )
              if (item.type === 'recommendation') return (
                <RecommendationCard key={item.key} item={item} currentUserId={currentUserId} supabase={supabase} />
              )
              return null
            })}
          </div>

          {visibleCount < displayFeed.length && (
            <button
              onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
              className="mt-6 w-full py-3 rounded-xl border border-[#2A2A3A] text-[#A0A0B0] hover:border-[#6B3FE7] hover:text-white text-sm font-medium transition-colors"
            >
              Ver más ({displayFeed.length - visibleCount} restantes)
            </button>
          )}
        </>
      )}

      {/* Show recommendations when no following */}
      {followingIds.length === 0 && recommendations.length > 0 && (
        <div className="mt-6 space-y-4">
          <p className="text-xs text-[#A0A0B0] uppercase tracking-widest font-semibold">Recomendado para vos</p>
          {recommendations.slice(0, 4).map(rec => (
            <RecommendationCard key={rec.key} item={rec} currentUserId={currentUserId} supabase={supabase} />
          ))}
        </div>
      )}
    </div>
  )
}
