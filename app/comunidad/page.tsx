'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Users, LogIn, Heart, MessageCircle, Bookmark, Plus, Check, BarChart2, Sparkles, Zap, Trophy, List } from 'lucide-react'
import { createClient } from '@/lib/supabase'
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

interface ListFeed {
  key: string; type: 'list_created'; userId: string; sortTime: string
  listId: string; listTitle: string; listDescription: string | null
  previews: (string | null)[]; itemCount: number
}

interface ActorBirthdayFeed {
  key: string; type: 'actor_birthday'; sortTime: string
  actorId: number; actorName: string; actorPhoto: string | null; age: number
}
interface ActorReleaseFeed {
  key: string; type: 'actor_release'; sortTime: string
  actorId: number; actorName: string; actorPhoto: string | null
  mediaId: number; mediaType: 'movie' | 'tv'
  mediaTitle: string; mediaPosterPath: string | null; mediaYear: string
}

type FeedItem = ReviewFeed | RatingFeed | WatchlistFeed | SharedStatFeed | LevelUpFeed | RecommendationFeed | ListFeed | ActorBirthdayFeed | ActorReleaseFeed

interface CommunityListCard {
  id: string; title: string; description: string | null; tags: string[]
  created_at: string; user_id: string
  author: { username: string | null; display_name: string | null; avatar_url: string | null } | null
  likeCount: number; previews: (string | null)[]; itemCount: number
}

type Tab = 'feed' | 'compat' | 'achievements' | 'listas'

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
  if (score >= 81) return '#22c55e'
  if (score >= 61) return '#86efac'
  if (score >= 31) return '#FFFD02'
  return '#EF4444'
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    green:  { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e' },
    yellow: { bg: 'rgba(234,179,8,0.12)',  text: '#eab308' },
    blue:   { bg: 'rgba(59,130,246,0.12)', text: '#60a5fa' },
    purple: { bg: 'rgba(255,253,2,0.12)', text: '#FFFD02' },
    gold:   { bg: 'rgba(245,166,35,0.12)', text: '#F5A623' },
    orange: { bg: 'rgba(249,115,22,0.12)', text: '#f97316' },
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
      <div className="rounded-full overflow-hidden bg-zinc-700 ring-2 ring-zinc-600 hover:ring-[#FFFD02] transition-all"
        style={{ width: px, height: px }}>
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt={name} className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-[#2A2A3A] text-[#FFFD02]">
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
        <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-[#2A2A3A] text-[#FFFD02]">
          {name[0]?.toUpperCase()}
        </div>
      )}
    </div>
  )
}

function Poster({ path, title, mediaType, mediaId, large }: {
  path: string | null; title: string; mediaType: string; mediaId: number; large?: boolean
}) {
  const w = large ? 48 : 40
  return (
    <Link href={`/${mediaType}/${mediaId}`} className="shrink-0">
      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] hover:opacity-90 transition-opacity" style={{ width: w }}>
        {path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w185${path}`}
            alt={title} width={w} height={Math.round(w * 1.5)}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#2A2A3A] text-[#FFFD02] text-[9px] text-center p-1">{title}</div>
        )}
      </div>
    </Link>
  )
}

// ── Verified badge helper ─────────────────────────────────────────────────────

function VerifiedBadge() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" className="shrink-0">
      <circle cx="10" cy="10" r="10" fill="#1D9BF0"/>
      <path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Feed card components ──────────────────────────────────────────────────────

function ReviewCard({ item, profiles, currentUserId, onLike }: {
  item: ReviewFeed; profiles: Map<string, UserProfile>; currentUserId: string; onLike: (id: string) => void
}) {
  const p = profiles.get(item.userId)
  if (!p) return null
  const isVerified = p.username === 'Ferlageok' || p.username === 'ferlageok'
  const name = p.display_name ?? p.username ?? 'Usuario'
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/30 rounded-2xl overflow-hidden transition-colors">
      {/* Backdrop / poster image area */}
      <Link href={`/${item.mediaType}/${item.mediaId}`} className="block relative overflow-hidden bg-[#1C1C27]" style={{ height: 180 }}>
        {item.mediaPosterPath && (
          <Image
            src={`https://image.tmdb.org/t/p/w780${item.mediaPosterPath}`}
            alt={item.mediaTitle}
            fill
            className="object-cover object-top"
            sizes="680px"
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(10,10,15,0) 0%, rgba(10,10,15,0.45) 55%, rgba(10,10,15,0.97) 100%)' }}
        />
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
          <h3 className="text-lg font-bold text-white leading-tight line-clamp-1">{item.mediaTitle}</h3>
          {item.sortTime && (
            <p className="text-xs text-white/50">{new Date(item.sortTime).getFullYear()}</p>
          )}
        </div>
      </Link>

      {/* Content area */}
      <div className="px-4 pt-3 pb-4">
        {/* Author row */}
        <div className="flex items-center gap-2.5 mb-3">
          <Avatar profile={p} size={8} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <Link href={`/usuario/${p.username}`} className="text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors truncate">
                {name}
              </Link>
              {isVerified && <VerifiedBadge />}
            </div>
            <p className="text-[11px] text-[#A0A0B0]">{timeAgo(item.sortTime)}</p>
          </div>
          {item.rating != null && (
            <div className="shrink-0"><StarDisplay rating={item.rating} size={12} /></div>
          )}
        </div>

        {/* Body */}
        {item.body && (
          <p className="text-sm text-zinc-300 line-clamp-2 leading-relaxed mb-3">{item.body}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-5 pt-3 border-t border-[#2A2A3A]">
          <button
            onClick={() => onLike(item.reviewId)}
            className={`flex items-center gap-1.5 text-sm transition-colors ${item.likedByMe ? 'text-red-400' : 'text-[#A0A0B0] hover:text-red-400'}`}
          >
            <Heart size={15} fill={item.likedByMe ? 'currentColor' : 'none'} />
            <span className="text-xs">{item.likeCount > 0 ? item.likeCount : 'Me gusta'}</span>
          </button>
          <Link href={`/review/${item.reviewId}`} className="flex items-center gap-1.5 text-sm text-[#A0A0B0] hover:text-zinc-300 transition-colors">
            <MessageCircle size={15} />
            <span className="text-xs">Comentar</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

function RatingCard({ item, profiles }: { item: RatingFeed; profiles: Map<string, UserProfile> }) {
  const p = profiles.get(item.userId)
  if (!p) return null
  const isVerified = p.username === 'Ferlageok' || p.username === 'ferlageok'
  const name = p.display_name ?? p.username ?? 'Usuario'
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/30 rounded-2xl p-4 transition-colors">
      <div className="flex gap-3">
        {/* Poster */}
        <Link href={`/${item.mediaType}/${item.mediaId}`} className="shrink-0">
          <div className="rounded-lg overflow-hidden bg-[#1C1C27]" style={{ width: 47, height: 70 }}>
            {item.mediaPosterPath ? (
              <Image src={`https://image.tmdb.org/t/p/w185${item.mediaPosterPath}`} alt={item.mediaTitle} width={47} height={70} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[9px] text-[#A0A0B0] text-center p-1">{item.mediaTitle}</div>
            )}
          </div>
        </Link>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <AvatarImg profile={p} size={6} />
            <Link href={`/usuario/${p.username}`} className="text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors">
              {name}
            </Link>
            {isVerified && <VerifiedBadge />}
            <span className="text-xs text-[#A0A0B0]">vio</span>
            <Link href={`/${item.mediaType}/${item.mediaId}`} className="text-xs font-semibold line-clamp-1 hover:opacity-80 transition-opacity" style={{ color: '#FFFD02' }}>
              {item.mediaTitle}
            </Link>
          </div>
          <StarDisplay rating={item.rating} size={13} />
          <p className="text-[11px] text-[#A0A0B0] mt-1.5">{timeAgo(item.sortTime)}</p>
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
  const isVerified = p.username === 'Ferlageok' || p.username === 'ferlageok'
  const name = p.display_name ?? p.username ?? 'Usuario'
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/30 rounded-2xl p-4 transition-colors">
      <div className="flex gap-3">
        {/* Poster */}
        <Link href={`/${item.mediaType}/${item.mediaId}`} className="shrink-0">
          <div className="rounded-lg overflow-hidden bg-[#1C1C27]" style={{ width: 47, height: 70 }}>
            {item.mediaPosterPath ? (
              <Image src={`https://image.tmdb.org/t/p/w185${item.mediaPosterPath}`} alt={item.mediaTitle} width={47} height={70} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[9px] text-[#A0A0B0] text-center p-1">{item.mediaTitle}</div>
            )}
          </div>
        </Link>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <AvatarImg profile={p} size={6} />
            <Link href={`/usuario/${p.username}`} className="text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors">
              {name}
            </Link>
            {isVerified && <VerifiedBadge />}
            <span className="text-xs text-[#A0A0B0]">quiere ver</span>
            <Link href={`/${item.mediaType}/${item.mediaId}`} className="text-xs font-semibold line-clamp-1 hover:opacity-80 transition-opacity" style={{ color: '#FFFD02' }}>
              {item.mediaTitle}
            </Link>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-[#A0A0B0]">{timeAgo(item.sortTime)}</p>
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
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all shrink-0"
                style={{
                  backgroundColor: added ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)',
                  color: added ? '#22c55e' : '#60a5fa',
                  border: `1px solid ${added ? 'rgba(34,197,94,0.25)' : 'rgba(59,130,246,0.25)'}`,
                }}
              >
                {added ? <Check size={11} /> : <Plus size={11} />}
                {added ? 'Agregado' : 'Yo también'}
              </button>
            )}
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
    <div className="bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/20 rounded-xl p-4 transition-colors">
      <div className="flex items-start gap-3">
        <Avatar profile={p} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            <Link href={`/usuario/${p.username}`} className="text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors">
              {p.display_name ?? p.username}
            </Link>
            {isVerified && <VerifiedBadge />}
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
              <p className="text-base font-bold" style={{ color: '#FFFD02' }}>{item.statValue}</p>
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
    <div className="bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/20 rounded-xl p-4 transition-colors">
      <div className="flex items-center gap-3">
        <Avatar profile={p} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link href={`/usuario/${p.username}`} className="text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors">
              {p.display_name ?? p.username}
            </Link>
            {isVerified && <VerifiedBadge />}
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

function ListCard({ item, profiles }: { item: ListFeed; profiles: Map<string, UserProfile> }) {
  const p = profiles.get(item.userId)
  if (!p) return null
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/20 rounded-xl p-4 transition-colors">
      <div className="flex items-start gap-3">
        <Avatar profile={p} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            <Link href={`/usuario/${p.username}`} className="text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors">
              {p.display_name ?? p.username}
            </Link>
            {isVerified && <VerifiedBadge />}
            <Badge label="Lista" color="orange" />
            <span className="text-[11px] text-[#A0A0B0] ml-auto shrink-0">{timeAgo(item.sortTime)}</span>
          </div>
          {/* Preview posters */}
          <div className="flex gap-1 mb-3 h-[60px]">
            {item.previews.slice(0, 4).map((p2, i) => (
              <div key={i} className="flex-1 rounded-md overflow-hidden bg-[#1C1C27]">
                {p2 ? <Image src={`https://image.tmdb.org/t/p/w185${p2}`} alt="" width={60} height={60} className="w-full h-full object-cover" /> : null}
              </div>
            ))}
            {Array.from({ length: Math.max(0, 4 - item.previews.length) }).map((_, i) => (
              <div key={`e-${i}`} className="flex-1 rounded-md bg-[#1C1C27]" />
            ))}
          </div>
          <p className="text-sm font-semibold text-white mb-0.5 line-clamp-1">{item.listTitle}</p>
          {item.listDescription && <p className="text-xs text-[#A0A0B0] line-clamp-2 mb-2">{item.listDescription}</p>}
          <p className="text-xs text-[#A0A0B0] mb-3">{item.itemCount} {item.itemCount === 1 ? 'título' : 'títulos'}</p>
          <Link href={`/listas/${item.listId}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-[#FFFD02]/40 text-[#FFFD02] hover:bg-[#FFFD02]/10 transition-colors">
            Ver lista completa →
          </Link>
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
    <div className="bg-[#13131A] border border-[#FFFD02]/40 rounded-xl overflow-hidden">
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
              <Sparkles size={12} style={{ color: '#FFFD02' }} />
              <span className="text-[10px] font-semibold" style={{ color: '#FFFD02' }}>Recomendado para vos</span>
            </div>
            <Link href={`/movie/${item.movieId}`} className="text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors line-clamp-1 block">
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
            {(username === 'Ferlageok' || username === 'ferlageok') && <VerifiedBadge />}
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
  const tooltip = !a.completed ? `Te faltan ${a.target - a.current} para desbloquear "${a.name}"` : undefined
  return (
    <div
      title={tooltip}
      className={`flex items-start gap-3.5 rounded-xl p-4 border transition-all ${
        a.completed
          ? 'bg-[#F5A623]/10 border-[#F5A623]/30 shadow-[0_0_16px_rgba(245,166,35,0.08)]'
          : 'bg-[#1C1C27]/50 border-[#2A2A3A]/40 opacity-70 hover:opacity-90'
      }`}
    >
      <div className="relative w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0"
        style={{ backgroundColor: a.completed ? 'rgba(245,166,35,0.18)' : 'rgba(28,28,39,0.6)' }}>
        {a.emoji}
        {!a.completed && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#1C1C27] border border-[#2A2A3A] rounded-full flex items-center justify-center">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#A0A0B0" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="font-semibold text-sm text-white leading-tight">{a.name}</p>
          {a.completed && <span className="text-xs font-semibold text-[#F5A623] shrink-0">¡Completado!</span>}
        </div>
        <p className="text-xs text-[#A0A0B0] mb-2 leading-snug">{a.description}</p>
        <div className="w-full h-1.5 bg-zinc-700 rounded-full overflow-hidden mb-1.5">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: a.completed ? '#F5A623' : '#FFFD02' }} />
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
      className={`shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
        active ? 'bg-[#FFFD02]/15 text-[#FFFD02]' : 'text-[#A0A0B0] hover:text-zinc-300 hover:bg-[#1C1C27]'
      }`}>
      {icon}{label}
    </button>
  )
}

function ActorBirthdayCard({ item }: { item: ActorBirthdayFeed }) {
  return (
    <div className="bg-[#13131A] border border-[#FFFD02]/20 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-[#1C1C27]">
            {item.actorPhoto ? (
              <Image src={`https://image.tmdb.org/t/p/w185${item.actorPhoto}`} alt={item.actorName}
                width={48} height={48} className="w-full h-full object-cover object-top" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lg bg-[#2A2A3A]">🎂</div>
            )}
          </div>
          <span className="absolute -bottom-1 -right-1 text-base">🎂</span>
        </div>
        <div className="flex-1 min-w-0">
          <Badge label="Cumpleaños" color="gold" />
          <p className="text-sm font-semibold text-white mt-1">
            Hoy es el cumpleaños de{' '}
            <Link href={`/actor/${item.actorId}`} className="text-[#FFFD02] hover:underline">{item.actorName}</Link>
          </p>
          <p className="text-xs text-[#A0A0B0]">¡{item.age} años!</p>
        </div>
      </div>
    </div>
  )
}

function ActorReleaseCard({ item }: { item: ActorReleaseFeed }) {
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] hover:border-[#FFFD02]/20 rounded-xl p-4 transition-colors">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-[#1C1C27]">
            {item.actorPhoto ? (
              <Image src={`https://image.tmdb.org/t/p/w185${item.actorPhoto}`} alt={item.actorName}
                width={40} height={40} className="w-full h-full object-cover object-top" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm bg-[#2A2A3A] text-[#FFFD02]">
                {item.actorName[0]}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <Link href={`/actor/${item.actorId}`} className="text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors">
              {item.actorName}
            </Link>
            <Badge label="Nuevo estreno" color="blue" />
            <span className="text-[11px] text-[#A0A0B0] ml-auto shrink-0">{item.mediaYear}</span>
          </div>
          <div className="flex gap-3 mt-1">
            <Poster path={item.mediaPosterPath} title={item.mediaTitle} mediaType={item.mediaType} mediaId={item.mediaId} />
            <div className="min-w-0">
              <Link href={`/${item.mediaType}/${item.mediaId}`}
                className="text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors line-clamp-2 block">
                {item.mediaTitle}
              </Link>
              <p className="text-xs text-[#A0A0B0] mt-0.5">
                {item.mediaType === 'movie' ? 'Película' : 'Serie'} nueva con {item.actorName}
              </p>
            </div>
          </div>
        </div>
      </div>
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

  // Community lists state
  const [communityLists, setCommunityLists] = useState<CommunityListCard[]>([])
  const [listsLoading,   setListsLoading]   = useState(false)
  const [listsLoaded,    setListsLoaded]    = useState(false)

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
    const [reviewsRes, ratingsRes, watchlistRes, statsRes, levelUpsRes, listsRes] = await Promise.all([
      supabase.from('reviews').select('id, user_id, media_id, media_type, title, poster_path, rating, body, created_at, review_likes(user_id)').in('user_id', followIds).order('created_at', { ascending: false }).limit(40),
      supabase.from('ratings').select('id, user_id, media_id, media_type, title, poster_path, rating, rated_at').in('user_id', followIds).gte('rating', 3.5).order('rated_at', { ascending: false }).limit(40),
      supabase.from('watchlist').select('id, user_id, media_id, media_type, title, poster_path, added_at').in('user_id', followIds).order('added_at', { ascending: false }).limit(30),
      supabase.from('shared_stats').select('id, user_id, stat_title, stat_value, stat_detail, stat_image_url, created_at, shared_stat_likes(user_id)').in('user_id', followIds).order('created_at', { ascending: false }).limit(20),
      supabase.from('notifications').select('id, user_id, review_title, created_at').in('user_id', followIds).eq('type', 'level_up').order('created_at', { ascending: false }).limit(10),
      supabase.from('lists').select('id, user_id, title, description, created_at').in('user_id', followIds).eq('is_public', true).order('created_at', { ascending: false }).limit(15),
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

    // Fetch list item previews
    const listRows = (listsRes.data ?? []) as { id: string; user_id: string; title: string; description: string | null; created_at: string }[]
    let listFeeds: ListFeed[] = []
    if (listRows.length > 0) {
      const { data: listItems } = await supabase.from('list_items').select('list_id,poster_path').in('list_id', listRows.map(l => l.id)).order('position').limit(200)
      const previewMap: Record<string, (string | null)[]> = {}
      const countMap: Record<string, number> = {}
      for (const i of (listItems ?? [])) {
        previewMap[i.list_id] = previewMap[i.list_id] ?? []
        previewMap[i.list_id].push(i.poster_path)
        countMap[i.list_id] = (countMap[i.list_id] ?? 0) + 1
      }
      listFeeds = listRows.map(l => ({ key: `list-${l.id}`, type: 'list_created' as const, userId: l.user_id, sortTime: l.created_at, listId: l.id, listTitle: l.title, listDescription: l.description, previews: (previewMap[l.id] ?? []).slice(0, 4), itemCount: countMap[l.id] ?? 0 }))
    }

    // Actor feed: birthdays (from DB) + recent releases (TMDB, max 3 actors)
    const actorItems: (ActorBirthdayFeed | ActorReleaseFeed)[] = []
    const { data: followedActors } = await supabase
      .from('followed_actors')
      .select('actor_id, actor_name, actor_photo, birthday')
      .eq('user_id', uid)
      .limit(10)

    if (followedActors?.length) {
      const todayDate = new Date()
      const todayMD = `${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`
      const thirtyDaysAgo = new Date(todayDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const todayStr = todayDate.toISOString().slice(0, 10)

      // Birthday check (stored in DB — no TMDB call needed)
      for (const actor of followedActors) {
        if (actor.birthday && actor.birthday.slice(5) === todayMD) {
          const currentAge = todayDate.getFullYear() - new Date(actor.birthday).getFullYear()
          actorItems.push({
            key:       `actor-bday-${actor.actor_id}`,
            type:      'actor_birthday',
            sortTime:  todayDate.toISOString(),
            actorId:   actor.actor_id,
            actorName: actor.actor_name,
            actorPhoto: actor.actor_photo,
            age:       currentAge,
          })
        }
      }

      // Recent releases: fetch combined_credits for up to 3 actors
      if (TMDB_KEY) {
        await Promise.all(followedActors.slice(0, 3).map(async actor => {
          try {
            const res = await fetch(`${TMDB}/person/${actor.actor_id}/combined_credits?api_key=${TMDB_KEY}&language=es-AR`)
            if (!res.ok) return
            const credits = await res.json()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const recent = ((credits.cast ?? []) as any[])
              .filter(c => {
                const date = c.release_date ?? c.first_air_date ?? ''
                return date >= thirtyDaysAgo && date <= todayStr && c.poster_path
              })
              .slice(0, 2)
            for (const c of recent) {
              actorItems.push({
                key:        `actor-release-${actor.actor_id}-${c.id}`,
                type:       'actor_release',
                sortTime:   `${c.release_date ?? c.first_air_date ?? todayStr}T12:00:00.000Z`,
                actorId:    actor.actor_id,
                actorName:  actor.actor_name,
                actorPhoto: actor.actor_photo,
                mediaId:    c.id,
                mediaType:  c.media_type as 'movie' | 'tv',
                mediaTitle: c.title ?? c.name ?? '',
                mediaPosterPath: c.poster_path,
                mediaYear:  (c.release_date ?? c.first_air_date ?? '').slice(0, 4),
              })
            }
          } catch { /* skip */ }
        }))
      }
    }

    setRawFeed([...reviews, ...ratings, ...watchlist, ...stats, ...levelUps, ...listFeeds, ...actorItems].sort((a, b) => b.sortTime.localeCompare(a.sortTime)))
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

  // ── Community Lists (lazy) ─────────────────────────────────────────────────
  const loadCommunityLists = useCallback(async () => {
    setListsLoading(true)
    const { data: rawLists } = await supabase
      .from('lists')
      .select('id, title, description, tags, created_at, user_id')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(8)

    if (!rawLists?.length) { setCommunityLists([]); setListsLoading(false); setListsLoaded(true); return }

    const userIds = [...new Set(rawLists.map(l => l.user_id))]
    const listIds = rawLists.map(l => l.id)

    const [profilesRes, likesRes, itemsRes] = await Promise.all([
      supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', userIds),
      supabase.from('list_likes').select('list_id').in('list_id', listIds),
      supabase.from('list_items').select('list_id,poster_path').in('list_id', listIds).order('position').limit(100),
    ])

    const profileMap = Object.fromEntries((profilesRes.data ?? []).map(p => [p.id, p]))
    const likesByList: Record<string, number> = {}
    for (const l of (likesRes.data ?? [])) likesByList[l.list_id] = (likesByList[l.list_id] ?? 0) + 1
    const itemsByList: Record<string, { poster_path: string | null }[]> = {}
    for (const i of (itemsRes.data ?? [])) {
      itemsByList[i.list_id] = itemsByList[i.list_id] ?? []
      itemsByList[i.list_id].push(i)
    }

    setCommunityLists(
      rawLists
        .map(l => ({
          ...l,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          author: (profileMap as any)[l.user_id] ?? null,
          likeCount: likesByList[l.id] ?? 0,
          previews: (itemsByList[l.id] ?? []).slice(0, 4).map(i => i.poster_path),
          itemCount: (itemsByList[l.id] ?? []).length,
        }))
        .sort((a, b) => b.likeCount - a.likeCount)
    )
    setListsLoading(false)
    setListsLoaded(true)
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (tab === 'listas' && !listsLoaded) loadCommunityLists() }, [tab, listsLoaded, loadCommunityLists])

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
        <Link href="/auth" className="bg-[#FFFD02] hover:bg-[#E5EB00] text-black px-5 py-2 rounded-lg font-medium transition-colors">
          Iniciar sesión
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3 mb-1">
          <Users size={26} style={{ color: '#FFFD02' }} />
          Comunidad
        </h1>
        <p className="text-[#A0A0B0] text-sm">Descubrí qué están viendo tus amigos</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-1 overflow-x-auto no-scrollbar">
        <TabButton active={tab === 'feed'}         onClick={() => setTab('feed')}         icon={<Zap size={15} />}    label="Feed" />
        <TabButton active={tab === 'compat'}       onClick={() => setTab('compat')}       icon={<Heart size={15} />}  label="Compatibilidad" />
        <TabButton active={tab === 'achievements'} onClick={() => setTab('achievements')} icon={<Trophy size={15} />} label="Logros" />
        <TabButton active={tab === 'listas'}       onClick={() => setTab('listas')}       icon={<List size={15} />}   label="Listas" />
      </div>

      {/* ── FEED ── */}
      {tab === 'feed' && (
        <>
          {followingIds.length === 0 && (
            <div className="mb-6 bg-[#13131A] border border-[#FFFD02]/20 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="text-3xl select-none">👥</div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm mb-1">Seguí a otros usuarios para ver su actividad acá</p>
                <p className="text-[#A0A0B0] text-xs">Cuando sigas gente, verás sus reseñas, calificaciones y listas en este feed.</p>
              </div>
              <Link
                href="/comunidad?tab=compat"
                className="shrink-0 text-sm font-semibold text-black bg-[#FFFD02] hover:bg-[#E5EB00] px-4 py-2 rounded-full transition-colors"
              >
                Descubrir usuarios →
              </Link>
            </div>
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
                  if (item.type === 'list_created') return <ListCard key={item.key} item={item} profiles={profiles} />
                  if (item.type === 'recommendation') return <RecommendationCard key={item.key} item={item} currentUserId={currentUserId} supabase={supabase} />
                  if (item.type === 'actor_birthday') return <ActorBirthdayCard key={item.key} item={item} />
                  if (item.type === 'actor_release') return <ActorReleaseCard key={item.key} item={item} />
                  return null
                })}
              </div>
              {visibleCount < displayFeed.length && (
                <button onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="mt-6 w-full py-3 rounded-xl border border-[#2A2A3A] text-[#A0A0B0] hover:border-[#FFFD02] hover:text-white text-sm font-medium transition-colors">
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
                <span className="text-xs font-semibold text-[#FFFD02]">{achievements.filter(a => a.completed).length}/{achievements.length}</span>
              </div>
              {achievements.filter(a => a.completed).length > 0 && <p className="text-xs text-zinc-600 uppercase tracking-wider font-semibold mb-2">Completados</p>}
              <div className="space-y-3">{achievements.filter(a => a.completed).map(a => <AchievementCard key={a.id} a={a} />)}</div>
              {achievements.filter(a => !a.completed).length > 0 && <p className="text-xs text-zinc-600 uppercase tracking-wider font-semibold mt-5 mb-2">En progreso</p>}
              <div className="space-y-3">{achievements.filter(a => !a.completed).map(a => <AchievementCard key={a.id} a={a} />)}</div>
            </>
          )}
        </>
      )}

      {/* ── LISTAS ── */}
      {tab === 'listas' && (
        <>
          <div className="flex items-center justify-between mb-5">
            <p className="text-xs text-[#A0A0B0]">Listas públicas, ordenadas por popularidad</p>
            <div className="flex items-center gap-3">
              <Link href="/listas" className="text-xs text-[#A0A0B0] hover:text-white transition-colors shrink-0">Ver todas →</Link>
              <Link href="/listas/nueva" className="flex items-center gap-1.5 text-xs font-semibold text-black bg-[#FFFD02] hover:bg-[#E5EB00] px-3 py-1.5 rounded-full transition-colors shrink-0">
                <Plus size={12} /> Crear lista
              </Link>
            </div>
          </div>
          {listsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 h-44" />
              ))}
            </div>
          ) : communityLists.length === 0 ? (
            <div className="text-center py-16 text-[#A0A0B0]">
              <p>No hay listas públicas todavía.</p>
              <Link href="/listas/nueva" className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-black bg-[#FFFD02] hover:bg-[#E5EB00] transition-colors">
                <Plus size={14} /> Crear la primera
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                {communityLists.map(l => (
                  <Link key={l.id} href={`/listas/${l.id}`}
                    className="group bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 hover:border-[#FFFD02]/50 transition-all block">
                    <div className="flex gap-1 mb-3 h-[80px]">
                      {l.previews.slice(0, 4).map((p, i) => (
                        <div key={i} className="flex-1 rounded-md overflow-hidden bg-[#1C1C27]">
                          {p ? <Image src={`https://image.tmdb.org/t/p/w185${p}`} alt="" width={80} height={80} className="w-full h-full object-cover" /> : null}
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, 4 - l.previews.length) }).map((_, i) => (
                        <div key={`e-${i}`} className="flex-1 rounded-md bg-[#1C1C27]" />
                      ))}
                    </div>
                    <p className="font-semibold text-white group-hover:text-[#FFFD02] transition-colors line-clamp-1 mb-1 text-sm">{l.title}</p>
                    {l.description && <p className="text-xs text-[#A0A0B0] line-clamp-1 mb-1">{l.description}</p>}
                    <div className="flex items-center justify-between text-xs text-[#A0A0B0] mt-1">
                      <span>{l.itemCount} {l.itemCount === 1 ? 'título' : 'títulos'}</span>
                      <span className="flex items-center gap-2">
                        <span className="flex items-center gap-1"><Heart size={10} /> {l.likeCount}</span>
                        <span>@{l.author?.username ?? 'usuario'}</span>
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="text-center">
                <Link href="/listas"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold border border-[#FFFD02]/40 text-[#FFFD02] hover:bg-[#FFFD02]/10 transition-colors">
                  Ver todas las listas →
                </Link>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
