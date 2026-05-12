import type { Metadata } from 'next'
import Link from 'next/link'
import { getAllGuides } from '@/lib/guides'

export const metadata: Metadata = {
  title: 'Guías de cine y series — Glynbox',
  description: 'Guías editoriales curadas: las mejores películas argentinas, cine coreano, Studio Ghibli, Marvel y más recomendaciones por @Ferlageok.',
  openGraph: {
    title: 'Guías de cine y series — Glynbox',
    description: 'Guías editoriales curadas: las mejores películas argentinas, cine coreano, Studio Ghibli, Marvel y más recomendaciones por @Ferlageok.',
    url: 'https://glynbox.com/guias',
    images: [{ url: 'https://glynbox.com/logo.png', width: 1200, height: 630, alt: 'Glynbox Guías' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Guías de cine y series — Glynbox',
    description: 'Guías editoriales curadas: las mejores películas argentinas, cine coreano, Studio Ghibli, Marvel y más recomendaciones por @Ferlageok.',
  },
  alternates: { canonical: 'https://glynbox.com/guias' },
}

const CATEGORY_COLORS: Record<string, string> = {
  'Cine por país':      'bg-blue-900/40 text-blue-300',
  'Cine de animación':  'bg-purple-900/40 text-purple-300',
  'Sagas y universos':  'bg-red-900/40 text-red-300',
  'Streaming':          'bg-green-900/40 text-green-300',
}

export default function GuiasPage() {
  const guides = getAllGuides()

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <div className="max-w-5xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="mb-12">
          <p className="text-[#FFFD02] text-xs font-semibold uppercase tracking-widest mb-3">Editorial</p>
          <h1 className="text-4xl font-black text-white mb-4">Guías de cine y series</h1>
          <p className="text-[#A0A0B0] text-lg max-w-2xl leading-relaxed">
            Guías curadas para descubrir, ordenar y profundizar en el cine que vale la pena.
            Sin algoritmos, sin listas genéricas: criterio editorial con voz propia.
          </p>
        </div>

        {/* Guides grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {guides.map(guide => {
            const categoryStyle = CATEGORY_COLORS[guide.category] ?? 'bg-zinc-800 text-zinc-300'
            const date = new Date(guide.publishedAt).toLocaleDateString('es-AR', {
              day: 'numeric', month: 'long', year: 'numeric',
            })
            return (
              <Link
                key={guide.slug}
                href={`/guias/${guide.slug}`}
                className="group bg-[#13131A] border border-[#2A2A3A] rounded-2xl overflow-hidden hover:border-[#FFFD02]/40 transition-all"
              >
                {/* Hero placeholder */}
                <div
                  className="h-36 flex items-end p-5"
                  style={{ background: `linear-gradient(135deg, ${guide.heroColor ?? '#1a1a2e'} 0%, #13131A 100%)` }}
                >
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${categoryStyle}`}>
                    {guide.category}
                  </span>
                </div>

                {/* Content */}
                <div className="p-5">
                  <h2 className="text-base font-bold text-white group-hover:text-[#FFFD02] transition-colors leading-snug mb-2">
                    {guide.title}
                  </h2>
                  <p className="text-sm text-zinc-500 leading-relaxed line-clamp-2 mb-4">
                    {guide.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {guide.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[10px] bg-[#1C1C27] text-zinc-500 px-2 py-0.5 rounded-full">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-600">
                    <span>por {guide.author}</span>
                    <span>{date}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {guides.length === 0 && (
          <div className="text-center py-20">
            <p className="text-zinc-500">No hay guías disponibles todavía.</p>
          </div>
        )}
      </div>
    </div>
  )
}
