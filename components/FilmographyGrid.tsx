'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Star, ChevronDown } from 'lucide-react'
import { getPosterUrl } from '@/lib/tmdb'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FilmographyCredit {
  id: number
  title?: string
  name?: string
  character?: string
  poster_path: string | null
  media_type: 'movie' | 'tv'
  release_date?: string
  first_air_date?: string
  popularity?: number
  vote_average?: number
  vote_count?: number
  genre_ids?: number[]
}

interface Props {
  credits: FilmographyCredit[]
  title?: string
}

type MediaFilter = 'all' | 'movie' | 'tv'
type SortOption  = 'date_desc' | 'date_asc' | 'rating_desc' | 'popularity_desc' | 'alpha_asc'
type DecadeKey   = 'all' | '2020s' | '2010s' | '2000s' | '1990s' | '1980s' | '1970s' | '1960s' | 'older'

// ── Constants ─────────────────────────────────────────────────────────────────

const GENRE_MAP: Record<number, string> = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia', 80: 'Crimen',
  99: 'Documental', 18: 'Drama', 10751: 'Familia', 14: 'Fantasía', 36: 'Historia',
  27: 'Terror', 10402: 'Música', 9648: 'Misterio', 10749: 'Romance',
  878: 'Ciencia ficción', 53: 'Thriller', 10752: 'Guerra', 37: 'Western',
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date_desc',       label: 'Más recientes'   },
  { value: 'date_asc',        label: 'Más antiguas'    },
  { value: 'rating_desc',     label: 'Mejor valoradas' },
  { value: 'popularity_desc', label: 'Más populares'   },
  { value: 'alpha_asc',       label: 'Alfabético'      },
]

const DECADES: { value: DecadeKey; label: string }[] = [
  { value: 'all',   label: 'Todas las décadas' },
  { value: '2020s', label: '2020s'             },
  { value: '2010s', label: '2010s'             },
  { value: '2000s', label: '2000s'             },
  { value: '1990s', label: '90s'               },
  { value: '1980s', label: '80s'               },
  { value: '1970s', label: '70s'               },
  { value: '1960s', label: '60s'               },
  { value: 'older', label: 'Anteriores'        },
]

const SELECT_CLS =
  'appearance-none bg-[#0A0A0F] border border-[#2A2A3A] text-zinc-300 text-xs ' +
  'rounded-lg pl-3 pr-7 py-2 outline-none focus:border-[#FFFD02] hover:border-zinc-500 ' +
  'cursor-pointer transition-colors'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getYear(c: FilmographyCredit): number {
  const y = parseInt((c.release_date ?? c.first_air_date ?? '').slice(0, 4), 10)
  return isNaN(y) ? 0 : y
}

function decadeOf(year: number): DecadeKey {
  if (year >= 2020) return '2020s'
  if (year >= 2010) return '2010s'
  if (year >= 2000) return '2000s'
  if (year >= 1990) return '1990s'
  if (year >= 1980) return '1980s'
  if (year >= 1970) return '1970s'
  if (year >= 1960) return '1960s'
  if (year > 0)     return 'older'
  return 'all'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FilmographyGrid({ credits, title = 'Filmografía' }: Props) {
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all')
  const [sort,        setSort]        = useState<SortOption>('date_desc')
  const [decade,      setDecade]      = useState<DecadeKey>('all')
  const [genreFilter, setGenreFilter] = useState<number | null>(null)
  const [onlyRated,   setOnlyRated]   = useState(false)

  // Genres present in this filmography, sorted by frequency
  const availableGenres = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const c of credits)
      for (const gid of c.genre_ids ?? [])
        counts[gid] = (counts[gid] ?? 0) + 1
    return Object.entries(counts)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([id]) => Number(id))
      .filter(id => GENRE_MAP[id])
  }, [credits])

  // Apply all filters + sort
  const filtered = useMemo(() => {
    let r = credits

    if (mediaFilter !== 'all') r = r.filter(c => c.media_type === mediaFilter)
    if (decade !== 'all')      r = r.filter(c => decadeOf(getYear(c)) === decade)
    if (genreFilter !== null)  r = r.filter(c => c.genre_ids?.includes(genreFilter))
    if (onlyRated)             r = r.filter(c => (c.vote_average ?? 0) > 0)

    return [...r].sort((a, b) => {
      switch (sort) {
        case 'date_asc':        return getYear(a) - getYear(b)
        case 'date_desc':       return getYear(b) - getYear(a)
        case 'rating_desc': {
          const ra = (a.vote_count ?? 0) >= 50 ? (a.vote_average ?? 0) : 0
          const rb = (b.vote_count ?? 0) >= 50 ? (b.vote_average ?? 0) : 0
          return rb - ra
        }
        case 'popularity_desc': return (b.popularity ?? 0) - (a.popularity ?? 0)
        case 'alpha_asc':
          return (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '', 'es')
        default: return 0
      }
    })
  }, [credits, mediaFilter, decade, genreFilter, onlyRated, sort])

  const total   = credits.length
  const movieCt = credits.filter(c => c.media_type === 'movie').length
  const tvCt    = credits.filter(c => c.media_type === 'tv').length
  const isDirty = mediaFilter !== 'all' || sort !== 'date_desc' || decade !== 'all' || genreFilter !== null || onlyRated

  const tabs: { key: MediaFilter; label: string; count: number }[] = [
    { key: 'all',   label: 'Todo',      count: total   },
    { key: 'movie', label: 'Películas', count: movieCt },
    { key: 'tv',    label: 'Series',    count: tvCt    },
  ]

  function resetFilters() {
    setMediaFilter('all')
    setSort('date_desc')
    setDecade('all')
    setGenreFilter(null)
    setOnlyRated(false)
  }

  return (
    <section className="mb-10">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <span className="text-sm text-[#A0A0B0]">
          · {filtered.length}
          {filtered.length < total && ` de ${total}`}
          {' '}títulos
        </span>
      </div>

      {/* Filter bar */}
      <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-3 mb-5">
        <div className="flex flex-wrap items-center gap-2">

          {/* Media type tabs */}
          <div className="flex gap-1 bg-[#0A0A0F] border border-[#2A2A3A] rounded-lg p-1 shrink-0">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setMediaFilter(tab.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  mediaFilter === tab.key
                    ? 'bg-[#FFFD02] text-black'
                    : 'text-[#A0A0B0] hover:text-white'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-[10px] ${mediaFilter === tab.key ? 'text-black/60' : 'text-zinc-600'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="hidden sm:block w-px h-5 bg-[#2A2A3A] shrink-0" />

          {/* Sort */}
          <div className="relative">
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortOption)}
              className={SELECT_CLS}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          </div>

          {/* Decade */}
          <div className="relative">
            <select
              value={decade}
              onChange={e => setDecade(e.target.value as DecadeKey)}
              className={SELECT_CLS}
            >
              {DECADES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          </div>

          {/* Genre — only if data available */}
          {availableGenres.length > 0 && (
            <div className="relative">
              <select
                value={genreFilter?.toString() ?? ''}
                onChange={e => setGenreFilter(e.target.value ? Number(e.target.value) : null)}
                className={SELECT_CLS}
              >
                <option value="">Todos los géneros</option>
                {availableGenres.map(id => (
                  <option key={id} value={id}>{GENRE_MAP[id]}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            </div>
          )}

          {/* Only rated toggle */}
          <button
            onClick={() => setOnlyRated(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${
              onlyRated
                ? 'border-[#FFFD02] bg-[#FFFD02]/10 text-[#FFFD02]'
                : 'border-[#2A2A3A] text-[#A0A0B0] hover:border-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Star size={11} fill={onlyRated ? 'currentColor' : 'none'} />
            Con rating
          </button>

          {/* Reset */}
          {isDirty && (
            <button
              onClick={resetFilters}
              className="text-xs text-[#A0A0B0] hover:text-zinc-300 underline transition-colors ml-auto shrink-0"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-[#2A2A3A] rounded-xl">
          <p className="text-[#A0A0B0] text-sm mb-3">No hay títulos con esos criterios.</p>
          <button
            onClick={resetFilters}
            className="text-xs text-[#FFFD02] hover:underline transition-colors"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {filtered.map(credit => {
            const itemTitle = credit.title ?? credit.name ?? ''
            const year      = getYear(credit)
            return (
              <Link
                key={`${credit.media_type}-${credit.id}`}
                href={`/${credit.media_type}/${credit.id}`}
                className="group block"
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-1.5">
                  <Image
                    src={getPosterUrl(credit.poster_path, 'w185')}
                    alt={itemTitle}
                    fill
                    loading="lazy"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 17vw"
                  />

                  {/* Rating badge */}
                  {(credit.vote_average ?? 0) > 0 && (
                    <div className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-[#13131A]/90 rounded px-1 py-0.5">
                      <Star size={9} className="text-yellow-400 shrink-0" fill="currentColor" />
                      <span className="text-[10px] font-semibold text-white">
                        {(credit.vote_average ?? 0).toFixed(1)}
                      </span>
                    </div>
                  )}

                  {/* TV badge */}
                  {credit.media_type === 'tv' && (
                    <span className="absolute top-1 left-1 text-[9px] bg-purple-700 text-white px-1 py-0.5 rounded font-medium">
                      Serie
                    </span>
                  )}
                </div>

                <p className="text-[11px] font-medium text-zinc-300 line-clamp-2 group-hover:text-white transition-colors leading-tight">
                  {itemTitle}
                </p>
                {year > 0 && <p className="text-[10px] text-[#A0A0B0] mt-0.5">{year}</p>}
                {credit.character && (
                  <p className="text-[9px] text-zinc-600 mt-0.5 italic line-clamp-1">
                    {credit.character}
                  </p>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
