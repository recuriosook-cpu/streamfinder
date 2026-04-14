'use client'

import { useEffect, useState, useRef } from 'react'
import HeroCarousel from '@/components/HeroCarousel'
import PlatformCarousel from '@/components/PlatformCarousel'
import PlatformLogoStrip from '@/components/PlatformLogoStrip'
import { useCountry } from '@/context/CountryContext'

interface PlatformItem {
  id: number
  title: string
  posterPath: string | null
  mediaType: 'movie' | 'tv'
  date: string
}

interface PlatformData {
  id: number
  name: string
  color: string
  items: PlatformItem[]
}

interface PlatformLogo {
  id: number
  slug: string
  name: string
  color: string
  logoPath: string | null
  staticLogoUrl?: string | null
}

interface HeroMovie {
  id: number
  title: string
  overview: string
  backdrop_path: string | null
  poster_path: string | null
  release_date: string
}

interface HomeData {
  upcomingMovies: HeroMovie[]
  platformsWithLogos: PlatformLogo[]
  platformContent: PlatformData[]
}

function HomeSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Hero skeleton */}
      <div className="h-72 md:h-[480px] bg-zinc-800 w-full" />
      {/* Logo strip skeleton */}
      <div className="h-20 bg-zinc-900 border-y border-zinc-800 flex items-center justify-center gap-6 px-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="w-16 h-9 bg-zinc-700 rounded-lg shrink-0" />
        ))}
      </div>
      {/* Carousel skeletons */}
      <div className="max-w-7xl mx-auto px-4 py-10 space-y-10">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <div className="h-6 w-32 bg-zinc-700 rounded mb-4" />
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 7 }).map((_, j) => (
                <div key={j} className="shrink-0 w-32 aspect-[2/3] bg-zinc-800 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function HomeClient() {
  const { country } = useCountry()
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const prevCountry = useRef<string | null>(null)

  useEffect(() => {
    if (prevCountry.current === country) return
    prevCountry.current = country
    setLoading(true)
    fetch(`/api/home?country=${country}`)
      .then(r => r.json())
      .then((d: HomeData) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [country])

  if (loading || !data) return <HomeSkeleton />

  return (
    <>
      <HeroCarousel movies={data.upcomingMovies} />
      <PlatformLogoStrip platforms={data.platformsWithLogos} />
      <div className="max-w-7xl mx-auto px-4 py-10">
        {data.platformContent.map(platform => (
          <PlatformCarousel
            key={platform.id}
            name={platform.name}
            color={platform.color}
            items={platform.items}
          />
        ))}
      </div>
    </>
  )
}
