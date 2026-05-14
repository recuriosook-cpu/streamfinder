'use client'

import { memo, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'
import type { GuideFrontmatter } from '@/lib/guides'

const SCROLL_AMOUNT = 480

const CATEGORY_ACCENT: Record<string, string> = {
  'Cine por país':     '#9b59b6',
  'Cine de animación': '#3498db',
  'Sagas y universos': '#e74c3c',
  'Streaming':         '#27ae60',
}

function GuidesCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [guides, setGuides] = useState<GuideFrontmatter[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/guides')
      .then(r => r.ok ? r.json() : { guides: [] })
      .then((d: { guides: GuideFrontmatter[] }) => {
        setGuides(d.guides ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function scroll(dir: 'left' | 'right') {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? SCROLL_AMOUNT : -SCROLL_AMOUNT, behavior: 'smooth' })
  }

  if (!loading && guides.length === 0) return null

  return (
    <section className="mt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-4 sm:px-0">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BookOpen size={18} className="text-[#FFFD02]" />
            Guías de Glynbox
          </h2>
          <p className="text-xs text-zinc-600 mt-0.5">Recomendaciones curadas por @Ferlageok</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/guias"
            className="hidden sm:block text-xs font-semibold text-[#FFFD02] hover:text-[#FFF84D] transition-colors"
          >
            Ver todas →
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => scroll('left')}
              className="w-7 h-7 rounded-full bg-[#1C1C27] hover:bg-zinc-700 flex items-center justify-center transition-colors"
            >
              <ChevronLeft size={14} className="text-zinc-400" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-7 h-7 rounded-full bg-[#1C1C27] hover:bg-zinc-700 flex items-center justify-center transition-colors"
            >
              <ChevronRight size={14} className="text-zinc-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Carousel */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-2 no-scrollbar carousel-scroll px-4 sm:px-0"
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shrink-0 w-72 h-48 rounded-xl bg-[#13131A] border border-[#2A2A3A] animate-pulse carousel-snap" />
            ))
          : guides.map(guide => {
              const accent = CATEGORY_ACCENT[guide.category] ?? '#FFFD02'
              return (
                <Link
                  key={guide.slug}
                  href={`/guias/${guide.slug}`}
                  className="shrink-0 w-72 h-48 rounded-xl overflow-hidden relative group carousel-snap block"
                >
                  {/* Hero image or gradient fallback */}
                  {guide.heroImage ? (
                    <Image
                      src={guide.heroImage}
                      alt={guide.title}
                      fill
                      loading="lazy"
                      sizes="288px"
                      className="object-cover group-hover:scale-105 transition-transform duration-200 will-change-transform"
                    />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{ background: `linear-gradient(135deg, ${guide.heroColor ?? '#1a1a2e'} 0%, #0A0A0F 100%)` }}
                    />
                  )}

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />

                  {/* Content */}
                  <div className="absolute inset-0 p-4 flex flex-col justify-between">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider self-start px-2 py-0.5 rounded-full"
                      style={{ background: accent + '33', color: accent }}
                    >
                      {guide.category}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white leading-snug line-clamp-2 mb-1 group-hover:text-[#FFFD02] transition-colors">
                        {guide.title}
                      </p>
                      <p className="text-[11px] text-zinc-400 line-clamp-1">{guide.description}</p>
                    </div>
                  </div>
                </Link>
              )
            })
        }
      </div>
    </section>
  )
}

export default memo(GuidesCarousel)
