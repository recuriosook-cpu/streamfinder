'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Users, LogIn, Heart, MessageCircle, Bookmark, Plus, Check, BarChart2, Sparkles, Zap, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import VerifiedBadge, { isVerified } from '@/components/VerifiedBadge'
import StarDisplay from '@/components/StarDisplay'
import type { User } from '@supabase/supabase-js'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB = 'https://api.themoviedb.org/3'
const PAGE_SIZE = 20

// ── Genre map ─────────────────────────────────────────────────────────────────

const GENRE_TO_ID: Record<string, number> = {
  'Acción': 28, 'Comedia': 35, 'Drama': 18, 'Terror': 27,
  'Ciencia ficción': 878, 'Thriller': 53, 'Animación': 16,
  'Romance': 10749, 'Documental': 99, 'Aventura': 12,
  'Fantasía': 14, 'Misterio': 9648, 'Historia': 36,
  'Crimen': 80, 'Musical': 10402, 'Western': 37, 'Guerra': 10752, 'Familia': 10751,
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserProfile { id: string; username: string | null; display_name: string | null; avatar_url: string | null }

// Used by compat logic (alias)
type Profile = UserProfile

interface CompatItem { userId: string; score: number; sharedCount: number; friendTotal: number }

interface Achievement {
  id: string; emoji: string; name: string; description: string
  current: number; target: number; completed: boolean
}

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

type Tab = 'feed' | 'compat' | 'achievements'

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

function compatColor(score: number): string {
  if (score >= 60) return '#6B3FE7'
  if (score >= 30) return '#F59E0B'
  return '#EF4444'
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    green:  { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e' },
    yellow: { bg: 'rgba(234,179,8,0.12)',  text: '#eab308' },
    blue:   { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa' },
    purple: { bg: 'rgba(107,63,231,0.12)', text: '#6B3FE7' },
    gold:   { bg: 'rgba(245,166,35,0.12)', text: '#F5A623' },
  }
  const s = styles[color] ?? styles.purple
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: s.bg, color: s.text }}>
      {label}
    </span>
  )
}

/** Avatar with Link wrapper — used in feed card headers */
function Avatar({ profile, size = 9 }: { profile: UserProfile; size?: number }) {
  const name = profile.display_name ?? profile.username ?? '?'
  const px = size * 4
  return (
    <Link href={`/usuario/${profile.username}`} className="shrink-0">
      <div className="rounded-full overflow-hidden bg-zinc-700 ring-2 ring-zinc-600 hover:ring-[#6B3FE7] transition-all"
        style={{ width: px, height: px }}>
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[#A0A0B0]">
            {name[0]?.toUpperCase()}
          </div>
        )}
      </div>
    </Link>
  )
}

/** Avatar without Link — used inside cards that are already wrapped in a Link */
function AvatarImg({ profile, size = 9 }: { profile: UserProfile; size?: number }) {
  const name = profile.display_name ?? profile.username ?? '?'
  const px = size * 4
  return (
    <div className="rounded-full overflow-hidden bg-zinc-700 ring-2 ring-zinc-600 shrink-0"
      style={{ width: px, height: px }}>
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[#A0A0B0]">
          {name[0]?.toUpperCase()}
        </div>
      )}
    </div>
  )
}

function Poster({ path, title, mediaType, mediaId }: {
  path: string | null; title: string; mediaType: string; mediaId: number
}) {
  return (
    <Link href={`/${mediaType}/${mediaId}`} className="shrink-0">
      <div className="w-10 aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27]">
        {path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w185${path}`}
            alt={title} width={40} height={60}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#A0A0B0] text-[9px] text-center p-1">{title}</div>
        )}
      </div>
    </Link>
  )
}

// ── Feed card components ──────────────────────────────────────────────────────

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
              {item.body && <p className="text-sm text-zinc-300 line-clamp-3 leading-relaxed mt-1">{item.body}</p>}
              <div className="flex items-center gap-4 mt-2">
                <button onClick={() => onLike(item.reviewId)}
                  className={`flex items-center gap-1.5 text-xs transition-colors ${item.likedByMe ? 'text-red-400' : 'text-[#A0A0B0] hover:text-red-400'}`}>
                  <Heart size={13} fill={item.likedByMe ? 'currentColor' : 'none'} />
                  {item.likeCount > 0 ? `${item.likeCount} me gusta` : 'Me gusta'}
                </button>
                <Link href={`/review/${item.reviewId}`} className="flex items-center gap-1.5 text-xs text-[#A0A0B0] hover:text-zinc-300 transition-colors">
                  <MessageCircle size={13} />Comentar
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
              {item.userId !== currentUserId && (
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
            <button onClick={() => onLike(item.statId)}
              className={`flex items-center gap-1.5 text-xs transition-colors ${item.likedByMe ? 'text-red-400' : 'text-[#A0A0B0] hover:text-red-400'}`}>
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
      {item.backdropPath && (
        <div className="relative h-20 w-full overflow-hidden">
          <Image src={`https://image.tmdb.org/t/p/w780${item.backdropPath}`} alt={item.title} fill className="object-cover opacity-40" sizes="600px" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#13131A] via-transparent to-[#13131A]" />
        </div>
      )}
      <div className="p-4 -mt-2">
        <div className="flex gap-3 items-start">
          <Link href={`/movie/${item.movieId}`} className="shrink-0">
            <div className="rounded-lg overflow-hidden bg-[#1C1C27]"
              style={{ width: 80, height: 120, marginTop: item.backdropPath ? '-32px' : 0 }}>
              {item.posterPath && (
                <Image
                  src={`https://image.tmdb.org/t/p/w185${item.posterPath}`}
                  alt={item.title} width={80} height={120}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              )}
            </div>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles size={12} style={{ color: '#6B3FE7' }} />
              <span className="text-[10px] font-semibold" style={{ color: '#6B3FE7' }}>Recomendado para vos</span>
            </div>
            <Link href={`/movie/${item.movieId}`} className="text-sm font-semibold text-white hover:text-[#6B3FE7] transition-colors line-clamp-1 block">
              {item.title}
            </Link>
            {item.year && <p className="text-xs text-[#A0A0B0] mt-0.5">{item.year}</p>}
            <div className="flex gap-2 mt-2.5 flex-wrap">
              {[
                { type: 'watched'   as const, label: watched   ? '✓ Vista'    : '👁 Ya la vi',     active: watched,   color: '#22c55e' },
                { type: 'liked'     as const, label: liked     ? '♥ Gustó'    : '♡ Me gusta',      active: liked,     color: '#ef4444' },
                { type: 'watchlist' as const, label: watchlist ? '✓ En lista' : '🔖 Ver después',  active: watchlist, color: '#60a5fa' },
              ].map(btn => (
                <button key={btn.type} onClick={() => act(btn.type)} disabled={busy}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full transition-all disabled:opacity-50"
                  style={{
                    backgroundColor: btn.active ? `${btn.color}22` : '#1C1C27',
                    color: btn.active ? btn.color : '#A0A0B0',
                    border: `1px solid ${btn.active ? btn.color + '60' : '#2A2A3A'}`,
                  }}>
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


function FeedSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
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

// ── Compat card ───────────────────────────────────────────────────────────────

function CompatCard({ item, profiles }: { item: CompatItem; profiles: Map<string, Profile> }) {
  const profile = profiles.get(item.userId)
  const username = profile?.username ?? 'Usuario'
  const color = compatColor(item.score)
  const label = item.friendTotal === 0
    ? 'Este usuario todavía no marcó nada como visto'
    : item.sharedCount === 0
    ? 'Todavía no vieron nada en común'
    : `Vieron ${item.sharedCount} título${item.sharedCount !== 1 ? 's' : ''} en común`
  return (
    <Link href={`/usuario/${username}`}
      className="flex items-center gap-3 bg-[#1C1C27]/50 border border-[#2A2A3A]/40 rounded-xl p-4 hover:border-zinc-600 transition-colors">
      {profile ? <AvatarImg profile={profile} size={10} /> : <div className="w-10 h-10 rounded-full bg-zinc-700 shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold text-white">{username}</span>
            {isVerified(username) && <VerifiedBadge />}
          </div>
          <span className="text-sm font-bold tabular-nums" style={{ color }}>{item.score}%</span>
        </div>
        <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden mb-1.5">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${item.score}%`, backgroundColor: color }} />
        </div>
        <p className="text-xs text-[#A0A0B0]">{label}</p>
      </div>
    </Link>
  )
}

// ── Achievement card ──────────────────────────────────────────────────────────

function AchievementCard({ a }: { a: Achievement }) {
  const pct = Math.min(Math.round((a.current / a.target) * 100), 100)
  return (
    <div className={`flex items-start gap-3.5 rounded-xl p-4 border transition-colors ${
      a.completed ? 'bg-[#F5A623]/10 border-[#F5A623]/30' : 'bg-[#1C1C27]/50 border-[#2A2A3A]/40'
    }`}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0"
        style={{ backgroundColor: a.completed ? 'rgba(245,166,35,0.15)' : 'rgba(28,28,39,0.6)' }}>
        {a.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="font-semibold text-sm text-white leading-tight">{a.name}</p>
          {a.completed && <span className="text-xs font-semibold text-[#F5A623] shrink-0">¡Completado!</span>}
        </div>
        <p className="text-xs text-[#A0A0B0] mb-2 leading-snug">{a.description}</p>
        <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden mb-1.5">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: '#6B3FE7' }} />
        </div>
        <p className="text-xs" style={{ color: a.completed ? '#F5A623' : '#71717a' }}>
          {a.completed ? `✓ ${a.current} de ${a.target}` : `${a.current} de ${a.target} · Faltan ${a.target - a.current}`}
        </p>
      </div>
    </div>
  )
}

// ── Tab button ────────────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
        active ? 'bg-[#6B3FE7]/15 text-[#6B3FE7]' : 'text-[#A0A0B0] hover:text-zinc-300 hover:bg-[#1C1C27]'
      }`}>
      {icon}{label}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ComunidadPage() {
  const supabase = useRef(createClient()).current

  const [user,          setUser]          = useState<User | null | undefined>(undefined)
  const [currentUserId, setCurrentUserId] = useState('')
  const [followingIds,  setFollowingIds]  = useState<string[]>([])
  const [profiles,      setProfiles]      = useState<Map<string, UserProfile>>(new Map())
  const [loading,       setLoading]       = useState(true)

  const [tab, setTab] = useState<Tab>('feed')

  // Feed state
  const [recommendations, setRecommendations] = useState<RecommendationFeed[]>([])
  const [rawFeed,         setRawFeed]         = useState<FeedItem[]>([])
  const [displayFeed,     setDisplayFeed]     = useState<FeedItem[]>([])
  const [visibleCount,    setVisibleCount]    = useState(PAGE_SIZE)
  const [feedLoading,     setFeedLoading]     = useState(false)

  // Compat state
  const [compatItems,   setCompatItems]   = useState<CompatItem[]>([])
  const [compatLoading, setCompatLoading] = useState(false)
  const [compatLoaded,  setCompatLoaded]  = useState(false)

  // Achievements state
  const [achievements,        setAchievements]        = useState<Achievement[]>([])
  const [achievementsLoading, setAchievementsLoading] = useState(false)
  const [achievementsLoaded,  setAchievementsLoaded]  = useState(false)

  // ── Bootstrap ──────────────────────────────────────────────────────────────
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


      if (ids.length > 0) {
        const { data: rows } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', ids)
        const map = new Map<string, UserProfile>()
        for (const p of (rows ?? []) as UserProfile[]) map.set(p.id, p)
        setProfiles(map)
        loadFeed(ids, u.id)
      }

      setLoading(false)
      loadRecommendations(profileRes.data?.favorite_genres ?? [])
    }
    bootstrap()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recommendations ────────────────────────────────────────────────────────
  const loadRecommendations = useCallback(async (genres: string[]) => {
    if (!TMDB_KEY) return
    const genreIds = genres.map(g => GENRE_TO_ID[g]).filter(Boolean).slice(0, 3)
    const genreParam = genreIds.length > 0 ? `&with_genres=${genreIds.join(',')}` : ''
    try {
      const res = await fetch(`${TMDB}/discover/movie?api_key=${TMDB_KEY}&language=es-AR&sort_by=vote_average.desc&vote_count.gte=500&page=1${genreParam}`)
      if (!res.ok) return
      const data = await res.json()
      type M = { id: number; title: string; release_date?: string; poster_path: string | null; backdrop_path: string | null }
      setRecommendations(((data.results ?? []) as M[]).slice(0, 8).map(m => ({
        key: `rec-${m.id}`, type: 'recommendation' as const,
        movieId: m.id, title: m.title, year: (m.release_date ?? '').slice(0, 4),
        posterPath: m.poster_path, backdropPath: m.backdrop_path,
      })))
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Feed loader ────────────────────────────────────────────────────────────
  const loadFeed = useCallback(async (followIds: string[], uid: string) => {
    setFeedLoading(true)
    const [reviewsRes, ratingsRes, watchlistRes, statsRes, levelUpsRes] = await Promise.all([
      supabase.from('reviews').select('id, user_id, media_id, media_type, title, poster_path, rating, body, created_at, review_likes(user_id)').in('user_id', followIds).order('created_at', { ascending: false }).limit(40),
      supabase.from('ratings').select('id, user_id, media_id, media_type, title, poster_path, rating, rated_at').in('user_id', followIds).gte('rating', 3.5).order('rated_at', { ascending: false }).limit(40),
      supabase.from('watchlist').select('id, user_id, media_id, media_type, title, poster_path, added_at').in('user_id', followIds).order('added_at', { ascending: false }).limit(30),
      supabase.from('shared_stats').select('id, user_id, stat_title, stat_value, stat_detail, stat_image_url, created_at, shared_stat_likes(user_id)').in('user_id', followIds).order('created_at', { ascending: false }).limit(20),
      supabase.from('notifications').select('id, user_id, review_title, created_at').in('user_id', followIds).eq('type', 'level_up').order('created_at', { ascending: false }).limit(10),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewedSet = new Set((reviewsRes.data ?? []).map((r: any) => `${r.user_id}:${r.media_id}:${r.media_type}`))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviews: ReviewFeed[] = ((reviewsRes.data ?? []) as any[]).map(r => ({
      key: `review-${r.id}`, type: 'review' as const,
      userId: r.user_id, sortTime: r.created_at, reviewId: r.id,
      mediaId: r.media_id, mediaType: r.media_type, mediaTitle: r.title, mediaPosterPath: r.poster_path,
      rating: r.rating, body: r.body,
      likeCount: Array.isArray(r.review_likes) ? r.review_likes.length : 0,
      likedByMe: Array.isArray(r.review_likes) && r.review_likes.some((l: { user_id: string }) => l.user_id === uid),
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ratings: RatingFeed[] = ((ratingsRes.data ?? []) as any[])
      .filter(r => !reviewedSet.has(`${r.user_id}:${r.media_id}:${r.media_type}`))
      .map(r => ({ key: `rating-${r.id}`, type: 'rating' as const, userId: r.user_id, sortTime: r.rated_at, mediaId: r.media_id, mediaType: r.media_type, mediaTitle: r.title, mediaPosterPath: r.poster_path, rating: r.rating }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const watchlist: WatchlistFeed[] = ((watchlistRes.data ?? []) as any[]).map(w => ({ key: `watchlist-${w.id}`, type: 'watchlist' as const, userId: w.user_id, sortTime: w.added_at, mediaId: w.media_id, mediaType: w.media_type, mediaTitle: w.title, mediaPosterPath: w.poster_path }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats: SharedStatFeed[] = ((statsRes.data ?? []) as any[]).map(s => ({
      key: `stat-${s.id}`, type: 'shared_stat' as const, userId: s.user_id, sortTime: s.created_at,
      statId: s.id, statTitle: s.stat_title, statValue: s.stat_value, statDetail: s.stat_detail, statImageUrl: s.stat_image_url,
      likeCount: Array.isArray(s.shared_stat_likes) ? s.shared_stat_likes.length : 0,
      likedByMe: Array.isArray(s.shared_stat_likes) && s.shared_stat_likes.some((l: { user_id: string }) => l.user_id === uid),
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const levelUps: LevelUpFeed[] = ((levelUpsRes.data ?? []) as any[]).map(n => ({ key: `levelup-${n.id}`, type: 'level_up' as const, userId: n.user_id, sortTime: n.created_at, levelName: n.review_title ?? 'nuevo nivel' }))

    setRawFeed([...reviews, ...ratings, ...watchlist, ...stats, ...levelUps].sort((a, b) => b.sortTime.localeCompare(a.sortTime)))
    setFeedLoading(false)
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Merge feed + recommendations ───────────────────────────────────────────
  useEffect(() => {
    const result: FeedItem[] = []
    let recIdx = 0
    rawFeed.forEach((item, i) => {
      result.push(item)
      if ((i + 1) % 4 === 0 && recIdx < recommendations.length) result.push(recommendations[recIdx++])
    })
    if (rawFeed.length < 4 && recIdx < recommendations.length) result.push(recommendations[recIdx])
    setDisplayFeed(result)
  }, [rawFeed, recommendations])

  // ── Compat (lazy) ──────────────────────────────────────────────────────────
  const loadCompat = useCallback(async () => {
    if (!currentUserId || followingIds.length === 0) { setCompatItems([]); setCompatLoaded(true); return }
    setCompatLoading(true)
    const [myWatchedRes, myRatingsRes] = await Promise.all([
      supabase.from('watched').select('media_id, media_type').eq('user_id', currentUserId),
      supabase.from('ratings').select('media_id, media_type, rating').eq('user_id', currentUserId),
    ])
    const mySet = new Set((myWatchedRes.data ?? []).map((w: { media_id: number; media_type: string }) => `${w.media_type}:${w.media_id}`))
    const myRatingMap = new Map<string, number>()
    for (const r of myRatingsRes.data ?? []) myRatingMap.set(`${r.media_type}:${r.media_id}`, r.rating)

    const results = await Promise.all(followingIds.map(async friendId => {
      const [fw, fr] = await Promise.all([
        supabase.from('watched').select('media_id, media_type').eq('user_id', friendId),
        supabase.from('ratings').select('media_id, media_type, rating').eq('user_id', friendId),
      ])
      const friendSet = new Set((fw.data ?? []).map((w: { media_id: number; media_type: string }) => `${w.media_type}:${w.media_id}`))
      if (friendSet.size === 0) return { userId: friendId, score: 0, sharedCount: 0, friendTotal: 0 }
      const sharedCount = [...mySet].filter(k => friendSet.has(k)).length
      const unionSize = new Set([...mySet, ...friendSet]).size
      let rawScore = unionSize > 0 ? (sharedCount / unionSize) * 100 : 0
      const friendRatingMap = new Map<string, number>()
      for (const r of fr.data ?? []) friendRatingMap.set(`${r.media_type}:${r.media_id}`, r.rating)
      let similar = 0
      for (const [key, myR] of myRatingMap) {
        const fr2 = friendRatingMap.get(key)
        if (fr2 !== undefined && Math.abs(myR - fr2) <= 1) similar++
      }
      rawScore += Math.floor(similar / 3) * 5
      return { userId: friendId, score: Math.min(99, Math.max(5, Math.round(rawScore))), sharedCount, friendTotal: friendSet.size }
    }))
    setCompatItems(results.sort((a, b) => b.score - a.score))
    setCompatLoading(false)
    setCompatLoaded(true)
  }, [currentUserId, followingIds]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (tab === 'compat' && !compatLoaded) loadCompat() }, [tab, compatLoaded, loadCompat])

  // ── Achievements (lazy) ────────────────────────────────────────────────────
  const loadAchievements = useCallback(async () => {
    if (!currentUserId) { setAchievementsLoaded(true); return }
    setAchievementsLoading(true)
    const uid = currentUserId
    const [totalRes, moviesRes, tvRes, reviewsRes, followingRes, followersRes, reviewBodiesRes, watchedItemsRes] = await Promise.all([
      supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('media_type', 'movie'),
      supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('media_type', 'tv'),
      supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', uid),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', uid),
      supabase.from('reviews').select('body').eq('user_id', uid),
      supabase.from('watched').select('media_id, media_type, genre_ids').eq('user_id', uid).limit(200),
    ])
    const totalWatched = totalRes.count ?? 0, totalMovies = moviesRes.count ?? 0, totalTV = tvRes.count ?? 0
    const totalReviews = reviewsRes.count ?? 0, totalFollowing = followingRes.count ?? 0, totalFollowers = followersRes.count ?? 0
    const longReviews = (reviewBodiesRes.data ?? []).filter(r => (r.body?.length ?? 0) >= 200).length
    type WRow = { media_id: number; media_type: string; genre_ids: number[] | null }
    const watchedRows = (watchedItemsRes.data ?? []) as WRow[]
    const toFetch = new Map<string, { media_id: number; media_type: string }>()
    for (const row of watchedRows) {
      const key = `${row.media_type}:${row.media_id}`
      if ((row.genre_ids?.length ?? 0) === 0 || row.media_type === 'movie') toFetch.set(key, { media_id: row.media_id, media_type: row.media_type })
    }
    type TmdbData = { genre_ids: number[]; original_language?: string; release_date?: string }
    const tmdbCache = new Map<string, TmdbData>()
    await runConcurrently([...toFetch.values()].slice(0, 80).map(({ media_id, media_type }) => async () => {
      try {
        const res = await fetch(`${TMDB}/${media_type}/${media_id}?api_key=${TMDB_KEY}&language=es-AR`)
        if (!res.ok) return
        const d = await res.json()
        tmdbCache.set(`${media_type}:${media_id}`, { genre_ids: d.genre_ids ?? d.genres?.map((g: { id: number }) => g.id) ?? [], original_language: d.original_language, release_date: d.release_date ?? d.first_air_date })
      } catch { /* skip */ }
    }), 5)
    const genreCounts: Record<number, number> = {}
    for (const row of watchedRows) {
      const genres = (row.genre_ids?.length ?? 0) > 0 ? row.genre_ids! : (tmdbCache.get(`${row.media_type}:${row.media_id}`)?.genre_ids ?? [])
      for (const gid of genres) genreCounts[gid] = (genreCounts[gid] ?? 0) + 1
    }
    const langs = new Set<string>()
    for (const row of watchedRows.filter(r => r.media_type === 'movie')) { const l = tmdbCache.get(`movie:${row.media_id}`)?.original_language; if (l) langs.add(l) }
    let classics = 0
    for (const row of watchedRows.filter(r => r.media_type === 'movie')) { const rd = tmdbCache.get(`movie:${row.media_id}`)?.release_date; if (rd && rd < '1980-01-01') classics++ }
    const raw: Achievement[] = [
      { id: 'first',      emoji: '🎬', name: 'Primera vez',           description: 'Marcá tu primera película o serie como vista',  current: Math.min(totalWatched, 1),           target: 1   },
      { id: 'ten',        emoji: '🍿', name: 'Cinéfilo en progreso',   description: 'Ver 10 películas',                               current: Math.min(totalMovies, 10),           target: 10  },
      { id: 'hundred',    emoji: '🏆', name: 'Centenar de películas',  description: 'Ver 100 películas',                              current: Math.min(totalMovies, 100),          target: 100 },
      { id: 'critic',     emoji: '⭐', name: 'Crítico nato',           description: 'Escribir 5 reseñas',                            current: Math.min(totalReviews, 5),           target: 5   },
      { id: 'tvfan',      emoji: '📺', name: 'Seriéfilo',              description: 'Ver 5 series completas',                        current: Math.min(totalTV, 5),                target: 5   },
      { id: 'world',      emoji: '🌍', name: 'Viajero del cine',       description: 'Ver películas de 5 idiomas/países distintos',   current: Math.min(langs.size, 5),             target: 5   },
      { id: 'drama',      emoji: '🎭', name: 'Amante del drama',       description: 'Ver 20 dramas',                                  current: Math.min(genreCounts[18] ?? 0, 20), target: 20  },
      { id: 'comedy',     emoji: '😂', name: 'Rey de la comedia',      description: 'Ver 20 comedias',                               current: Math.min(genreCounts[35] ?? 0, 20), target: 20  },
      { id: 'horror',     emoji: '👻', name: 'Valiente',               description: 'Ver 10 películas de terror',                    current: Math.min(genreCounts[27] ?? 0, 10), target: 10  },
      { id: 'scifi',      emoji: '🤖', name: 'Explorador del futuro',  description: 'Ver 10 películas de ciencia ficción',           current: Math.min(genreCounts[878] ?? 0, 10), target: 10 },
      { id: 'thriller',   emoji: '🕵️', name: 'Maestro del suspenso',  description: 'Ver 10 thrillers',                               current: Math.min(genreCounts[53] ?? 0, 10), target: 10  },
      { id: 'classic',    emoji: '🎞️', name: 'Clásico imprescindible',description: 'Ver 5 películas anteriores a 1980',              current: Math.min(classics, 5),               target: 5   },
      { id: 'social',     emoji: '❤️', name: 'Social',                description: 'Seguir a 5 usuarios',                           current: Math.min(totalFollowing, 5),          target: 5   },
      { id: 'writer',     emoji: '✍️', name: 'Narrador',              description: 'Escribir una reseña de más de 200 caracteres',  current: Math.min(longReviews, 1),             target: 1   },
      { id: 'influencer', emoji: '🌟', name: 'Influencer',            description: 'Conseguir 10 seguidores',                       current: Math.min(totalFollowers, 10),         target: 10  },
    ].map(a => ({ ...a, completed: a.current >= a.target }))
    raw.sort((a, b) => a.completed !== b.completed ? (a.completed ? -1 : 1) : (b.current / b.target) - (a.current / a.target))
    setAchievements(raw)
    setAchievementsLoading(false)
    setAchievementsLoaded(true)
  }, [currentUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (tab === 'achievements' && !achievementsLoaded) loadAchievements() }, [tab, achievementsLoaded, loadAchievements])

  // ── Like toggles ───────────────────────────────────────────────────────────
  const toggleReviewLike = (reviewId: string) => {
    if (!currentUserId) return
    setRawFeed(prev => prev.map(item => {
      if (item.type !== 'review' || item.reviewId !== reviewId) return item
      const liked = !item.likedByMe
      if (liked) supabase.from('review_likes').insert({ review_id: reviewId, user_id: currentUserId })
      else supabase.from('review_likes').delete().eq('review_id', reviewId).eq('user_id', currentUserId)
      return { ...item, likedByMe: liked, likeCount: item.likeCount + (liked ? 1 : -1) }
    }))
  }

  const toggleStatLike = (statId: string) => {
    if (!currentUserId) return
    setRawFeed(prev => prev.map(item => {
      if (item.type !== 'shared_stat' || item.statId !== statId) return item
      const liked = !item.likedByMe
      if (liked) supabase.from('shared_stat_likes').insert({ stat_id: statId, user_id: currentUserId })
      else supabase.from('shared_stat_likes').delete().eq('stat_id', statId).eq('user_id', currentUserId)
      return { ...item, likedByMe: liked, likeCount: item.likeCount + (liked ? 1 : -1) }
    }))
  }

  const addToWatchlist = async (mediaId: number, mediaType: string, title: string, posterPath: string | null): Promise<boolean> => {
    if (!currentUserId) return false
    const { error } = await supabase.from('watchlist').upsert(
      { user_id: currentUserId, media_id: mediaId, media_type: mediaType, title, poster_path: posterPath },
      { onConflict: 'user_id,media_id,media_type' }
    )
    return !error
  }

  // ── Render ─────────────────────────────────────────────────────────────────
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-5 flex items-center gap-2"><Users size={22} /> Comunidad</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-1">
        <TabButton active={tab === 'feed'}         onClick={() => setTab('feed')}         icon={<Zap size={15} />}    label="Feed" />
        <TabButton active={tab === 'compat'}       onClick={() => setTab('compat')}       icon={<Heart size={15} />}  label="Compatibilidad" />
        <TabButton active={tab === 'achievements'} onClick={() => setTab('achievements')} icon={<Trophy size={15} />} label="Logros" />
      </div>

      {/* ── FEED ── */}
      {tab === 'feed' && (
        <>
          {followingIds.length === 0 && (
            <p className="text-sm text-[#A0A0B0] mb-6">Seguí a otros usuarios para ver su actividad acá.</p>
          )}

          {feedLoading ? <FeedSkeleton /> : displayFeed.length === 0 && followingIds.length > 0 ? (
            <div className="text-center py-20">
              <Sparkles size={40} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-[#A0A0B0]">Todavía no hay actividad de tus seguidos.</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {displayFeed.slice(0, visibleCount).map(item => {
                  if (item.type === 'review') return <ReviewCard key={item.key} item={item} profiles={profiles} currentUserId={currentUserId} onLike={toggleReviewLike} />
                  if (item.type === 'rating') return <RatingCard key={item.key} item={item} profiles={profiles} />
                  if (item.type === 'watchlist') return <WatchlistCard key={item.key} item={item} profiles={profiles} currentUserId={currentUserId} onAdd={addToWatchlist} />
                  if (item.type === 'shared_stat') return <SharedStatCard key={item.key} item={item} profiles={profiles} currentUserId={currentUserId} onLike={toggleStatLike} />
                  if (item.type === 'level_up') return <LevelUpCard key={item.key} item={item} profiles={profiles} />
                  if (item.type === 'recommendation') return <RecommendationCard key={item.key} item={item} currentUserId={currentUserId} supabase={supabase} />
                  return null
                })}
              </div>
              {visibleCount < displayFeed.length && (
                <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="mt-6 w-full py-3 rounded-xl border border-[#2A2A3A] text-[#A0A0B0] hover:border-[#6B3FE7] hover:text-white text-sm font-medium transition-colors">
                  Ver más ({displayFeed.length - visibleCount} restantes)
                </button>
              )}
            </>
          )}

          {followingIds.length === 0 && recommendations.length > 0 && (
            <div className="mt-6 space-y-4">
              <p className="text-xs text-[#A0A0B0] uppercase tracking-widest font-semibold">Recomendado para vos</p>
              {recommendations.slice(0, 4).map(rec => <RecommendationCard key={rec.key} item={rec} currentUserId={currentUserId} supabase={supabase} />)}
            </div>
          )}
        </>
      )}

      {/* ── COMPATIBILIDAD ── */}
      {tab === 'compat' && (
        <>
          {compatLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 bg-[#1C1C27]/50 border border-[#2A2A3A]/40 rounded-xl p-4 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-zinc-700 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between"><div className="h-3 bg-zinc-700 rounded w-1/3" /><div className="h-3 bg-zinc-700 rounded w-10" /></div>
                    <div className="h-1.5 bg-zinc-700 rounded-full w-full" />
                    <div className="h-2.5 bg-zinc-700 rounded w-2/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : followingIds.length === 0 ? (
            <div className="text-center py-20">
              <Heart size={40} className="mx-auto text-zinc-700 mb-3" />
              <p className="text-[#A0A0B0]">Seguí usuarios para ver tu compatibilidad con ellos.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-[#A0A0B0] mb-4">Calculado según los géneros más vistos por vos y cada usuario.</p>
              <div className="space-y-3">
                {compatItems.map(item => <CompatCard key={item.userId} item={item} profiles={profiles} />)}
              </div>
            </>
          )}
        </>
      )}

      {/* ── LOGROS ── */}
      {tab === 'achievements' && (
        <>
          {achievementsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-3.5 bg-[#1C1C27]/50 border border-[#2A2A3A]/40 rounded-xl p-4 animate-pulse">
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
                <p className="text-xs text-[#A0A0B0]">{achievements.filter(a => a.completed).length} de {achievements.length} logros completados</p>
                <span className="text-xs font-semibold text-[#6B3FE7]">{achievements.filter(a => a.completed).length}/{achievements.length}</span>
              </div>
              {achievements.filter(a => a.completed).length > 0 && <p className="text-xs text-zinc-600 uppercase tracking-wider font-semibold mb-2">Completados</p>}
              <div className="space-y-3">{achievements.filter(a => a.completed).map(a => <AchievementCard key={a.id} a={a} />)}</div>
              {achievements.filter(a => !a.completed).length > 0 && <p className="text-xs text-zinc-600 uppercase tracking-wider font-semibold mt-5 mb-2">En progreso</p>}
              <div className="space-y-3">{achievements.filter(a => !a.completed).map(a => <AchievementCard key={a.id} a={a} />)}</div>
            </>
          )}
        </>
      )}
    </div>
  )
}
