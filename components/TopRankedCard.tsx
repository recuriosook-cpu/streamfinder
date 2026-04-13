import Image from 'next/image'
import Link from 'next/link'
import { getPosterUrl } from '@/lib/tmdb'

interface Props {
  id: number
  title: string
  posterPath: string | null
  mediaType: 'movie' | 'tv'
  rank: number
}

export default function TopRankedCard({ id, title, posterPath, mediaType, rank }: Props) {
  const href = mediaType === 'movie' ? `/movie/${id}` : `/tv/${id}`

  return (
    <Link href={href} className="flex-shrink-0 flex items-end group">
      {/* Ranking number */}
      <span
        className="text-7xl md:text-8xl font-black leading-none select-none text-zinc-800 group-hover:text-zinc-700 transition-colors"
        style={{ WebkitTextStroke: '2px #3f3f46', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
      >
        {rank}
      </span>

      {/* Poster — overlaps the number slightly */}
      <div className="relative w-[90px] h-[135px] rounded-lg overflow-hidden bg-zinc-800 -ml-3 shadow-xl group-hover:shadow-2xl transition-shadow">
        {posterPath ? (
          <Image
            src={getPosterUrl(posterPath)}
            alt={title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="90px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center px-2">
            Sin imagen
          </div>
        )}
      </div>
    </Link>
  )
}
