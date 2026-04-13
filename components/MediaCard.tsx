'use client'

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

export default function MediaCard({ id, title, posterPath, rating, year, mediaType }: MediaCardProps) {
  const href = mediaType === 'movie' ? `/movie/${id}` : `/tv/${id}`

  return (
    <Link href={href} className="group block">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-2">
        {posterPath ? (
          <Image
            src={getPosterUrl(posterPath)}
            alt={title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-sm text-center px-2">
            Sin imagen
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="absolute bottom-2 left-2 flex items-center gap-1 text-xs text-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <Star size={12} fill="currentColor" />
          <span>{rating.toFixed(1)}</span>
        </div>
        <div className="absolute top-2 right-2">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${mediaType === 'movie' ? 'bg-blue-600' : 'bg-purple-600'}`}>
            {mediaType === 'movie' ? 'Película' : 'Serie'}
          </span>
        </div>
      </div>
      <p className="text-sm font-medium text-white line-clamp-2 leading-tight">{title}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{year}</p>
    </Link>
  )
}
