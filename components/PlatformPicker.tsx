'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { ALL_PLATFORMS, type PlatformConfig } from '@/lib/providers'

/**
 * La grilla para elegir plataformas de streaming. La usan el paso 1 del
 * onboarding y "Mis plataformas" en Ajustes, así que las dos muestran lo mismo
 * y guardan lo mismo: ids de TMDB de `ALL_PLATFORMS`.
 */

export function PlatformLogo({ platform, size }: { platform: PlatformConfig; size: number }) {
  const [failed, setFailed] = useState(false)
  if (platform.fallbackLogoPath && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://image.tmdb.org/t/p/w154${platform.fallbackLogoPath}`}
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

export default function PlatformPicker({
  selected,
  onToggle,
  disabled = false,
}: {
  selected: number[]
  onToggle: (id: number) => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-x-3 gap-y-4">
      {ALL_PLATFORMS.map(p => {
        const active = selected.includes(p.id)
        return (
          <button
            key={p.id}
            type="button"
            role="checkbox"
            aria-checked={active}
            aria-label={p.name}
            disabled={disabled}
            onClick={() => onToggle(p.id)}
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
