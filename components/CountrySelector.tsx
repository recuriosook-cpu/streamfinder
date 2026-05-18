'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { ChevronDown } from 'lucide-react'
import { useCountry } from '@/context/CountryContext'
import { COUNTRIES } from '@/lib/countries'

interface Props {
  variant?: 'compact' | 'full'
  align?: 'left' | 'right'
  onChange?: (code: string) => void
}

function FlagCircle({ code, size = 24 }: { code: string; size?: number }) {
  return (
    <span
      className="rounded-full overflow-hidden bg-zinc-700 shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <Image
        src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
        alt={code}
        width={40}
        height={30}
        className="w-full h-full object-cover"
        unoptimized
      />
    </span>
  )
}

export default function CountrySelector({ variant = 'full', align = 'right', onChange }: Props) {
  const { country, countryData, setCountry } = useCountry()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50)
  }, [open])

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  )

  function handleSelect(code: string) {
    setCountry(code)
    onChange?.(code)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 bg-[#1C1C27] hover:bg-zinc-700 text-zinc-300 hover:text-white px-2.5 py-1.5 rounded-lg transition-colors"
        title={`País: ${countryData.name}`}
      >
        <FlagCircle code={country} size={22} />
        {variant === 'full' && (
          <span className="text-sm">{countryData.name}</span>
        )}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute top-full mt-2 w-56 bg-[#1C1C27] border border-[#2A2A3A] rounded-xl shadow-2xl overflow-hidden z-50 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="p-2 border-b border-[#2A2A3A]">
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar país..."
              className="w-full bg-zinc-700 text-white text-sm rounded-lg px-3 py-1.5 outline-none placeholder-zinc-500 focus:ring-1 focus:ring-[#FFFD02]"
            />
          </div>
          <div className="overflow-y-auto max-h-64">
            {filtered.length === 0 ? (
              <p className="text-[#A0A0B0] text-sm text-center py-4">Sin resultados</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.code}
                  onClick={() => handleSelect(c.code)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                    c.code === country
                      ? 'bg-[#FFFD02]/20 text-[#FFF84D]'
                      : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  <FlagCircle code={c.code} size={24} />
                  <span className="flex-1">{c.name}</span>
                  {c.code === country && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FFFD02] shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
