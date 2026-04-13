import { searchMulti } from '@/lib/tmdb'
import MediaCard from '@/components/MediaCard'
import { Search } from 'lucide-react'

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = '', page = '1' } = await searchParams

  if (!q) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <Search size={48} className="mx-auto text-zinc-600 mb-4" />
        <p className="text-zinc-400 text-lg">Ingresá un término para buscar</p>
      </div>
    )
  }

  const data = await searchMulti(q, Number(page))
  const results = (data.results ?? []).filter(
    (item: { media_type: string }) => item.media_type === 'movie' || item.media_type === 'tv'
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Resultados para: <span className="text-emerald-400">"{q}"</span>
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          {data.total_results ?? 0} resultado{data.total_results !== 1 ? 's' : ''} encontrado{data.total_results !== 1 ? 's' : ''}
        </p>
      </div>

      {results.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-zinc-400">No se encontraron resultados para "{q}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {results.map((item: {
            id: number
            media_type: 'movie' | 'tv'
            title?: string
            name?: string
            poster_path: string | null
            vote_average: number
            release_date?: string
            first_air_date?: string
          }) => (
            <MediaCard
              key={`${item.media_type}-${item.id}`}
              id={item.id}
              title={item.title ?? item.name ?? ''}
              posterPath={item.poster_path}
              rating={item.vote_average}
              year={(item.release_date ?? item.first_air_date ?? '').slice(0, 4)}
              mediaType={item.media_type}
            />
          ))}
        </div>
      )}
    </div>
  )
}
