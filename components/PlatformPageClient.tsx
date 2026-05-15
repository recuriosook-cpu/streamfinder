'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, Star } from 'lucide-react'
import { getPosterUrl } from '@/lib/tmdb'
import TopRankedCard from '@/components/TopRankedCard'
import MediaCard from '@/components/MediaCard'
import { useCountry } from '@/context/CountryContext'

// ── Types ──────────────────────────────────────────────────────────────────

type ContentType = 'movies' | 'series' | 'miniseries' | 'docs' | 'anime'

export interface PlatformInfo {
  id: number
  slug: string
  name: string
  color: string
}

export interface CatalogItem {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  vote_average: number
  release_date?: string
  first_air_date?: string
  _mediaType?: string
}

interface FilteredItem {
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
  { id: 'series',     label: 'Series'       },
  { id: 'miniseries', label: 'Miniseries'   },
  { id: 'docs',       label: 'Documentales' },
  { id: 'anime',      label: 'Anime'        },
]

const GENRES = [
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
]

// ── URL builder ────────────────────────────────────────────────────────────

function buildUrl(
  providerId: number,
  contentType: ContentType,
  genres: number[],
  country: string,
  page: number,
): string {
  const isTV = contentType === 'series' || contentType === 'miniseries' || contentType === 'anime'
  const endpoint = isTV ? 'tv' : 'movie'
  const url = new URL(`https://api.themoviedb.org/3/discover/${endpoint}`)
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY!

  url.searchParams.set('api_key', key)
  url.searchParams.set('language', 'es-AR')
  url.searchParams.set('include_adult', 'false')
  url.searchParams.set('sort_by', 'popularity.desc')
  url.searchParams.set('with_watch_providers', String(providerId))
  url.searchParams.set('watch_region', country)
  url.searchParams.set('page', String(page))

  if (contentType === 'series')     url.searchParams.set('with_type', '6')
  if (contentType === 'miniseries') url.searchParams.set('with_type', '2')

  if (contentType === 'anime') {
    url.searchParams.set('with_origin_country', 'JP')
    url.searchParams.set('with_genres', [...new Set([16, ...genres])].join(','))
  } else {
    const allGenres = contentType === 'docs' ? [...new Set([99, ...genres])] : genres
    if (allGenres.length > 0) url.searchParams.set('with_genres', allGenres.join(','))
  }

  return url.toString()
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  platform:   PlatformInfo
  logoPath:   string | null
  topMovies:  CatalogItem[]
  topTV:      CatalogItem[]
  catalog:    CatalogItem[]
}

export default function PlatformPageClient({
  platform,
  logoPath,
  topMovies,
  topTV,
  catalog,
}: Props) {
  const { country } = useCountry()

  // Filter state — null means "no filter active"
  const [activeType, setActiveType] = useState<ContentType | null>(null)
  const [genres,     setGenres]     = useState<number[]>([])

  const isFiltered = activeType !== null || genres.length > 0

  // Filtered results state
  const [filteredItems, setFilteredItems] = useState<FilteredItem[]>([])
  const [filtLoading,   setFiltLoading]   = useState(false)
  const [filtPage,      setFiltPage]      = useState(1)
  const [filtHasMore,   setFiltHasMore]   = useState(true)

  const sentinelRef  = useRef<HTMLDivElement>(null)
  const loadingRef   = useRef(false)
  const hasMoreRef   = useRef(true)

  useEffect(() => { loadingRef.current = filtLoading }, [filtLoading])
  useEffect(() => { hasMoreRef.current = filtHasMore }, [filtHasMore])

  // Fetch filtered results whenever filters or page change
  useEffect(() => {
    if (!isFiltered) return

    const type = activeType ?? 'movies'
    const ac   = new AbortController()
    setFiltLoading(true)
    if (filtPage === 1) setFilteredItems([])

    const isTV: boolean = type === 'series' || type === 'miniseries' || type === 'anime'
    const mediaType: 'movie' | 'tv' = isTV ? 'tv' : 'movie'

    fetch(buildUrl(platform.id, type, genres, country, filtPage), { signal: ac.signal })
      .then(r => r.json())
      .then(data => {
        const mapped: FilteredItem[] = (data.results ?? [])
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
        setFilteredItems(prev => filtPage === 1 ? mapped : [...prev, ...mapped])
        setFiltHasMore(filtPage < (data.total_pages ?? 1))
        setFiltLoading(false)
      })
      .catch(() => setFiltLoading(false))

    return () => ac.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, genres, filtPage, country, isFiltered])

  // Infinite scroll for filtered results
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingRef.current && hasMoreRef.current) {
        setFiltPage(p => p + 1)
      }
    }, { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [isFiltered])

  function toggleType(id: ContentType) {
    setActiveType(prev => prev === id ? null : id)
    setGenres([])
    setFiltPage(1)
  }

  function toggleGenre(id: number) {
    setGenres(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    )
    setFiltPage(1)
  }

  function clearFilters() {
    setActiveType(null)
    setGenres([])
    setFiltPage(1)
  }

  return (
    <div className="min-h-screen">
      {/* Platform header */}
      <div className="bg-[#13131A] border-b border-[#2A2A3A]">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[#A0A0B0] hover:text-white text-sm mb-5 transition-colors"
          >
            <ArrowLeft size={15} /> Inicio
          </Link>
          <div className="flex items-center gap-4">
            {logoPath ? (
              <Image
                src={`https://image.tmdb.org/t/p/original${logoPath}`}
                alt={platform.name}
                width={64}
                height={64}
                className="rounded-xl shadow-lg"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-bold text-xs text-center px-2 leading-tight shadow-lg"
                style={{ backgroundColor: platform.color }}
              >
                {platform.name}
              </div>
            )}
            <div>
              <h1 className="text-3xl font-bold text-white">{platform.name}</h1>
              <p className="text-[#A0A0B0] text-sm mt-0.5">Disponible en Argentina</p>
            </div>
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="border-t border-[#2A2A3A] bg-[#13131A]/80">
          <div className="max-w-7xl mx-auto px-4 py-3 space-y-2.5">

            {/* Content type chips */}
            <div className="flex flex-wrap gap-2">
              {CONTENT_TYPES.map(ct => (
                <button
                  key={ct.id}
                  onClick={() => toggleType(ct.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeType === ct.id
                      ? 'bg-[#FFFD02] text-black'
                      : 'bg-[#1C1C27] text-zinc-300 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  {ct.label}
                </button>
              ))}
              {isFiltered && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-1.5 text-xs text-[#A0A0B0] hover:text-zinc-300 transition-colors underline"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Genre chips */}
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map(g => (
                <button
                  key={g.id}
                  onClick={() => toggleGenre(g.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    genres.includes(g.id)
                      ? 'bg-[#FFFD02] text-black'
                      : 'bg-[#1C1C27] text-[#A0A0B0] hover:bg-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>

          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-10 space-y-14">

        {isFiltered ? (
          /* ── Filtered results ── */
          <section>
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
              <span
                className="w-1 h-6 rounded-full inline-block"
                style={{ backgroundColor: platform.color }}
              />
              Resultados filtrados
            </h2>

            {filteredItems.length === 0 && !filtLoading && (
              <p className="text-[#A0A0B0] text-sm py-10 text-center">
                Sin resultados para los filtros seleccionados.
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredItems.map(item => (
                <Link
                  key={`${item.mediaType}-${item.id}`}
                  href={`/${item.mediaType}/${item.id}`}
                  className="group"
                >
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-1.5">
                    <Image
                      src={getPosterUrl(item.poster_path, 'w342')}
                      alt={item.displayTitle}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 17vw"
                    />
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

            {filtLoading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[2/3] rounded-lg bg-[#1C1C27]" />
                    <div className="h-3 bg-[#1C1C27] rounded mt-2 w-3/4" />
                    <div className="h-2.5 bg-[#1C1C27] rounded mt-1 w-1/3" />
                  </div>
                ))}
              </div>
            )}

            <div ref={sentinelRef} className="h-4 mt-4" />
            {!filtHasMore && filteredItems.length > 0 && (
              <p className="text-zinc-700 text-xs text-center mt-6">— Fin de los resultados —</p>
            )}
          </section>

        ) : (
          /* ── Default layout: Top 10s + Catalog ── */
          <>
            {topMovies.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                  <span className="w-1 h-6 rounded-full inline-block" style={{ backgroundColor: platform.color }} />
                  Top 10 Películas
                </h2>
                <div className="flex gap-1 overflow-x-auto no-scrollbar pb-3">
                  {topMovies.map((movie, i) => (
                    <TopRankedCard
                      key={movie.id}
                      id={movie.id}
                      title={movie.title ?? movie.name ?? ''}
                      posterPath={movie.poster_path}
                      mediaType="movie"
                      rank={i + 1}
                    />
                  ))}
                </div>
              </section>
            )}

            {topTV.length > 0 && (
              <section>
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                  <span className="w-1 h-6 rounded-full inline-block" style={{ backgroundColor: platform.color }} />
                  Top 10 Series
                </h2>
                <div className="flex gap-1 overflow-x-auto no-scrollbar pb-3">
                  {topTV.map((show, i) => (
                    <TopRankedCard
                      key={show.id}
                      id={show.id}
                      title={show.name ?? show.title ?? ''}
                      posterPath={show.poster_path}
                      mediaType="tv"
                      rank={i + 1}
                    />
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
                <span className="w-1 h-6 rounded-full inline-block" style={{ backgroundColor: platform.color }} />
                Catálogo completo
                <span className="text-[#A0A0B0] text-sm font-normal">· ordenado por fecha de estreno</span>
              </h2>
              {catalog.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {catalog.map((item: CatalogItem) => (
                    <MediaCard
                      key={`${item._mediaType}-${item.id}`}
                      id={item.id}
                      title={item.title ?? item.name ?? ''}
                      posterPath={item.poster_path}
                      rating={item.vote_average}
                      year={(item.release_date ?? item.first_air_date ?? '').slice(0, 4)}
                      mediaType={item._mediaType === 'tv' ? 'tv' : 'movie'}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-[#A0A0B0] text-sm">
                  No se encontró contenido disponible en Argentina para esta plataforma.
                </p>
              )}
            </section>
          </>
        )}

      </div>
    </div>
  )
}
