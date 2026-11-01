'use client'

import { useRef, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCountry } from '@/context/CountryContext'
import CountrySelector from '@/components/CountrySelector'

interface PlatformWithLogo {
  id: number
  slug: string
  name: string
  color: string
  logoPath: string | null | undefined
}

interface Props {
  platforms: PlatformWithLogo[]
}

const SCROLL_AMOUNT = 320
/** Un margen para no marcar como "queda más" una diferencia de redondeo. */
const TOLERANCIA = 2

export default function PlatformLogoStrip({ platforms }: Props) {
  const { countryData } = useCountry()
  const scrollRef = useRef<HTMLDivElement>(null)
  // Hasta dónde se puede mover: las flechas se apagan en cada punta.
  const [puedeIzquierda, setPuedeIzquierda] = useState(false)
  const [puedeDerecha, setPuedeDerecha] = useState(false)
  // Track images that failed to load so we show the text fallback instead
  const [imgErrors, setImgErrors] = useState<Set<number>>(new Set())

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => {
      setPuedeIzquierda(el.scrollLeft > TOLERANCIA)
      setPuedeDerecha(el.scrollLeft + el.clientWidth < el.scrollWidth - TOLERANCIA)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    el.addEventListener('scroll', check, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', check)
    }
    // `platforms`: la lista cambia con el país, y con ella lo que entra.
  }, [platforms])

  // La rueda del mouse mueve la fila mientras tenga para dónde; en las puntas
  // sigue la página. React registra `onWheel` como pasivo y no dejaría frenar
  // el scroll vertical. El trackpad, de costado, ya lo resuelve el navegador.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const rueda = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
      const puede = e.deltaY > 0
        ? el.scrollLeft + el.clientWidth < el.scrollWidth - TOLERANCIA
        : el.scrollLeft > TOLERANCIA
      if (!puede) return
      e.preventDefault()
      el.scrollBy({ left: e.deltaY, behavior: 'instant' })
    }
    el.addEventListener('wheel', rueda, { passive: false })
    return () => el.removeEventListener('wheel', rueda)
  }, [])

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({
      left: dir === 'right' ? SCROLL_AMOUNT : -SCROLL_AMOUNT,
      behavior: 'smooth',
    })
  }

  const handleImgError = (id: number) => {
    setImgErrors(prev => new Set(prev).add(id))
  }

  return (
    <div className="bg-[#13131A]/60 border-y border-[#2A2A3A] py-5">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          {/* Como en la app: el país al lado del título. Lo guarda en el perfil. */}
          <div className="flex items-center gap-3 min-w-0">
            <p className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-widest">
              Plataformas disponibles en {countryData.name}
            </p>
            <CountrySelector variant="compact" align="left" />
          </div>
          {/* Siempre a la vista, como en "Para vos"; se apagan si no hay más para ver. */}
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => scroll('left')}
              disabled={!puedeIzquierda}
              className="w-8 h-8 bg-[#1C1C27] hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-40 disabled:hover:bg-[#1C1C27] disabled:cursor-default"
              aria-label="Plataformas anteriores"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              disabled={!puedeDerecha}
              className="w-8 h-8 bg-[#1C1C27] hover:bg-zinc-700 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-40 disabled:hover:bg-[#1C1C27] disabled:cursor-default"
              aria-label="Plataformas siguientes"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto no-scrollbar pb-1 carousel-scroll"
          // `carousel-scroll` deja sólo el gesto de costado: empezar a deslizar
          // sobre esta fila no tiene que trabar el scroll de la página.
          style={{ touchAction: 'pan-x pan-y' }}
        >
          {platforms.map(platform => {
            const showLogo = !!platform.logoPath && !imgErrors.has(platform.id)
            return (
              <Link
                key={platform.id}
                href={`/platform/${platform.slug}`}
                className="flex-shrink-0 group"
                title={platform.name}
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden transition-transform duration-200 group-hover:scale-110 group-hover:ring-2 group-hover:ring-white/30 shadow-lg">
                  {showLogo ? (
                    <Image
                      src={`https://image.tmdb.org/t/p/w154${platform.logoPath}`}
                      alt={platform.name}
                      width={64}
                      height={64}
                      className="w-full h-full object-cover"
                      onError={() => handleImgError(platform.id)}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-white font-bold text-xs text-center px-1 leading-tight"
                      style={{ backgroundColor: platform.color }}
                    >
                      {platform.name}
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-[#A0A0B0] text-center mt-1 group-hover:text-zinc-300 transition-colors truncate w-16">
                  {platform.name}
                </p>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
