'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Eye, Heart, Bookmark, ChevronDown, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { ALL_PLATFORMS } from '@/lib/providers'
import { getLevelInfo } from '@/lib/points'
import { StarIcon } from '@/components/StarDisplay'
import type { User } from '@supabase/supabase-js'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB = 'https://api.themoviedb.org/3'

// ── Constants ─────────────────────────────────────────────────────────────────

const GENRES = [
  'Acción', 'Comedia', 'Drama', 'Terror', 'Ciencia ficción', 'Thriller',
  'Animación', 'Romance', 'Documental', 'Aventura', 'Fantasía', 'Misterio',
  'Historia', 'Crimen', 'Musical', 'Western', 'Guerra', 'Familia',
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface SuggestedUser {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  points: number | null
  level: number | null
}

interface OnboardingMovie {
  id: number
  title: string
  year: string
  posterPath: string | null
  backdropPath: string | null
  voteAverage: number
  genreIds: number[]
}

interface MovieAction {
  watched: boolean
  liked: boolean
  rating: number | null
  inWatchlist: boolean
}

// ── Progress dots ─────────────────────────────────────────────────────────────

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3, 4].map(n => (
        <div
          key={n}
          className="rounded-full transition-all duration-300"
          style={{
            width: n === step ? 24 : 10,
            height: 10,
            backgroundColor: n <= step ? '#FFFD02' : '#2A2A3A',
          }}
        />
      ))}
    </div>
  )
}

// ── Inline star rater ─────────────────────────────────────────────────────────

function InlineStarRater({
  current, onRate,
}: { current: number | null; onRate: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  const display = hover || current || 0
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => {
        const fill: 'full' | 'half' | 'empty' =
          display >= n ? 'full' : display >= n - 0.5 ? 'half' : 'empty'
        return (
          <button
            key={n}
            type="button"
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

// ── Step 1 — Genres ───────────────────────────────────────────────────────────

function GenresStep({
  selected, onToggle,
}: { selected: string[]; onToggle: (g: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
      {GENRES.map(g => {
        const active = selected.includes(g)
        return (
          <button
            key={g}
            onClick={() => onToggle(g)}
            className="px-4 py-2 rounded-full text-sm font-medium border transition-all"
            style={{
              borderColor: active ? '#FFFD02' : '#2A2A3A',
              backgroundColor: active ? 'rgba(255,253,2,0.15)' : 'transparent',
              color: active ? '#000' : '#A0A0B0',
            }}
          >
            {active && <Check size={12} className="inline mr-1" />}
            {g}
          </button>
        )
      })}
    </div>
  )
}

// ── Step 2 — Platforms ────────────────────────────────────────────────────────

function PlatformsStep({
  selected, onToggle,
}: { selected: string[]; onToggle: (id: string) => void }) {
  const [imgErrors, setImgErrors] = useState<Set<number>>(new Set())
  const platforms = ALL_PLATFORMS.filter(p => p.fallbackLogoPath)

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-w-lg mx-auto w-full">
      {platforms.map(p => {
        const active = selected.includes(String(p.id))
        const logoUrl = `https://image.tmdb.org/t/p/original${p.fallbackLogoPath}`
        return (
          <button
            key={p.id}
            onClick={() => onToggle(String(p.id))}
            className="flex flex-col items-center gap-2 p-3 rounded-xl border transition-all"
            style={{
              borderColor: active ? '#FFFD02' : '#2A2A3A',
              backgroundColor: active ? 'rgba(255,253,2,0.1)' : '#13131A',
            }}
          >
            <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0">
              {!imgErrors.has(p.id) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={p.name}
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
            {active && (
              <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFFD02' }}>
                <Check size={10} className="text-black" />
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Step 3 — Suggested users ──────────────────────────────────────────────────

function SuggestedUsersStep({
  users, followed, onFollow,
}: {
  users: SuggestedUser[]
  followed: Set<string>
  onFollow: (userId: string) => void
}) {
  return (
    <div className="space-y-3 max-w-lg mx-auto w-full">
      {users.map(u => {
        const name = u.display_name ?? u.username ?? 'Usuario'
        const initials = name[0]?.toUpperCase() ?? '?'
        const info = getLevelInfo(u.level ?? 1, u.points ?? 0)
        const isFollowing = followed.has(u.id)
        return (
          <div
            key={u.id}
            className="flex items-center gap-3 p-3 rounded-xl border border-[#2A2A3A] bg-[#13131A]"
          >
            <div className="w-11 h-11 rounded-full overflow-hidden bg-[#1C1C27] shrink-0">
              {u.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.avatar_url} alt={name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-base font-bold text-[#A0A0B0]">
                  {initials}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{name}</p>
              <p className="text-xs text-[#A0A0B0]">{info.emoji} {info.name}</p>
            </div>
            <button
              onClick={() => onFollow(u.id)}
              className="shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                backgroundColor: isFollowing ? 'transparent' : '#FFFD02',
                color: isFollowing ? '#A0A0B0' : '#000',
                border: isFollowing ? '1px solid #2A2A3A' : 'none',
              }}
            >
              {isFollowing ? 'Siguiendo' : 'Seguir'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Step 4 — Rate movies ──────────────────────────────────────────────────────

function RateMoviesStep({
  movies, actions, onAction, onLoadMore, onFinish,
}: {
  movies: OnboardingMovie[]
  actions: Map<number, MovieAction>
  onAction: (movieId: number, type: 'watched' | 'liked' | 'watchlist' | 'rating', value?: number) => void
  onLoadMore: () => void
  onFinish: () => void
}) {
  const [idx, setIdx] = useState(0)
  const [ratingOpen, setRatingOpen] = useState(false)
  const [finishing, setFinishing] = useState(false)

  const movie = movies[idx]
  const act = movie ? (actions.get(movie.id) ?? { watched: false, liked: false, rating: null, inWatchlist: false }) : null

  useEffect(() => {
    if (movies.length > 0 && idx >= movies.length - 3) onLoadMore()
  }, [idx, movies.length, onLoadMore])

  const next = useCallback(() => {
    setRatingOpen(false)
    setIdx(i => Math.min(i + 1, movies.length - 1))
  }, [movies.length])

  const handleFinish = async () => {
    setFinishing(true)
    await onFinish()
  }

  if (!movie || !act) return null

  const backdropUrl = movie.backdropPath
    ? `https://image.tmdb.org/t/p/w1280${movie.backdropPath}`
    : null

  return (
    <div
      className="relative flex flex-col items-center justify-end overflow-hidden"
      style={{ height: 'calc(100vh - 57px)', backgroundColor: '#0A0A0F' }}
    >
      {/* Backdrop */}
      {backdropUrl && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${backdropUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(10,10,15,0.2) 0%, rgba(10,10,15,0.4) 35%, rgba(10,10,15,0.85) 65%, rgba(10,10,15,1) 100%)',
        }}
      />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-4">
        <p className="text-xs text-white/60">Película {idx + 1}</p>
        <button
          onClick={handleFinish}
          disabled={finishing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white transition-all"
          style={{ backgroundColor: 'rgba(255,253,2,0.85)' }}
        >
          {finishing
            ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <X size={14} />
          }
          Terminar
        </button>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center pb-6 sm:pb-10 px-4 w-full max-w-sm mx-auto">

        {/* Poster */}
        <div className="relative w-36 sm:w-44 aspect-[2/3] rounded-xl overflow-hidden bg-[#1C1C27] shadow-2xl mb-4">
          {movie.posterPath ? (
            <Image
              src={`https://image.tmdb.org/t/p/w342${movie.posterPath}`}
              alt={movie.title}
              fill
              className="object-cover"
              sizes="176px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#A0A0B0] text-xs text-center px-2">
              {movie.title}
            </div>
          )}
        </div>

        {/* Title + year */}
        <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-1 leading-tight">
          {movie.title}
        </h2>
        <p className="text-sm text-white/60 mb-4">
          {movie.year}
          {movie.voteAverage > 0 && ` · ★ ${movie.voteAverage.toFixed(1)}`}
        </p>

        {/* Star selector (opens when ★ is clicked) */}
        {ratingOpen && (
          <div className="flex flex-col items-center gap-2 mb-4 p-4 rounded-2xl bg-[#13131A]/90 border border-[#2A2A3A]">
            <p className="text-xs text-[#A0A0B0]">¿Cuántas estrellas le das?</p>
            <InlineStarRater
              current={act.rating}
              onRate={v => {
                onAction(movie.id, 'rating', v)
                setRatingOpen(false)
              }}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 mb-5 flex-wrap justify-center">
          {[
            {
              type: 'watched' as const,
              icon: <Eye size={20} />,
              label: 'Ya la vi',
              active: act.watched,
              activeColor: '#22c55e',
            },
            {
              type: 'liked' as const,
              icon: <Heart size={20} fill={act.liked ? 'currentColor' : 'none'} />,
              label: 'Me gusta',
              active: act.liked,
              activeColor: '#ef4444',
            },
            {
              type: 'rating' as const,
              icon: act.rating
                ? <span className="text-base font-bold">{act.rating}★</span>
                : <span className="text-lg">★</span>,
              label: 'Calificar',
              active: act.rating !== null,
              activeColor: '#F5A623',
            },
            {
              type: 'watchlist' as const,
              icon: <Bookmark size={20} fill={act.inWatchlist ? 'currentColor' : 'none'} />,
              label: 'Ver después',
              active: act.inWatchlist,
              activeColor: '#3b82f6',
            },
          ].map(btn => (
            <button
              key={btn.type}
              onClick={() => {
                if (btn.type === 'rating') {
                  setRatingOpen(r => !r)
                } else {
                  onAction(movie.id, btn.type)
                }
              }}
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

        {/* Next movie */}
        <button
          onClick={next}
          disabled={idx >= movies.length - 1}
          className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors text-sm disabled:opacity-30"
        >
          <ChevronDown size={20} />
          Siguiente película
        </button>
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

  // Step 1
  const [selectedGenres, setSelectedGenres] = useState<string[]>([])

  // Step 2
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])

  // Step 3
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([])
  const [followed, setFollowed] = useState<Set<string>>(new Set())

  // Step 4
  const [movies,       setMovies]       = useState<OnboardingMovie[]>([])
  const [moviePage,    setMoviePage]    = useState(1)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [movieActions, setMovieActions] = useState<Map<number, MovieAction>>(new Map())

  // ── Auth guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      // getSession() reads from localStorage/cookies immediately — no network race
      const { data: { session } } = await supabase.auth.getSession()
      const u = session?.user ?? null

      if (!u) { router.replace('/auth'); return }

      // Only redirect to home if onboarding is explicitly TRUE
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', u.id)
        .maybeSingle()

      console.log('[onboarding] onboarding_completed:', profile?.onboarding_completed)

      if (profile?.onboarding_completed === true) { router.replace('/'); return }

      setUser(u)
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load suggested users (step 3) ────────────────────────────────────────
  useEffect(() => {
    if (step !== 3 || suggestedUsers.length > 0) return
    async function loadUsers() {
      const [topRes, ferlageokRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, points, level')
          .order('points', { ascending: false, nullsFirst: false })
          .limit(10),
        supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, points, level')
          .ilike('username', 'ferlageok')
          .maybeSingle(),
      ])

      const topUsers: SuggestedUser[] = (topRes.data ?? []).filter(u => u.id !== user?.id)
      const ferlageok = ferlageokRes.data

      if (ferlageok && ferlageok.id !== user?.id && !topUsers.find(u => u.id === ferlageok.id)) {
        topUsers.push(ferlageok)
      }

      setSuggestedUsers(topUsers.slice(0, 6))
    }
    loadUsers()
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load movies for step 4 ────────────────────────────────────────────────
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
          unique.push({
            id: m.id,
            title: m.title,
            year: (m.release_date ?? '').slice(0, 4),
            posterPath: m.poster_path,
            backdropPath: m.backdrop_path,
            voteAverage: m.vote_average,
            genreIds: m.genre_ids ?? [],
          })
        }
      }
      setMovies(prev => {
        const existingIds = new Set(prev.map(m => m.id))
        return [...prev, ...unique.filter(m => !existingIds.has(m.id))]
      })
      setMoviePage(page)
    } catch { /* ignore */ }
    setLoadingMore(false)
  }, [loadingMore]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step === 4 && movies.length === 0) loadMovies(1)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleGenre = (g: string) =>
    setSelectedGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  const togglePlatform = (id: string) =>
    setSelectedPlatforms(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleFollow = async (targetId: string) => {
    if (!user) return
    const nowFollowing = followed.has(targetId)
    setFollowed(prev => {
      const next = new Set(prev)
      nowFollowing ? next.delete(targetId) : next.add(targetId)
      return next
    })
    if (!nowFollowing) {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId })
      supabase.from('notifications').insert({ user_id: targetId, actor_id: user.id, type: 'follow' })
    } else {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId)
    }
  }

  const handleMovieAction = async (
    movieId: number,
    type: 'watched' | 'liked' | 'watchlist' | 'rating',
    ratingValue?: number,
  ) => {
    if (!user) return
    const movie = movies.find(m => m.id === movieId)
    if (!movie) return

    const prev = movieActions.get(movieId) ?? { watched: false, liked: false, rating: null, inWatchlist: false }

    if (type === 'watched') {
      const newVal = !prev.watched
      setMovieActions(m => new Map(m).set(movieId, { ...prev, watched: newVal }))
      if (newVal) {
        await supabase.from('watched').upsert(
          { user_id: user.id, media_id: movieId, media_type: 'movie', title: movie.title, poster_path: movie.posterPath, watched_at: new Date().toISOString() },
          { onConflict: 'user_id,media_id,media_type' }
        )
      } else {
        await supabase.from('watched').delete().eq('user_id', user.id).eq('media_id', movieId).eq('media_type', 'movie')
      }
    }

    if (type === 'liked') {
      const newVal = !prev.liked
      setMovieActions(m => new Map(m).set(movieId, { ...prev, liked: newVal }))
      if (newVal) {
        await supabase.from('favorites').upsert(
          { user_id: user.id, media_id: movieId, media_type: 'movie', title: movie.title, poster_path: movie.posterPath, genre_ids: movie.genreIds },
          { onConflict: 'user_id,media_id,media_type' }
        )
      } else {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('media_id', movieId).eq('media_type', 'movie')
      }
    }

    if (type === 'rating' && ratingValue !== undefined) {
      setMovieActions(m => new Map(m).set(movieId, { ...prev, rating: ratingValue }))
      await supabase.from('ratings').upsert(
        { user_id: user.id, media_id: movieId, media_type: 'movie', title: movie.title, poster_path: movie.posterPath, rating: ratingValue, rated_at: new Date().toISOString() },
        { onConflict: 'user_id,media_id,media_type' }
      )
    }

    if (type === 'watchlist') {
      const newVal = !prev.inWatchlist
      setMovieActions(m => new Map(m).set(movieId, { ...prev, inWatchlist: newVal }))
      if (newVal) {
        await supabase.from('watchlist').upsert(
          { user_id: user.id, media_id: movieId, media_type: 'movie', title: movie.title, poster_path: movie.posterPath },
          { onConflict: 'user_id,media_id,media_type' }
        )
      } else {
        await supabase.from('watchlist').delete().eq('user_id', user.id).eq('media_id', movieId).eq('media_type', 'movie')
      }
    }
  }

  const handleNext = async () => {
    if (!user) return
    setSaving(true)

    if (step === 1) {
      await supabase.from('profiles').update({ favorite_genres: selectedGenres }).eq('id', user.id)
      setStep(2)
    } else if (step === 2) {
      await supabase.from('profiles').update({ favorite_platforms: selectedPlatforms }).eq('id', user.id)
      setStep(3)
    } else if (step === 3) {
      setStep(4)
    }
    setSaving(false)
  }

  const handleFinish = async () => {
    if (!user) return
    await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id)
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

  // Step 4 uses its own full-screen layout
  if (step === 4) {
    return (
      <RateMoviesStep
        movies={movies}
        actions={movieActions}
        onAction={handleMovieAction}
        onLoadMore={() => loadMovies(moviePage + 1)}
        onFinish={handleFinish}
      />
    )
  }

  // Steps 1–3 share the same shell
  const stepConfig = [
    null,
    { title: '¿Qué te gusta ver?',         sub: 'Elegí tus géneros favoritos — podés seleccionar varios',     canNext: selectedGenres.length > 0  },
    { title: '¿Qué plataformas tenés?',    sub: 'Te mostramos el contenido disponible para vos',              canNext: selectedPlatforms.length > 0 },
    { title: 'Seguí a otros usuarios',     sub: 'Conectate con la comunidad de Glynbox',                      canNext: true                       },
  ]
  const cfg = stepConfig[step]!

  return (
    <div className="min-h-screen flex flex-col items-center py-10 px-4" style={{ backgroundColor: '#0A0A0F' }}>

      {/* Logo */}
      <div className="mb-8 flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Glynbox"
          style={{ height: '32px', width: 'auto', objectFit: 'contain' }}
        />
      </div>

      {/* Progress */}
      <ProgressDots step={step} />

      {/* Header */}
      <div className="text-center mt-8 mb-8">
        <h1 className="font-bold text-white mb-3" style={{ fontSize: '32px' }}>
          Personalicemos tu experiencia
        </h1>
        <p className="text-[#A0A0B0] mb-1" style={{ fontSize: '18px' }}>{cfg.title}</p>
        <p className="text-sm text-[#A0A0B0] max-w-sm mx-auto mt-1">{cfg.sub}</p>
      </div>

      {/* Step content */}
      <div className="w-full max-w-xl">
        {step === 1 && <GenresStep selected={selectedGenres} onToggle={toggleGenre} />}
        {step === 2 && <PlatformsStep selected={selectedPlatforms} onToggle={togglePlatform} />}
        {step === 3 && (
          suggestedUsers.length === 0
            ? <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" /></div>
            : <SuggestedUsersStep users={suggestedUsers} followed={followed} onFollow={handleFollow} />
        )}
      </div>

      {/* Next button */}
      <button
        onClick={handleNext}
        disabled={!cfg.canNext || saving}
        className="mt-10 px-10 py-4 text-black font-semibold text-base transition-all disabled:opacity-40"
        style={{
          backgroundColor: '#FFFD02',
          borderRadius: '50px',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#E5EB00' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#FFFD02' }}
      >
        {saving
          ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
          : step === 3 ? 'Siguiente →' : 'Siguiente →'
        }
      </button>

      {/* Step indicator */}
      <p className="mt-4 text-xs text-[#A0A0B0]">Paso {step} de 4</p>
    </div>
  )
}
