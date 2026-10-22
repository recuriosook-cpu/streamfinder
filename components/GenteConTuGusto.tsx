'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/analytics'
import FollowButton from '@/components/FollowButton'
import type { PersonaConTuGusto } from '@/lib/gusto'

/**
 * "Gente con tu gusto", arriba del feed de Comunidad. Igual que en la app
 * (`GenteConTuGusto` de glynbox-mobile): foto, @, "Coinciden en X%", tres
 * pósters que los dos calificaron alto y "Seguir". Quién
 * aparece lo decide `/api/community/gusto` (`lib/gusto.ts`).
 */
export default function GenteConTuGusto() {
  const [gente, setGente] = useState<PersonaConTuGusto[] | null>(null)
  const [faltan, setFaltan] = useState<number | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/community/gusto', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((body: { gente?: PersonaConTuGusto[]; faltan?: number } | null) => {
        if (!vivo || !body) return
        const lista = Array.isArray(body.gente) ? body.gente : []
        setGente(lista)
        setFaltan(typeof body.faltan === 'number' ? body.faltan : null)
        if (lista.length > 0) track('gusto_carrusel_visto', { personas: lista.length })
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  if (!gente) return null
  if (gente.length === 0) {
    return faltan ? (
      <p className="mb-6 text-xs text-[#A0A0B0]">
        Calificá {faltan} {faltan === 1 ? 'título más' : 'títulos más'} y te mostramos gente con tu gusto.
      </p>
    ) : null
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold text-white">Gente con tu gusto</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {gente.map(p => (
          <div key={p.id} className="w-56 shrink-0 rounded-2xl border border-[#2A2A3A] bg-[#13131A] p-3">
            <Link
              href={`/usuario/${p.username}`}
              onClick={() => track('gusto_perfil_abierto', { porcentaje: p.porcentaje })}
              className="flex items-center gap-2.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.avatarUrl} alt="" className="h-11 w-11 rounded-full object-cover" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white hover:underline">@{p.username}</p>
                <p className="text-xs font-bold text-[#FFFD02]">Coinciden en {p.porcentaje}%</p>
              </div>
            </Link>
            <div className="mt-3 flex gap-1.5">
              {p.posters.map(poster => (
                <Link key={`${poster.mediaType}:${poster.id}`} href={`/${poster.mediaType}/${poster.id}`} title={poster.title}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`https://image.tmdb.org/t/p/w154${poster.posterPath}`}
                    alt={poster.title}
                    className="h-[87px] w-[58px] rounded-md object-cover bg-[#1C1C27]"
                  />
                </Link>
              ))}
            </div>
            <div className="mt-3" onClickCapture={() => track('gusto_seguir', { porcentaje: p.porcentaje })}>
              <FollowButton targetUserId={p.id} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
