'use client'

import { memo } from 'react'
import Image from 'next/image'
import Link from 'next/link'

function CarouselCard({
  id, mediaType, posterPath, title, year, voteAverage, providerLogoPath, providerName, inCinemas,
}: {
  id: number; mediaType: 'movie' | 'tv'; posterPath: string | null
  title: string; year?: string; voteAverage?: number
  providerLogoPath?: string | null; providerName?: string | null
  inCinemas?: boolean
}) {
  const href = `/${mediaType}/${id}`
  return (
    <div className="flex-shrink-0 w-36 sm:w-36 carousel-snap group">
      <Link href={href} className="block">
        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-1.5 transition-transform duration-200 group-hover:scale-105 will-change-transform">
          {posterPath ? (
            <Image
              src={`https://image.tmdb.org/t/p/w185${posterPath}`}
              alt={title} fill className="object-cover" sizes="128px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#A0A0B0] text-xs text-center px-2">
              Sin imagen
            </div>
          )}

          {/* Type badge — top left */}
          <div className="absolute top-1.5 left-1.5">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ backgroundColor: mediaType === 'movie' ? '#2563eb' : '#7c3aed', color: '#fff' }}
            >
              {mediaType === 'movie' ? 'Peli' : 'Serie'}
            </span>
          </div>

          {/* Rating badge — top right */}
          {voteAverage && voteAverage > 0 && (
            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-black/70 rounded px-1.5 py-0.5">
              <span className="text-[10px] font-bold" style={{ color: '#FFFD02' }}>
                ★ {voteAverage.toFixed(1)}
              </span>
            </div>
          )}

          {/* Provider logo or Cinema badge — bottom right */}
          {providerLogoPath ? (
            <div className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-[4px] overflow-hidden shadow-lg ring-1 ring-white/20">
              <Image
                src={`https://image.tmdb.org/t/p/original${providerLogoPath}`}
                alt={providerName ?? ''} width={24} height={24}
                className="w-full h-full object-cover"
              />
            </div>
          ) : inCinemas ? (
            <div className="absolute bottom-1.5 right-1.5 flex flex-col items-center gap-0.5 bg-black/80 rounded-md px-1.5 py-1 shadow-lg">
              <span className="text-sm leading-none select-none">🎥</span>
              <span className="text-[9px] font-bold leading-none" style={{ color: '#FFFD02' }}>Cine</span>
            </div>
          ) : null}

          {/* Hover overlay with quick actions */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-end pb-3 gap-1.5">
            <span className="w-4/5 flex items-center justify-center gap-1 bg-white/20 hover:bg-white/30 text-white text-[10px] font-medium py-1 rounded-full transition-colors">
              + Para ver
            </span>
            <span className="w-4/5 flex items-center justify-center gap-1 bg-white/20 hover:bg-white/30 text-white text-[10px] font-medium py-1 rounded-full transition-colors">
              ♥ Me gusta
            </span>
          </div>
        </div>
      </Link>

      <Link href={href}>
        <p className="text-xs font-semibold text-white line-clamp-1 group-hover:text-zinc-300 transition-colors">
          {title}
        </p>
        {year && <p className="text-[11px] text-[#A0A0B0] mt-0.5">{year}</p>}
      </Link>
    </div>
  )
}

export default memo(CarouselCard)
