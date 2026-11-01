'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import type { Platform } from '@/lib/providers'
import { plataformasAMostrar, type PlataformaPais } from '@/lib/plataformas-pais'

/**
 * La grilla para elegir plataformas de streaming. La usan el paso 1 del
 * onboarding, "Mis plataformas" en Ajustes y el aviso de cambio de país, así que
 * muestran lo mismo y guardan lo mismo: ids de TMDB. La lista es la del país
 * (`usePlataformasPais`) y la pasa quien la usa.
 */

export function PlatformLogo({ platform, size }: { platform: Pick<Platform, 'name' | 'color' | 'fallbackLogoPath'> & { logoPath?: string | null }; size: number }) {
  const [failed, setFailed] = useState(false)
  const path = platform.logoPath ?? platform.fallbackLogoPath
  if (path && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://image.tmdb.org/t/p/w154${path}`}
        alt=""
        width={size}
        height={size}
        className="rounded-xl object-cover"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div
      className="rounded-xl flex items-center justify-center text-white font-bold text-center leading-tight p-1"
      style={{ width: size, height: size, backgroundColor: platform.color, fontSize: Math.max(8, size / 6) }}
    >
      {platform.name}
    </div>
  )
}

/** Las elegidas con una más o una menos. Saca todos los ids que tenga esa plataforma. */
export function alternarPlataforma(elegidas: number[], p: PlataformaPais): number[] {
  return p.ids.some(id => elegidas.includes(id))
    ? elegidas.filter(id => !p.ids.includes(id))
    : [...elegidas, p.id]
}

export default function PlatformPicker({
  plataformas,
  cargando = false,
  selected,
  onToggle,
  disabled = false,
}: {
  plataformas: PlataformaPais[]
  cargando?: boolean
  selected: number[]
  onToggle: (p: PlataformaPais) => void
  disabled?: boolean
}) {
  if (cargando) {
    return (
      <div className="flex justify-center py-10">
        <div className="w-6 h-6 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-x-3 gap-y-4">
      {plataformasAMostrar(plataformas, selected).map(p => {
        const active = p.ids.some(id => selected.includes(id))
        return (
          <button
            key={p.id}
            type="button"
            role="checkbox"
            aria-checked={active}
            aria-label={p.name}
            disabled={disabled}
            onClick={() => onToggle(p)}
            className="flex flex-col items-center gap-1.5 transition-transform active:scale-95 disabled:cursor-wait"
          >
            <span
              className="relative rounded-[14px] border-2 transition-all"
              style={{ borderColor: active ? '#FFFD02' : 'transparent', opacity: active ? 1 : 0.55 }}
            >
              <PlatformLogo platform={p} size={58} />
              {active && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#FFFD02] flex items-center justify-center">
                  <Check size={12} className="text-black" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="text-[11px] text-center leading-tight text-[#A0A0B0] line-clamp-2">{p.name}</span>
          </button>
        )
      })}
    </div>
  )
}
