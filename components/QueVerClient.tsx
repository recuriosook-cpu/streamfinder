'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Star, EyeOff, Compass } from 'lucide-react'
import MoodRecommender from '@/components/MoodRecommender'
import { getPosterUrl } from '@/lib/tmdb'
import { ALL_PLATFORMS } from '@/lib/providers'
import { useCountry } from '@/context/CountryContext'
import { createClient } from '@/lib/supabase'
import CountrySelector from '@/components/CountrySelector'

// ── Types ──────────────────────────────────────────────────────────────────

type ContentType = 'movies' | 'docs' | 'series' | 'miniseries' | 'anime'

interface Params {
  contentType: ContentType
  genres: number[]
  sortBy: string
  yearFrom: string
  yearTo: string
  minScore: number
  provider: number | null
  watchRegion: string
  page: number
}

interface ResultItem {
  id: number
  displayTitle: string
  poster_path: string | null
  vote_average: number
  year: string
  mediaType: 'movie' | 'tv'
}

// ── Static data ────────────────────────────────────────────────────────────

const CONTENT_TYPES: { id: ContentType; label: string }[] = [
  { id: 'movies',     label: 'Películas'    },
  { id: 'docs',       label: 'Documentales' },
  { id: 'series',     label: 'Series'       },
  { id: 'miniseries', label: 'Miniseries'   },
  { id: 'anime',      label: 'Anime'        },
]

const MOVIE_GENRES = [
  { id: 28,    name: 'Acción'          },
  { id: 12,    name: 'Aventura'        },
  { id: 16,    name: 'Animación'       },
  { id: 35,    name: 'Comedia'         },
  { id: 80,    name: 'Crimen'          },
  { id: 18,    name: 'Drama'           },
  { id: 10751, name: 'Familia'         },
  { id: 14,    name: 'Fantasía'        },
  { id: 36,    name: 'Historia'        },
  { id: 27,    name: 'Terror'          },
  { id: 10402, name: 'Música'          },
  { id: 9648,  name: 'Misterio'        },
  { id: 10749, name: 'Romance'         },
  { id: 878,   name: 'Ciencia ficción' },
  { id: 53,    name: 'Thriller'        },
  { id: 10752, name: 'Guerra'          },
  { id: 37,    name: 'Western'         },
]

const TV_GENRES = [
  { id: 10759, name: 'Acción y aventura'   },
  { id: 16,    name: 'Animación'           },
  { id: 35,    name: 'Comedia'             },
  { id: 80,    name: 'Crimen'             },
  { id: 18,    name: 'Drama'              },
  { id: 10751, name: 'Familia'            },
  { id: 10762, name: 'Infantil'           },
  { id: 9648,  name: 'Misterio'           },
  { id: 10764, name: 'Reality'            },
  { id: 10765, name: 'Sci-Fi y fantasía'  },
  { id: 53,    name: 'Thriller'           },
  { id: 10768, name: 'Guerra y política'  },
  { id: 37,    name: 'Western'            },
]

const SORT_OPTIONS = [
  { value: 'popularity.desc',           label: 'Más populares'   },
  { value: 'vote_average.desc',         label: 'Mejor puntuados' },
  { value: 'primary_release_date.desc', label: 'Más recientes'   },
]

// ── URL builder ────────────────────────────────────────────────────────────

function buildDiscoverUrl(p: Params): string {
  const isTV = p.contentType === 'series' || p.contentType === 'miniseries' || p.contentType === 'anime'
  const endpoint = isTV ? 'tv' : 'movie'
  const url = new URL(`https://api.themoviedb.org/3/discover/${endpoint}`)
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY!
  url.searchParams.set('api_key', key)
  url.searchParams.set('language', 'es-AR')
  url.searchParams.set('include_adult', 'false')
  url.searchParams.set('page', String(p.page))

  // Sort — TV uses first_air_date instead of primary_release_date
  const sort = isTV
    ? p.sortBy.replace('primary_release_date', 'first_air_date')
    : p.sortBy
  url.searchParams.set('sort_by', sort)

  // Minimum votes when sorting by rating (avoids 10/10 with 3 votes)
  if (sort === 'vote_average.desc') url.searchParams.set('vote_count.gte', '50')

  // Min score
  if (p.minScore > 0) {
    url.searchParams.set('vote_average.gte', String(p.minScore))
    if (sort !== 'vote_average.desc') url.searchParams.set('vote_count.gte', '10')
  }

  // Year range
  const dateKey = isTV ? 'first_air_date' : 'primary_release_date'
  if (p.yearFrom) url.searchParams.set(`${dateKey}.gte`, `${p.yearFrom}-01-01`)
  if (p.yearTo)   url.searchParams.set(`${dateKey}.lte`, `${p.yearTo}-12-31`)

  // Genres + origin country — anime always forces genre 16 (Animation) + JP origin
  if (p.contentType === 'anime') {
    url.searchParams.set('with_origin_country', 'JP')
    url.searchParams.set('with_genres', [...new Set([16, ...p.genres])].join(','))
  } else {
    const genres = p.contentType === 'docs'
      ? [...new Set([99, ...p.genres])]
      : p.genres
    if (genres.length > 0) url.searchParams.set('with_genres', genres.join(','))
  }

  // TV series type
  if (p.contentType === 'series')     url.searchParams.set('with_type', '6')
  if (p.contentType === 'miniseries') url.searchParams.set('with_type', '2')

  // Streaming platform filter
  if (p.provider !== null) {
    url.searchParams.set('with_watch_providers', String(p.provider))
    url.searchParams.set('watch_region', p.watchRegion)
  }

  return url.toString()
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  initialGenre?: number
  initialType?: ContentType
}

export default function QueVerClient({ initialGenre, initialType }: Props) {
  const { country } = useCountry()

  const [params, setParams] = useState<Params>({
    contentType: initialType ?? 'movies',
    genres:      initialGenre ? [initialGenre] : [],
    sortBy:      'popularity.desc',
    yearFrom:    '',
    yearTo:      '',
    minScore:    0,
    provider:    null,
    watchRegion: country,
    page:        1,
  })

  const [items,   setItems]   = useState<ResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [total,   setTotal]   = useState(0)
  const [logoErrors,   setLogoErrors]   = useState<Set<number>>(new Set())
  const [posterErrors, setPosterErrors] = useState<Set<string>>(new Set())

  // ── "Ocultar lo que ya vi" ─────────────────────────────────────
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [hideWatched,   setHideWatched]   = useState(false)
  const [watchedSet,    setWatchedSet]    = useState<Set<string>>(new Set())
  const watchedLoadedRef = useRef(false)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef  = useRef(false)
  const hasMoreRef  = useRef(true)

  useEffect(() => { loadingRef.current = loading }, [loading])
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])

  // Load auth + persist preference
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null)
    })
    try {
      if (localStorage.getItem('glynbox_hide_watched') === 'true') setHideWatched(true)
    } catch { /* ignore */ }
  }, [])

  // Fetch watched IDs whenever toggle activates and user is known
  useEffect(() => {
    if (!hideWatched || !currentUserId || watchedLoadedRef.current) return
    watchedLoadedRef.current = true
    createClient()
      .from('watched')
      .select('media_id, media_type')
      .eq('user_id', currentUserId)
      .then(({ data }) => {
        setWatchedSet(new Set(
          (data ?? []).map((w: { media_id: number; media_type: string }) => `${w.media_type}:${w.media_id}`)
        ))
      })
  }, [currentUserId, hideWatched])

  // Keep watchRegion in sync with selected country
  useEffect(() => {
    setParams(p => p.watchRegion === country ? p : { ...p, watchRegion: country, page: 1 })
  }, [country])

  // Fetch whenever params change
  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    if (params.page === 1) setItems([])

    const isTV = params.contentType === 'series' || params.contentType === 'miniseries'
    const mediaType: 'movie' | 'tv' = isTV ? 'tv' : 'movie'

    fetch(buildDiscoverUrl(params), { signal: ac.signal })
      .then(r => r.json())
      .then(data => {
        const mapped: ResultItem[] = (data.results ?? [])
          .filter((item: { poster_path: string | null }) => item.poster_path)
          .map((item: {
            id: number; title?: string; name?: string
            poster_path: string | null; vote_average: number
            release_date?: string; first_air_date?: string
          }) => ({
            id:           item.id,
            displayTitle: item.title ?? item.name ?? '',
            poster_path:  item.poster_path,
            vote_average: item.vote_average,
            year:         (item.release_date ?? item.first_air_date ?? '').slice(0, 4),
            mediaType,
          }))
        setItems(prev => params.page === 1 ? mapped : [...prev, ...mapped])
        setHasMore(params.page < (data.total_pages ?? 1))
        setTotal(data.total_results ?? 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    return () => ac.abort()
  }, [params])

  // Infinite scroll — set up once, read refs so no re-subscription needed
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingRef.current && hasMoreRef.current) {
        setParams(p => ({ ...p, page: p.page + 1 }))
      }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const updateFilter = (update: Partial<Omit<Params, 'page'>>) =>
    setParams(p => ({ ...p, ...update, page: 1 }))

  const toggleGenre = (id: number) =>
    updateFilter({
      genres: params.genres.includes(id)
        ? params.genres.filter(g => g !== id)
        : [...params.genres, id],
    })

  const toggleProvider = (id: number) =>
    updateFilter({ provider: params.provider === id ? null : id })

  const genreList = (params.contentType === 'series' || params.contentType === 'miniseries' || params.contentType === 'anime')
    ? TV_GENRES
    : MOVIE_GENRES

  const hasActiveFilters =
    params.genres.length > 0 || params.yearFrom || params.yearTo ||
    params.minScore > 0 || params.provider !== null

  function toggleHideWatched() {
    const next = !hideWatched
    setHideWatched(next)
    try { localStorage.setItem('glynbox_hide_watched', String(next)) } catch { /* ignore */ }
  }

  const displayItems = hideWatched
    ? items.filter(item => !watchedSet.has(`${item.mediaType}:${item.id}`))
    : items

  return (
    <div className="min-h-screen">
      {/* ── Recomendador por estado de ánimo ── */}
      <section>
        <div className="max-w-7xl mx-auto px-4 pt-8 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <Compass size={20} className="text-[#FFFD02]" />
            <h1 className="text-lg sm:text-xl font-bold text-white">¿No sabés qué ver?</h1>
          </div>
          <p className="text-sm text-[#A0A0B0]">Probá el recomendador por estado de ánimo</p>
        </div>
        <MoodRecommender />
      </section>

      {/* Separador visual */}
      <div className="border-b border-[#2A2A3A]" />

      {/* ── Sticky filter bar ── */}
      <div className="bg-[#13131A]/95 backdrop-blur border-b border-[#2A2A3A] sticky top-[57px] z-40">
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-3 space-y-3">

          {/* Content type */}
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map(ct => (
              <button
                key={ct.id}
                onClick={() => updateFilter({ contentType: ct.id, genres: [] })}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  params.contentType === ct.id
                    ? 'bg-[#FFFD02] text-black'
                    : 'bg-[#1C1C27] text-zinc-300 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {ct.label}
              </button>
            ))}
          </div>

          {/* Platform strip + country selector */}
          <div className="flex items-center gap-2">
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-0.5 flex-1">
            {ALL_PLATFORMS.map(p => {
              const selected  = params.provider === p.id
              const showLogo  = !!p.fallbackLogoPath && !logoErrors.has(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => toggleProvider(p.id)}
                  title={p.name}
                  className={`shrink-0 w-11 h-11 rounded-xl overflow-hidden transition-all duration-150 ${
                    selected
                      ? 'ring-2 ring-[#FFFD02] ring-offset-2 ring-offset-[#13131A] scale-105'
                      : 'opacity-70 hover:opacity-100 hover:scale-105'
                  }`}
                >
                  {showLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://image.tmdb.org/t/p/w154${p.fallbackLogoPath}`}
                      alt={p.name}
                      className="w-full h-full object-cover"
                      onError={() => setLogoErrors(prev => new Set(prev).add(p.id))}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-white font-bold text-[9px] text-center px-0.5 leading-tight"
                      style={{ backgroundColor: p.color }}
                    >
                      {p.name}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          <CountrySelector variant="compact" align="right" />
          </div>

          {/* Genre chips — horizontal scroll on mobile */}
          <div className="chip-scroll gap-1.5 pb-1">
            {genreList.map(g => (
              <button
                key={g.id}
                onClick={() => toggleGenre(g.id)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  params.genres.includes(g.id)
                    ? 'bg-[#FFFD02] text-black'
                    : 'bg-[#1C1C27] text-[#A0A0B0] hover:bg-zinc-700 hover:text-zinc-200'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>

          {/* Sort + year + score row */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Sort */}
            <select
              value={params.sortBy}
              onChange={e => updateFilter({ sortBy: e.target.value })}
              className="bg-[#1C1C27] text-zinc-300 text-sm rounded-lg px-3 py-1.5 border border-[#2A2A3A] outline-none focus:border-[#FFFD02] cursor-pointer"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* Year range — stacks to column on mobile */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5 text-sm text-[#A0A0B0]">
              <span className="text-xs text-[#A0A0B0]">Año</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  placeholder="Desde"
                  value={params.yearFrom}
                  onChange={e => updateFilter({ yearFrom: e.target.value })}
                  className="w-[68px] bg-[#1C1C27] text-zinc-300 text-sm rounded-lg px-2 py-1.5 border border-[#2A2A3A] outline-none focus:border-[#FFFD02]"
                  min="1900" max="2030"
                />
                <span className="text-[#A0A0B0]">–</span>
                <input
                  type="number"
                  placeholder="Hasta"
                  value={params.yearTo}
                  onChange={e => updateFilter({ yearTo: e.target.value })}
                  className="w-[68px] bg-[#1C1C27] text-zinc-300 text-sm rounded-lg px-2 py-1.5 border border-[#2A2A3A] outline-none focus:border-[#FFFD02]"
                  min="1900" max="2030"
                />
              </div>
            </div>

            {/* Min score */}
            <div className="flex items-center gap-2 text-sm text-[#A0A0B0]">
              <Star size={13} className="text-yellow-400 shrink-0" fill="currentColor" />
              <span className="text-xs w-16">
                {params.minScore > 0 ? `≥ ${params.minScore.toFixed(1)}` : 'Cualquier nota'}
              </span>
              <input
                type="range" min="0" max="9" step="0.5"
                value={params.minScore}
                onChange={e => updateFilter({ minScore: Number(e.target.value) })}
                className="w-20 sm:w-24 accent-[#FFFD02]"
              />
            </div>

            {/* Reset */}
            {hasActiveFilters && (
              <button
                onClick={() => updateFilter({
                  genres: [], yearFrom: '', yearTo: '', minScore: 0, provider: null,
                })}
                className="text-xs text-[#A0A0B0] hover:text-zinc-300 transition-colors underline"
              >
                Limpiar
              </button>
            )}

            {/* Hide watched toggle — only for logged-in users */}
            {currentUserId && (
              <button
                onClick={toggleHideWatched}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  hideWatched
                    ? 'border-[#FFFD02] bg-[#FFFD02]/10 text-[#FFFD02]'
                    : 'border-[#2A2A3A] text-[#A0A0B0] hover:border-zinc-500 hover:text-zinc-300'
                }`}
              >
                <EyeOff size={12} />
                Ocultar lo que ya vi
              </button>
            )}

            {/* Total */}
            {total > 0 && (
              <span className="text-xs text-zinc-600 ml-auto hidden sm:block">
                {total.toLocaleString('es-AR')} resultados
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Results grid ── */}
      <div className="max-w-7xl mx-auto px-4 py-8">

        {displayItems.length === 0 && !loading && (
          <p className="text-[#A0A0B0] text-center py-24">Sin resultados para los filtros seleccionados.</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
          {displayItems.map(item => (
            <Link
              key={`${item.mediaType}-${item.id}`}
              href={`/${item.mediaType}/${item.id}`}
              className="group"
            >
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-1.5">
                {posterErrors.has(`${item.mediaType}-${item.id}`) ? (
                  <div className="w-full h-full flex items-center justify-center bg-[#1C1C27] p-2 text-center">
                    <span className="text-[11px] text-[#A0A0B0] leading-tight line-clamp-4">
                      {item.displayTitle}
                    </span>
                  </div>
                ) : (
                  <Image
                    src={getPosterUrl(item.poster_path, 'w342')}
                    alt={item.displayTitle}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 17vw"
                    onError={() => setPosterErrors(prev => new Set(prev).add(`${item.mediaType}-${item.id}`))}
                  />
                )}
                {item.vote_average > 0 && (
                  <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 bg-[#13131A]/90 rounded px-1.5 py-0.5">
                    <Star size={9} className="text-yellow-400 shrink-0" fill="currentColor" />
                    <span className="text-[11px] font-semibold text-white leading-none">
                      {item.vote_average.toFixed(1)}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs font-medium text-white leading-tight line-clamp-2 group-hover:text-zinc-300 transition-colors">
                {item.displayTitle}
              </p>
              {item.year && (
                <p className="text-[11px] text-[#A0A0B0] mt-0.5">{item.year}</p>
              )}
            </Link>
          ))}
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 mt-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[2/3] rounded-lg bg-[#1C1C27]" />
                <div className="h-3 bg-[#1C1C27] rounded mt-2 w-3/4" />
                <div className="h-2.5 bg-[#1C1C27] rounded mt-1 w-1/3" />
              </div>
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4 mt-4" />

        {!hasMore && items.length > 0 && (
          <p className="text-zinc-700 text-xs text-center mt-6">
            — Fin de los resultados —
          </p>
        )}
      </div>
    </div>
  )
}
