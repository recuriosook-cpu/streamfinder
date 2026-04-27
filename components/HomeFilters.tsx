'use client'

import { useState, useEffect } from 'react'
import MediaCard from './MediaCard'
import { PROVIDER_FILTER_OPTIONS } from '@/lib/providers'

interface Genre { id: number; name: string }
interface MediaItem {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  vote_average: number
  release_date?: string
  first_air_date?: string
}

export default function HomeFilters() {
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie')
  const [genres, setGenres] = useState<Genre[]>([])
  const [selectedGenre, setSelectedGenre] = useState('')
  const [selectedProvider, setSelectedProvider] = useState('')
  const [results, setResults] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadGenres() {
      const endpoint = mediaType === 'movie'
        ? '/api/genres?type=movie'
        : '/api/genres?type=tv'
      const res = await fetch(endpoint)
      const data = await res.json()
      setGenres(data.genres ?? [])
    }
    loadGenres()
    setSelectedGenre('')
    setSelectedProvider('')
    setResults([])
  }, [mediaType])

  useEffect(() => {
    async function discover() {
      setLoading(true)
      const params = new URLSearchParams({ type: mediaType })
      if (selectedGenre) params.set('genre', selectedGenre)
      if (selectedProvider) params.set('provider', selectedProvider)
      const res = await fetch(`/api/discover?${params}`)
      const data = await res.json()
      setResults(data.results ?? [])
      setLoading(false)
    }
    discover()
  }, [mediaType, selectedGenre, selectedProvider])

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Media type toggle */}
        <div className="flex bg-[#1C1C27] rounded-lg p-1 gap-1">
          {(['movie', 'tv'] as const).map(t => (
            <button
              key={t}
              onClick={() => setMediaType(t)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                mediaType === t ? 'bg-[#6B3FE7] text-white' : 'text-[#A0A0B0] hover:text-white'
              }`}
            >
              {t === 'movie' ? 'Películas' : 'Series'}
            </button>
          ))}
        </div>

        {/* Genre filter */}
        <select
          value={selectedGenre}
          onChange={e => setSelectedGenre(e.target.value)}
          className="bg-[#1C1C27] text-white text-sm rounded-lg px-3 py-2 border border-[#2A2A3A] outline-none"
        >
          <option value="">Todos los géneros</option>
          {genres.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>

        {/* Provider filter */}
        <select
          value={selectedProvider}
          onChange={e => setSelectedProvider(e.target.value)}
          className="bg-[#1C1C27] text-white text-sm rounded-lg px-3 py-2 border border-[#2A2A3A] outline-none"
        >
          <option value="">Todas las plataformas</option>
          {PROVIDER_FILTER_OPTIONS.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-2 border-[#6B3FE7] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {results.map(item => (
            <MediaCard
              key={item.id}
              id={item.id}
              title={item.title ?? item.name ?? ''}
              posterPath={item.poster_path}
              rating={item.vote_average}
              year={(item.release_date ?? item.first_air_date ?? '').slice(0, 4)}
              mediaType={mediaType}
            />
          ))}
        </div>
      )}
    </div>
  )
}
