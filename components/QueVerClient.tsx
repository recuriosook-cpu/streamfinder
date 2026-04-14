'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Star } from 'lucide-react'
import { getPosterUrl } from '@/lib/tmdb'

// ── Types ──────────────────────────────────────────────────────────────────

type ContentType = 'movies' | 'docs' | 'series' | 'miniseries'

interface Params {
  contentType: ContentType
  genres: number[]
  sortBy: string
  yearFrom: string
  yearTo: string
  minScore: number
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
  { id: 'movies',     label: 'Películas'   },
  { id: 'docs',       label: 'Documentales'},
  { id: 'series',     label: 'Series'      },
  { id: 'miniseries', label: 'Miniseries'  },
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
  { id: 10759, name: 'Acción y aventura'      },
  { id: 16,    name: 'Animación'              },
  { id: 35,    name: 'Comedia'               },
  { id: 80,    name: 'Crimen'               },
  { id: 18,    name: 'Drama'                },
  { id: 10751, name: 'Familia'              },
  { id: 10762, name: 'Infantil'             },
  { id: 9648,  name: 'Misterio'             },
  { id: 10764, name: 'Reality'              },
  { id: 10765, name: 'Sci-Fi y fantasía'    },
  { id: 53,    name: 'Thriller'             },
  { id: 10768, name: 'Guerra y política'    },
  { id: 37,    name: 'Western'              },
]

const SORT_OPTIONS = [
  { value: 'popularity.desc',          label: 'Más populares'   },
  { value: 'vote_average.desc',        label: 'Mejor puntuados' },
  { value: 'primary_release_date.desc',label: 'Más recientes'   },
]

// ── URL builder ────────────────────────────────────────────────────────────

function buildDiscoverUrl(p: Params): string {
  const isTV = p.contentType === 'series' || p.contentType === 'miniseries'
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
  if (sort === 'vote_average.desc') {
    url.searchParams.set('vote_count.gte', '50')
  }

  // Min score
  if (p.minScore > 0) {
    url.searchParams.set('vote_average.gte', String(p.minScore))
    if (sort !== 'vote_average.desc') url.searchParams.set('vote_count.gte', '10')
  }

  // Year range
  const dateKey = isTV ? 'first_air_date' : 'primary_release_date'
  if (p.yearFrom) url.searchParams.set(`${dateKey}.gte`, `${p.yearFrom}-01-01`)
  if (p.yearTo)   url.searchParams.set(`${dateKey}.lte`, `${p.yearTo}-12-31`)

  // Genres — documentaries always include genre 99
  const genres = p.contentType === 'docs'
    ? [...new Set([99, ...p.genres])]
    : p.genres
  if (genres.length > 0) url.searchParams.set('with_genres', genres.join(','))

  // TV series type
  if (p.contentType === 'series')     url.searchParams.set('with_type', '6')
  if (p.contentType === 'miniseries') url.searchParams.set('with_type', '2')

  return url.toString()
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  initialGenre?: number
  initialType?: ContentType
}

export default function QueVerClient({ initialGenre, initialType }: Props) {
  const [params, setParams] = useState<Params>({
    contentType: initialType ?? 'movies',
    genres: initialGenre ? [initialGenre] : [],
    sortBy: 'popularity.desc',
    yearFrom: '',
    yearTo: '',
    minScore: 0,
    page: 1,
  })
  const [items, setItems] = useState<ResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef  = useRef(false)
  const hasMoreRef  = useRef(true)

  useEffect(() => { loadingRef.current = loading },  [loading])
  useEffect(() => { hasMoreRef.current = hasMore },  [hasMore])

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

  const genreList = (params.contentType === 'series' || params.contentType === 'miniseries')
    ? TV_GENRES
    : MOVIE_GENRES

  return (
    <div className="min-h-screen">
      {/* ── Sticky filter bar ── */}
      <div className="bg-zinc-900/95 backdrop-blur border-b border-zinc-800 sticky top-[57px] z-40">
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-3 space-y-3">

          {/* Content type */}
          <div className="flex flex-wrap gap-2">
            {CONTENT_TYPES.map(ct => (
              <button
                key={ct.id}
                onClick={() => updateFilter({ contentType: ct.id, genres: [] })}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  params.contentType === ct.id
                    ? 'bg-emerald-500 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {ct.label}
              </button>
            ))}
          </div>

          {/* Genre chips */}
          <div className="flex flex-wrap gap-1.5">
            {genreList.map(g => (
              <button
                key={g.id}
                onClick={() => toggleGenre(g.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  params.genres.includes(g.id)
                    ? 'bg-emerald-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>

          {/* Sort + year + score row */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Sort */}
            <select
              value={params.sortBy}
              onChange={e => updateFilter({ sortBy: e.target.value })}
              className="bg-zinc-800 text-zinc-300 text-sm rounded-lg px-3 py-1.5 border border-zinc-700 outline-none focus:border-emerald-500 cursor-pointer"
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            {/* Year range */}
            <div className="flex items-center gap-1.5 text-sm text-zinc-400">
              <span className="text-xs">Año</span>
              <input
                type="number"
                placeholder="Desde"
                value={params.yearFrom}
                onChange={e => updateFilter({ yearFrom: e.target.value })}
                className="w-[72px] bg-zinc-800 text-zinc-300 text-sm rounded-lg px-2 py-1.5 border border-zinc-700 outline-none focus:border-emerald-500"
                min="1900" max="2030"
              />
              <span>–</span>
              <input
                type="number"
                placeholder="Hasta"
                value={params.yearTo}
                onChange={e => updateFilter({ yearTo: e.target.value })}
                className="w-[72px] bg-zinc-800 text-zinc-300 text-sm rounded-lg px-2 py-1.5 border border-zinc-700 outline-none focus:border-emerald-500"
                min="1900" max="2030"
              />
            </div>

            {/* Min score */}
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Star size={13} className="text-yellow-400 shrink-0" fill="currentColor" />
              <span className="text-xs w-16">
                {params.minScore > 0 ? `≥ ${params.minScore.toFixed(1)}` : 'Cualquier nota'}
              </span>
              <input
                type="range" min="0" max="9" step="0.5"
                value={params.minScore}
                onChange={e => updateFilter({ minScore: Number(e.target.value) })}
                className="w-24 accent-emerald-500"
              />
            </div>

            {/* Reset */}
            {(params.genres.length > 0 || params.yearFrom || params.yearTo || params.minScore > 0) && (
              <button
                onClick={() => updateFilter({ genres: [], yearFrom: '', yearTo: '', minScore: 0 })}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline"
              >
                Limpiar filtros
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

        {items.length === 0 && !loading && (
          <p className="text-zinc-500 text-center py-24">Sin resultados para los filtros seleccionados.</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
          {items.map(item => (
            <Link
              key={`${item.mediaType}-${item.id}`}
              href={`/${item.mediaType}/${item.id}`}
              className="group"
            >
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-1.5">
                <Image
                  src={getPosterUrl(item.poster_path, 'w342')}
                  alt={item.displayTitle}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 17vw"
                />
                {item.vote_average > 0 && (
                  <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 bg-zinc-900/90 rounded px-1.5 py-0.5">
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
                <p className="text-[11px] text-zinc-500 mt-0.5">{item.year}</p>
              )}
            </Link>
          ))}
        </div>

        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 mt-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[2/3] rounded-lg bg-zinc-800" />
                <div className="h-3 bg-zinc-800 rounded mt-2 w-3/4" />
                <div className="h-2.5 bg-zinc-800 rounded mt-1 w-1/3" />
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
