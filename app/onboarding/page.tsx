'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Camera, Eye, Heart, Bookmark, Check, X, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { ALL_PLATFORMS } from '@/lib/providers'
import { getLevelInfo } from '@/lib/points'
import { sendNotification } from '@/lib/notify'
import { StarIcon } from '@/components/StarDisplay'
import type { User } from '@supabase/supabase-js'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB = 'https://api.themoviedb.org/3'

const GENRES = [
  'Acción', 'Comedia', 'Drama', 'Terror', 'Ciencia ficción', 'Thriller',
  'Animación', 'Romance', 'Documental', 'Aventura', 'Fantasía', 'Misterio',
  'Historia', 'Crimen', 'Musical', 'Western', 'Guerra', 'Familia',
]

interface SuggestedUser {
  id: string; username: string | null; display_name: string | null
  avatar_url: string | null; points: number | null; level: number | null
}

interface OnboardingMovie {
  id: number; title: string; year: string
  posterPath: string | null; backdropPath: string | null
  voteAverage: number; genreIds: number[]
}

interface MovieAction {
  watched: boolean; liked: boolean; rating: number | null; inWatchlist: boolean
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: number }) {
  const TOTAL = 5
  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="flex justify-between text-xs text-[#A0A0B0] mb-2">
        <span>Paso {step} de {TOTAL}</span>
        <span className="tabular-nums">{Math.round((step / TOTAL) * 100)}%</span>
      </div>
      <div className="h-1.5 bg-[#1C1C27] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(step / TOTAL) * 100}%`, backgroundColor: '#FFFD02' }}
        />
      </div>
    </div>
  )
}

// ── Inline star rater ─────────────────────────────────────────────────────────

function InlineStarRater({ current, onRate }: { current: number | null; onRate: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  const display = hover || current || 0
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => {
        const fill: 'full' | 'half' | 'empty' =
          display >= n ? 'full' : display >= n - 0.5 ? 'half' : 'empty'
        return (
          <button
            key={n} type="button"
            className="transition-transform hover:scale-110"
            onMouseMove={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              setHover(e.clientX - rect.left < rect.width / 2 ? n - 0.5 : n)
            }}
            onMouseLeave={() => setHover(0)}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              onRate(e.clientX - rect.left < rect.width / 2 ? n - 0.5 : n)
            }}
          >
            <StarIcon fill={fill} size={28} color="text-[#F5A623]" />
          </button>
        )
      })}
    </div>
  )
}

// ── Step 1 — Profile (Avatar / Name / Bio) ────────────────────────────────────

function ProfileStep({
  displayName, setDisplayName, bio, setBio, avatarUrl,
  onAvatarChange, uploading,
}: {
  displayName: string; setDisplayName: (v: string) => void
  bio: string; setBio: (v: string) => void
  avatarUrl: string | null
  onAvatarChange: (file: File) => void
  uploading: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-sm mx-auto">

      {/* Avatar */}
      <div className="relative">
        <div className="w-24 h-24 rounded-full overflow-hidden bg-[#1C1C27] ring-4 ring-[#2A2A3A] flex items-center justify-center">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span className="text-4xl select-none">🙂</span>
          )}
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <label className="absolute bottom-0.5 right-0.5 w-8 h-8 rounded-full bg-[#FFFD02] flex items-center justify-center cursor-pointer shadow-lg hover:bg-[#E5EB00] transition-colors">
          <Camera size={14} className="text-black" />
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onAvatarChange(f) }}
          />
        </label>
      </div>
      <p className="text-xs text-[#A0A0B0] -mt-4">Foto de perfil (opcional)</p>

      {/* Display name */}
      <div className="w-full">
        <label className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-wider mb-1.5 block">
          Nombre
        </label>
        <input
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          placeholder="¿Cómo te llamás?"
          maxLength={50}
          className="w-full bg-[#13131A] border border-[#2A2A3A] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#FFFD02] transition-colors placeholder-[#A0A0B0]"
        />
      </div>

      {/* Bio */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-wider">
            Bio <span className="font-normal normal-case text-zinc-600">(opcional)</span>
          </label>
          <span className="text-[10px] text-zinc-600 tabular-nums">{bio.length}/160</span>
        </div>
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="Contanos algo sobre vos..."
          maxLength={160}
          rows={3}
          className="w-full bg-[#13131A] border border-[#2A2A3A] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#FFFD02] transition-colors placeholder-[#A0A0B0] resize-none"
        />
      </div>
    </div>
  )
}

// ── Step 2 — Genres ───────────────────────────────────────────────────────────

function GenresStep({ selected, onToggle }: { selected: string[]; onToggle: (g: string) => void }) {
  return (
    <div>
      <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
        {GENRES.map(g => {
          const active = selected.includes(g)
          return (
            <button
              key={g}
              onClick={() => onToggle(g)}
              className="px-4 py-2 rounded-full text-sm font-medium border transition-all duration-150"
              style={{
                borderColor: active ? '#FFFD02' : '#2A2A3A',
                backgroundColor: active ? 'rgba(255,253,2,0.15)' : 'transparent',
                color: active ? '#fff' : '#A0A0B0',
                transform: active ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              {active && <Check size={12} className="inline mr-1" />}
              {g}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-[#A0A0B0] mt-4 text-center">
        {selected.length < 3 ? (
          <>Elegí al menos <span className="text-white font-semibold">3 géneros</span>{' '}
            · <span className="text-white tabular-nums">{selected.length}/3</span></>
        ) : (
          <><span style={{ color: '#22C55E' }}>✓</span>{' '}
            Elegiste <span className="text-white font-semibold">{selected.length}</span> géneros</>
        )}
      </p>
    </div>
  )
}

// ── Step 3 — Platforms ────────────────────────────────────────────────────────

function PlatformsStep({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const [imgErrors, setImgErrors] = useState<Set<number>>(new Set())
  const platforms = ALL_PLATFORMS.filter(p => p.fallbackLogoPath)
  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-w-lg mx-auto w-full">
        {platforms.map(p => {
          const active = selected.includes(String(p.id))
          const logoUrl = `https://image.tmdb.org/t/p/original${p.fallbackLogoPath}`
          return (
            <button
              key={p.id}
              onClick={() => onToggle(String(p.id))}
              className="relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all"
              style={{
                borderColor: active ? '#FFFD02' : '#2A2A3A',
                backgroundColor: active ? 'rgba(255,253,2,0.1)' : '#13131A',
              }}
            >
              {active && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFFD02' }}>
                  <Check size={11} className="text-black" />
                </div>
              )}
              <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0">
                {!imgErrors.has(p.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl} alt={p.name}
                    className="w-full h-full object-cover"
                    onError={() => setImgErrors(prev => new Set(prev).add(p.id))}
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white text-[9px] font-bold text-center p-1"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name}
                  </div>
                )}
              </div>
              <span className="text-[11px] text-center leading-tight" style={{ color: active ? '#fff' : '#A0A0B0' }}>
                {p.name}
              </span>
            </button>
          )
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-[#A0A0B0] mt-4 text-center">
          Elegiste <span className="text-white font-semibold">{selected.length}</span>{' '}
          {selected.length === 1 ? 'plataforma' : 'plataformas'}
        </p>
      )}
    </div>
  )
}

// ── Step 4 — Suggested users ──────────────────────────────────────────────────

function SuggestedUsersStep({
  users, followed, onFollow,
}: { users: SuggestedUser[]; followed: Set<string>; onFollow: (id: string) => void }) {
  return (
    <div>
      <div className="space-y-3 max-w-lg mx-auto w-full">
        {users.map(u => {
          const name = u.display_name ?? u.username ?? 'Usuario'
          const initials = name[0]?.toUpperCase() ?? '?'
          const info = getLevelInfo(u.level ?? 1, u.points ?? 0)
          const isFollowing = followed.has(u.id)
          const isVerified = u.username === 'Ferlageok' || u.username === 'ferlageok'
          return (
            <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#2A2A3A] bg-[#13131A]">
              <div className="w-11 h-11 rounded-full overflow-hidden bg-[#1C1C27] shrink-0">
                {u.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatar_url} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-base font-bold bg-[#2A2A3A] text-[#FFFD02]">
                    {initials}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate min-w-0 flex-1">{name}</p>
                  {isVerified && (
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#1D9BF0"/><path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  )}
                </div>
                <p className="text-xs text-[#A0A0B0]">{info.emoji} {info.name}</p>
              </div>
              <button
                onClick={() => onFollow(u.id)}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 flex items-center gap-1"
                style={{
                  backgroundColor: isFollowing ? 'rgba(239,68,68,0.1)' : '#2563EB',
                  color: isFollowing ? 'rgb(248,113,113)' : '#fff',
                  border: isFollowing ? '1px solid rgba(239,68,68,0.4)' : 'none',
                }}
              >
                {isFollowing ? <><Check size={11} /> Siguiendo</> : 'Seguir'}
              </button>
            </div>
          )
        })}
      </div>
      {followed.size > 0 && (
        <p className="text-xs text-[#A0A0B0] mt-4 text-center">
          Siguiendo a <span className="text-white font-semibold">{followed.size}</span>{' '}
          {followed.size === 1 ? 'persona' : 'personas'}
        </p>
      )}
    </div>
  )
}

// ── Step 5 — Rate movies (full-screen) ────────────────────────────────────────

function RateMoviesStep({
  movies, actions, onAction, onLoadMore, onFinish,
}: {
  movies: OnboardingMovie[]
  actions: Map<number, MovieAction>
  onAction: (id: number, type: 'watched' | 'liked' | 'watchlist' | 'rating', value?: number) => void
  onLoadMore: () => void
  onFinish: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const touchStartX = useRef<number | null>(null)

  const movie = movies[idx]
  const act = movie ? (actions.get(movie.id) ?? { watched: false, liked: false, rating: null, inWatchlist: false }) : null

  useEffect(() => {
    if (movies.length > 0 && idx >= movies.length - 3) onLoadMore()
  }, [idx, movies.length, onLoadMore])

  const next = useCallback(() => {
    setRatingOpen(false)
    setIdx(i => Math.min(i + 1, movies.length - 1))
  }, [movies.length])

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = touchStartX.current - e.changedTouches[0].clientX
    if (dx > 50) next()
    touchStartX.current = null
  }

  const handleFinish = async () => { setFinishing(true); await onFinish() }

  if (!movie || !act) return null

  const backdropUrl = movie.backdropPath ? `https://image.tmdb.org/t/p/w1280${movie.backdropPath}` : null
  const totalLabel = movies.length >= 50 ? 50 : movies.length

  return (
    <div
      className="relative flex flex-col items-center justify-center overflow-hidden"
      style={{ height: '100dvh', backgroundColor: '#0A0A0F' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {backdropUrl && (
        <div className="absolute inset-0" style={{ backgroundImage: `url(${backdropUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(10,10,15,0.2) 0%, rgba(10,10,15,0.4) 35%, rgba(10,10,15,0.85) 65%, rgba(10,10,15,1) 100%)' }} />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-4">
        <p className="text-xs text-white/60 tabular-nums">Película {idx + 1} de {totalLabel}</p>
        <button
          onClick={handleFinish}
          disabled={finishing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-black transition-all"
          style={{ backgroundColor: 'rgba(255,253,2,0.9)' }}
        >
          {finishing
            ? <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            : <X size={14} />
          }
          Terminar
        </button>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center pt-20 pb-6 sm:pb-10 px-4 w-full max-w-sm mx-auto">

        <div className="relative w-[280px] sm:w-[320px] aspect-[2/3] rounded-xl overflow-hidden bg-[#1C1C27] shadow-2xl mb-5">
          {movie.posterPath ? (
            <Image
              src={`https://image.tmdb.org/t/p/w500${movie.posterPath}`}
              alt={movie.title} fill
              className="object-cover"
              sizes="(max-width: 640px) 280px, 320px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#2A2A3A] text-[#FFFD02] text-xs text-center px-2">
              {movie.title}
            </div>
          )}
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-1 leading-tight">{movie.title}</h2>
        <p className="text-sm text-white/60 mb-4">
          {movie.year}{movie.voteAverage > 0 && ` · ★ ${movie.voteAverage.toFixed(1)}`}
        </p>

        {ratingOpen && (
          <div className="flex flex-col items-center gap-2 mb-4 p-4 rounded-2xl bg-[#13131A]/90 border border-[#2A2A3A]">
            <p className="text-xs text-[#A0A0B0]">¿Cuántas estrellas le das?</p>
            <InlineStarRater
              current={act.rating}
              onRate={v => { onAction(movie.id, 'rating', v); setRatingOpen(false) }}
            />
          </div>
        )}

        <div className="flex gap-3 mb-5 flex-wrap justify-center">
          {[
            { type: 'watched' as const, icon: <Eye size={20} />, label: 'Ya la vi', active: act.watched, activeColor: '#22c55e' },
            { type: 'liked' as const, icon: <Heart size={20} fill={act.liked ? 'currentColor' : 'none'} />, label: 'Me gusta', active: act.liked, activeColor: '#ef4444' },
            { type: 'rating' as const, icon: act.rating ? <span className="text-base font-bold">{act.rating}★</span> : <span className="text-lg">★</span>, label: 'Calificar', active: act.rating !== null, activeColor: '#F5A623' },
            { type: 'watchlist' as const, icon: <Bookmark size={20} fill={act.inWatchlist ? 'currentColor' : 'none'} />, label: 'Ver después', active: act.inWatchlist, activeColor: '#3b82f6' },
          ].map(btn => (
            <button
              key={btn.type}
              onClick={() => btn.type === 'rating' ? setRatingOpen(r => !r) : onAction(movie.id, btn.type)}
              className="flex flex-col items-center gap-1 px-4 py-2.5 rounded-xl transition-all min-w-[64px]"
              style={{
                backgroundColor: btn.active ? `${btn.activeColor}22` : 'rgba(28,28,39,0.9)',
                color: btn.active ? btn.activeColor : 'rgba(255,255,255,0.6)',
                border: `1px solid ${btn.active ? btn.activeColor + '60' : '#2A2A3A'}`,
              }}
            >
              {btn.icon}
              <span className="text-[10px] font-medium">{btn.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={next}
          disabled={idx >= movies.length - 1}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all disabled:opacity-30"
          style={{ backgroundColor: 'rgba(255,253,2,0.15)', color: '#FFFD02', border: '1px solid rgba(255,253,2,0.3)' }}
        >
          Siguiente película
          <ChevronRight size={16} className="animate-bounce" style={{ animationDuration: '1.2s' }} />
        </button>

        <p className="text-xs text-white/30 mt-3">Deslizá para ir al siguiente</p>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = useRef(createClient()).current

  const [user,    setUser]    = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [step,    setStep]    = useState(1)
  const [saving,  setSaving]  = useState(false)
  const [visible, setVisible] = useState(true)

  // Step 1: Profile
  const [displayName,     setDisplayName]     = useState('')
  const [bio,             setBio]             = useState('')
  const [avatarUrl,       setAvatarUrl]       = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)

  // Skip
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [skipping,        setSkipping]        = useState(false)

  // Steps 2-4
  const [selectedGenres,    setSelectedGenres]    = useState<string[]>([])
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])
  const [suggestedUsers,    setSuggestedUsers]    = useState<SuggestedUser[]>([])
  const [followed,          setFollowed]          = useState<Set<string>>(new Set())

  // Step 5
  const [movies,       setMovies]       = useState<OnboardingMovie[]>([])
  const [moviePage,    setMoviePage]    = useState(1)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [movieActions, setMovieActions] = useState<Map<number, MovieAction>>(new Map())

  // Fade transition between steps
  useEffect(() => {
    setVisible(false)
    const t = setTimeout(() => setVisible(true), 150)
    return () => clearTimeout(t)
  }, [step])

  // Auth guard + pre-fill
  useEffect(() => {
    async function init() {
      const force = typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('force') === 'true'

      const { data: { session } } = await supabase.auth.getSession()
      const u = session?.user ?? null
      if (!u) { router.replace('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed_at, onboarding_skipped, username, display_name, avatar_url')
        .eq('id', u.id)
        .maybeSingle()

      if (!force) {
        if (profile?.onboarding_completed_at != null || profile?.onboarding_skipped === true) {
          router.replace('/')
          return
        }
      }

      // Pre-fill step 1
      setDisplayName(profile?.display_name ?? profile?.username ?? '')
      setAvatarUrl(profile?.avatar_url ?? null)

      setUser(u)
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Avatar upload
  const handleAvatarChange = async (file: File) => {
    if (!user) return
    setAvatarUploading(true)
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (!error) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(path)
        setAvatarUrl(data.publicUrl)
        await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
      }
    } catch { /* ignore */ }
    setAvatarUploading(false)
  }

  // Load suggested users (step 4)
  useEffect(() => {
    if (step !== 4 || suggestedUsers.length > 0) return
    async function loadUsers() {
      const [topRes, ferlageokRes] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, avatar_url, points, level').order('points', { ascending: false, nullsFirst: false }).limit(10),
        supabase.from('profiles').select('id, username, display_name, avatar_url, points, level').ilike('username', 'ferlageok').maybeSingle(),
      ])
      const topUsers: SuggestedUser[] = (topRes.data ?? []).filter(u => u.id !== user?.id)
      const ferlageok = ferlageokRes.data
      if (ferlageok && ferlageok.id !== user?.id && !topUsers.find(u => u.id === ferlageok.id)) topUsers.push(ferlageok)
      setSuggestedUsers(topUsers.slice(0, 6))
    }
    loadUsers()
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load movies (step 5)
  const loadMovies = useCallback(async (page: number) => {
    if (!TMDB_KEY || loadingMore) return
    setLoadingMore(true)
    try {
      const [popRes, topRes] = await Promise.all([
        fetch(`${TMDB}/movie/popular?api_key=${TMDB_KEY}&language=es-AR&page=${page}`).then(r => r.ok ? r.json() : { results: [] }),
        fetch(`${TMDB}/movie/top_rated?api_key=${TMDB_KEY}&language=es-AR&page=${page}`).then(r => r.ok ? r.json() : { results: [] }),
      ])
      type RawMovie = { id: number; title: string; poster_path: string | null; backdrop_path: string | null; release_date?: string; vote_average: number; genre_ids: number[] }
      const combined: RawMovie[] = [...(popRes.results ?? []), ...(topRes.results ?? [])]
      const seen = new Set<number>()
      const unique: OnboardingMovie[] = []
      for (const m of combined) {
        if (!seen.has(m.id) && m.backdrop_path) {
          seen.add(m.id)
          unique.push({ id: m.id, title: m.title, year: (m.release_date ?? '').slice(0, 4), posterPath: m.poster_path, backdropPath: m.backdrop_path, voteAverage: m.vote_average, genreIds: m.genre_ids ?? [] })
        }
      }
      setMovies(prev => { const existingIds = new Set(prev.map(m => m.id)); return [...prev, ...unique.filter(m => !existingIds.has(m.id))] })
      setMoviePage(page)
    } catch { /* ignore */ }
    setLoadingMore(false)
  }, [loadingMore]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step === 5 && movies.length === 0) loadMovies(1)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handlers
  const toggleGenre    = (g: string)  => setSelectedGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  const togglePlatform = (id: string) => setSelectedPlatforms(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleFollow = async (targetId: string) => {
    if (!user) return
    const nowFollowing = followed.has(targetId)
    setFollowed(prev => { const next = new Set(prev); nowFollowing ? next.delete(targetId) : next.add(targetId); return next })
    if (!nowFollowing) {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId })
      sendNotification(supabase as Parameters<typeof sendNotification>[0], { user_id: targetId, actor_id: user.id, type: 'follow' })
    } else {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId)
    }
  }

  const handleMovieAction = async (movieId: number, type: 'watched' | 'liked' | 'watchlist' | 'rating', ratingValue?: number) => {
    if (!user) return
    const movie = movies.find(m => m.id === movieId)
    if (!movie) return
    const prev = movieActions.get(movieId) ?? { watched: false, liked: false, rating: null, inWatchlist: false }

    if (type === 'watched') {
      const v = !prev.watched
      setMovieActions(m => new Map(m).set(movieId, { ...prev, watched: v }))
      if (v) await supabase.from('watched').upsert({ user_id: user.id, media_id: movieId, media_type: 'movie', title: movie.title, poster_path: movie.posterPath, watched_at: new Date().toISOString() }, { onConflict: 'user_id,media_id,media_type' })
      else   await supabase.from('watched').delete().eq('user_id', user.id).eq('media_id', movieId).eq('media_type', 'movie')
    }
    if (type === 'liked') {
      const v = !prev.liked
      setMovieActions(m => new Map(m).set(movieId, { ...prev, liked: v }))
      if (v) await supabase.from('favorites').upsert({ user_id: user.id, media_id: movieId, media_type: 'movie', title: movie.title, poster_path: movie.posterPath, genre_ids: movie.genreIds }, { onConflict: 'user_id,media_id,media_type' })
      else   await supabase.from('favorites').delete().eq('user_id', user.id).eq('media_id', movieId).eq('media_type', 'movie')
    }
    if (type === 'rating' && ratingValue !== undefined) {
      setMovieActions(m => new Map(m).set(movieId, { ...prev, rating: ratingValue }))
      await supabase.from('ratings').upsert({ user_id: user.id, media_id: movieId, media_type: 'movie', title: movie.title, poster_path: movie.posterPath, rating: ratingValue, rated_at: new Date().toISOString() }, { onConflict: 'user_id,media_id,media_type' })
    }
    if (type === 'watchlist') {
      const v = !prev.inWatchlist
      setMovieActions(m => new Map(m).set(movieId, { ...prev, inWatchlist: v }))
      if (v) await supabase.from('watchlist').upsert({ user_id: user.id, media_id: movieId, media_type: 'movie', title: movie.title, poster_path: movie.posterPath }, { onConflict: 'user_id,media_id,media_type' })
      else   await supabase.from('watchlist').delete().eq('user_id', user.id).eq('media_id', movieId).eq('media_type', 'movie')
    }
  }

  const handleNext = async () => {
    if (!user) return
    setSaving(true)
    if (step === 1) {
      const updates: Record<string, unknown> = {}
      if (displayName.trim()) updates.display_name = displayName.trim()
      if (Object.keys(updates).length > 0) {
        await supabase.from('profiles').update(updates).eq('id', user.id)
      }
      // Try to save bio (column may need migration if not present)
      if (bio.trim()) {
        await supabase.from('profiles').update({ bio: bio.trim() } as Record<string, unknown>).eq('id', user.id)
      }
      setStep(2)
    } else if (step === 2) {
      await supabase.from('profiles').update({ favorite_genres: selectedGenres }).eq('id', user.id)
      setStep(3)
    } else if (step === 3) {
      await supabase.from('profiles').update({ favorite_platforms: selectedPlatforms }).eq('id', user.id)
      setStep(4)
    } else if (step === 4) {
      setStep(5)
    }
    setSaving(false)
  }

  const handleSkip = async () => {
    if (!user || skipping) return
    setSkipping(true)
    await supabase.from('profiles').update({ onboarding_skipped: true }).eq('id', user.id)
    localStorage.setItem('glynbox_welcome', '1')
    router.replace('/')
  }

  const handleFinish = async () => {
    if (!user) return
    document.cookie = 'new_user=; max-age=0; path=/'
    await supabase.from('profiles').update({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    }).eq('id', user.id)
    localStorage.setItem('glynbox_welcome', '1')
    router.replace('/')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#0A0A0F' }}>
        <div className="w-8 h-8 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Step 5: full-screen movie rating
  if (step === 5) {
    return (
      <RateMoviesStep
        movies={movies} actions={movieActions}
        onAction={handleMovieAction}
        onLoadMore={() => loadMovies(moviePage + 1)}
        onFinish={handleFinish}
      />
    )
  }

  const STEP_ICONS = ['', '👤', '🎬', '📺', '👥']
  const stepConfig = [
    null,
    { title: '¿Cómo te llamás?',        sub: 'Tu perfil es lo primero que ven los demás',  canNext: true                        },
    { title: '¿Qué te gusta ver?',       sub: 'Elegí al menos 3 géneros favoritos',          canNext: selectedGenres.length >= 3  },
    { title: '¿Qué plataformas tenés?',  sub: 'Te mostramos el contenido disponible',         canNext: selectedPlatforms.length > 0 },
    { title: 'Seguí a otros usuarios',   sub: 'Conectate con la comunidad de Glynbox',        canNext: true                        },
  ]
  const cfg = stepConfig[step]!

  return (
    <div className="min-h-screen flex flex-col items-center py-8 px-4" style={{ backgroundColor: '#0A0A0F' }}>

      {/* Skip confirmation modal */}
      {showSkipConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-white font-bold text-lg mb-2">¿Saltar el onboarding?</h3>
            <p className="text-[#A0A0B0] text-sm mb-6">
              Podés completarlo después desde tu perfil. Mientras tanto, algunas recomendaciones serán menos personalizadas.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSkipConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-[#2A2A3A] text-zinc-400 hover:text-white transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleSkip}
                disabled={skipping}
                className="flex-1 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {skipping && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Saltar →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header: logo + skip */}
      <div className="w-full max-w-xl flex items-center justify-between mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Glynbox" style={{ height: '28px', width: 'auto', objectFit: 'contain' }} />
        <button
          onClick={() => setShowSkipConfirm(true)}
          className="text-xs text-[#A0A0B0] hover:text-zinc-300 transition-colors"
        >
          Saltar onboarding
        </button>
      </div>

      {/* Progress bar */}
      <ProgressBar step={step} />

      {/* Step content */}
      <div
        className="w-full flex flex-col items-center"
        style={{
          opacity: visible ? 1 : 0,
          transform: `translateY(${visible ? 0 : 10}px)`,
          transition: 'opacity 0.2s ease, transform 0.2s ease',
        }}
      >
        <div className="text-center mt-8 mb-8">
          <div className="text-5xl mb-4" role="img" aria-label={cfg.title}>{STEP_ICONS[step]}</div>
          <h1 className="font-bold text-white mb-2" style={{ fontSize: '28px' }}>{cfg.title}</h1>
          <p className="text-sm text-[#A0A0B0] max-w-sm mx-auto">{cfg.sub}</p>
        </div>

        <div className="w-full max-w-xl">
          {step === 1 && (
            <ProfileStep
              displayName={displayName} setDisplayName={setDisplayName}
              bio={bio} setBio={setBio}
              avatarUrl={avatarUrl}
              onAvatarChange={handleAvatarChange}
              uploading={avatarUploading}
            />
          )}
          {step === 2 && <GenresStep selected={selectedGenres} onToggle={toggleGenre} />}
          {step === 3 && <PlatformsStep selected={selectedPlatforms} onToggle={togglePlatform} />}
          {step === 4 && (
            suggestedUsers.length === 0
              ? <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" /></div>
              : <SuggestedUsersStep users={suggestedUsers} followed={followed} onFollow={handleFollow} />
          )}
        </div>

        {/* Next button */}
        <button
          onClick={handleNext}
          disabled={!cfg.canNext || saving}
          className="mt-10 px-10 py-4 text-black font-bold text-base transition-all disabled:opacity-40"
          style={{ backgroundColor: '#FFFD02', borderRadius: '50px' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#E5EB00' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#FFFD02' }}
        >
          {saving
            ? <span className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin inline-block" />
            : step === 4 ? 'Calificar películas →' : 'Siguiente →'
          }
        </button>

        {/* Step 4: option to go directly to finish */}
        {step === 4 && (
          <button
            onClick={handleFinish}
            className="mt-4 text-xs text-zinc-600 hover:text-[#A0A0B0] transition-colors"
          >
            Saltar calificación de películas →
          </button>
        )}
      </div>
    </div>
  )
}
