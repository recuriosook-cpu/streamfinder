'use client'

import { memo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Star } from 'lucide-react'
import { getPosterUrl } from '@/lib/tmdb'

interface MediaCardProps {
  id: number
  title: string
  posterPath: string | null
  rating: number
  year: string
  mediaType: 'movie' | 'tv'
}

function MediaCard({ id, title, posterPath, rating, year, mediaType }: MediaCardProps) {
  const href = mediaType === 'movie' ? `/movie/${id}` : `/tv/${id}`

  return (
    <Link href={href} className="group block">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-1.5">
        {posterPath ? (
          <Image
            src={getPosterUrl(posterPath)}
            alt={title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-200 will-change-transform"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm text-center px-2">
            Sin imagen
          </div>
        )}

        {/* Type badge — top left */}
        <div className="absolute top-1.5 left-1.5">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white"
            style={{ backgroundColor: mediaType === 'movie' ? '#2563eb' : '#7c3aed' }}
          >
            {mediaType === 'movie' ? 'Peli' : 'Serie'}
          </span>
        </div>

        {/* Rating badge — bottom right — always visible */}
        {rating > 0 && (
          <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 bg-black/70 rounded px-1.5 py-0.5">
            <Star size={9} className="text-yellow-400 shrink-0" fill="currentColor" />
            <span className="text-[10px] font-bold text-white">{rating.toFixed(1)}</span>
          </div>
        )}

        {/* Desktop-only action overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-end pb-3 gap-1.5">
          <span className="w-4/5 flex items-center justify-center gap-1 bg-white/20 hover:bg-white/30 text-white text-[10px] font-medium py-1 rounded-full transition-colors">
            + Para ver
          </span>
          <span className="w-4/5 flex items-center justify-center gap-1 bg-white/20 hover:bg-white/30 text-white text-[10px] font-medium py-1 rounded-full transition-colors">
            ♥ Me gusta
          </span>
        </div>
      </div>
      <p className="text-xs font-medium text-white line-clamp-2 leading-tight">{title}</p>
      <p className="text-xs text-[#A0A0B0] mt-0.5">{year}</p>
    </Link>
  )
}

export default memo(MediaCard)
