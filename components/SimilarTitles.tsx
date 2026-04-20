import Image from 'next/image'
import Link from 'next/link'
import { getPosterUrl } from '@/lib/tmdb'

interface SimilarItem {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  release_date?: string
  first_air_date?: string
}

export default function SimilarTitles({
  items,
  mediaType,
}: {
  items: SimilarItem[]
  mediaType: 'movie' | 'tv'
}) {
  if (items.length === 0) return null

  return (
    <div className="mt-10">
      <h2 className="text-xl font-bold mb-4">Títulos similares</h2>
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
        {items.map(item => {
          const title = item.title ?? item.name ?? 'Sin título'
          const year = (item.release_date ?? item.first_air_date ?? '').slice(0, 4)
          return (
            <Link key={item.id} href={`/${mediaType}/${item.id}`} className="shrink-0 w-32 group">
              <div className="relative w-32 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-2">
                {item.poster_path ? (
                  <Image
                    src={getPosterUrl(item.poster_path, 'w185')}
                    alt={title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="128px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center p-2">
                    Sin imagen
                  </div>
                )}
              </div>
              <p className="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors line-clamp-2 leading-tight">
                {title}
              </p>
              {year && <p className="text-xs text-zinc-600 mt-0.5">{year}</p>}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
