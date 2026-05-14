'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

interface FilmRef { id: number; mediaType: 'movie' | 'tv' }
interface Collaborator { id: number; name: string; profilePath: string | null; count: number }

export default function DirectorCollaborators({ films }: { films: FilmRef[] }) {
  const [data, setData] = useState<Collaborator[] | null>(null)
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY

  useEffect(() => {
    if (!films.length) { setData([]); return }
    const batch = films.slice(0, 20)

    Promise.all(
      batch.map(f =>
        fetch(`https://api.themoviedb.org/3/${f.mediaType}/${f.id}/credits?api_key=${key}&language=es-AR`)
          .then(r => r.ok ? r.json() : { cast: [] })
          .catch(() => ({ cast: [] }))
      )
    ).then(results => {
      const counts = new Map<number, { name: string; profilePath: string | null; count: number }>()

      for (const res of results) {
        // Only count top-billed cast (order ≤ 10) to exclude extras
        const topCast = (res.cast ?? []).filter((a: { order?: number }) => (a.order ?? 99) <= 10)
        const seenHere = new Set<number>()

        for (const actor of topCast as { id: number; name: string; profile_path: string | null }[]) {
          if (seenHere.has(actor.id)) continue
          seenHere.add(actor.id)
          if (counts.has(actor.id)) {
            counts.get(actor.id)!.count++
          } else {
            counts.set(actor.id, { name: actor.name, profilePath: actor.profile_path ?? null, count: 1 })
          }
        }
      }

      const sorted: Collaborator[] = [...counts.entries()]
        .map(([id, d]) => ({ id, ...d }))
        .filter(c => c.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)

      setData(sorted)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Loading skeleton
  if (data === null) {
    return (
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4">Actores frecuentes</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-[#1C1C27]" />
              <div className="h-3 w-16 bg-[#1C1C27] rounded" />
              <div className="h-2.5 w-12 bg-[#1C1C27] rounded" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (data.length === 0) return null

  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold mb-4">Actores frecuentes</h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {data.map(actor => (
          <Link
            key={actor.id}
            href={`/actor/${actor.id}`}
            className="flex flex-col items-center text-center group"
          >
            <div className="relative w-16 h-16 rounded-full overflow-hidden bg-[#1C1C27] mb-2 ring-2 ring-zinc-700 group-hover:ring-[#FFFD02]/50 transition-all">
              {actor.profilePath ? (
                <Image
                  src={`https://image.tmdb.org/t/p/w185${actor.profilePath}`}
                  alt={actor.name}
                  fill
                  className="object-cover object-top"
                  sizes="64px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-400 text-lg font-bold select-none">
                  {actor.name.charAt(0)}
                </div>
              )}
            </div>
            <p className="text-xs font-semibold text-white leading-tight line-clamp-2 group-hover:text-[#FFFD02] transition-colors">
              {actor.name}
            </p>
            <p className="text-[10px] text-[#A0A0B0] mt-0.5">{actor.count} proyectos</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
