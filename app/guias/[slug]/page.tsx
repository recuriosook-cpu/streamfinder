import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getGuideBySlug, getAllGuideSlugs } from '@/lib/guides'
import { MovieGrid } from '@/components/guides/MovieGrid'
import { CalloutBox } from '@/components/guides/CalloutBox'
import { evaluate } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'

// ── Static generation ─────────────────────────────────────────────────────

export async function generateStaticParams() {
  return getAllGuideSlugs().map(slug => ({ slug }))
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const guide = getGuideBySlug(slug)
  if (!guide) return {}
  return {
    title:       `${guide.title} — Glynbox`,
    description: guide.description,
    openGraph: {
      title:       guide.title,
      description: guide.description,
      type:        'article',
      publishedTime: guide.publishedAt,
      modifiedTime:  guide.updatedAt,
      authors:       [guide.author],
      tags:          guide.tags,
    },
  }
}

// ── MDX components available inside guide content ─────────────────────────

const MDX_COMPONENTS = {
  MovieGrid,
  CalloutBox,
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function GuideSlugPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const guide = getGuideBySlug(slug)
  if (!guide) notFound()

  // Compile MDX at build time (SSG)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { default: MDXContent } = await evaluate(guide.content, {
    ...(runtime as any),
  }) as { default: React.ComponentType<{ components?: Record<string, unknown> }> }

  const date = new Date(guide.publishedAt).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  // JSON-LD Article schema
  const jsonLd = {
    '@context':       'https://schema.org',
    '@type':          'Article',
    headline:         guide.title,
    description:      guide.description,
    datePublished:    guide.publishedAt,
    dateModified:     guide.updatedAt,
    author: { '@type': 'Person', name: guide.author },
    publisher: {
      '@type': 'Organization',
      name:    'Glynbox',
      url:     'https://glynbox.com',
    },
  }

  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="min-h-screen bg-[#0A0A0F]">

        {/* Hero */}
        <div
          className="relative py-16 px-4"
          style={{ background: `linear-gradient(135deg, ${guide.heroColor ?? '#1a1a2e'} 0%, #0A0A0F 100%)` }}
        >
          <div className="max-w-3xl mx-auto">
            <Link
              href="/guias"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-8"
            >
              <ArrowLeft size={13} /> Todas las guías
            </Link>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-widest">
                {guide.category}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-4">
              {guide.title}
            </h1>
            <p className="text-[#A0A0B0] text-lg leading-relaxed mb-6 max-w-2xl">
              {guide.description}
            </p>
            <div className="flex items-center gap-3 text-xs text-zinc-600">
              <span>por <strong className="text-zinc-400">{guide.author}</strong></span>
              <span>·</span>
              <span>{date}</span>
              <span>·</span>
              <span>{guide.movies.length} películas</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto px-4 py-10">
          <article className="
            prose prose-invert max-w-none
            prose-headings:text-white prose-headings:font-bold
            prose-h2:text-xl prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-base prose-h3:mt-6 prose-h3:mb-3
            prose-p:text-zinc-300 prose-p:leading-relaxed prose-p:my-3
            prose-strong:text-white
            prose-a:text-[#FFFD02] prose-a:no-underline hover:prose-a:underline
            prose-blockquote:border-l-[#FFFD02] prose-blockquote:text-zinc-400
            prose-ul:text-zinc-300 prose-li:my-1
          ">
            <MDXContent components={MDX_COMPONENTS as Record<string, unknown>} />
          </article>

          {/* Tags */}
          <div className="mt-12 pt-8 border-t border-[#2A2A3A]">
            <div className="flex flex-wrap gap-2 mb-8">
              {guide.tags.map(tag => (
                <span key={tag} className="text-xs bg-[#13131A] border border-[#2A2A3A] text-zinc-500 px-3 py-1 rounded-full">
                  #{tag}
                </span>
              ))}
            </div>

            {/* CTA */}
            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold text-white mb-1">¿Te gustó esta guía?</p>
                <p className="text-xs text-zinc-500">
                  Llevalas a tu perfil: marcá las que ya viste, ponelas en tu lista, escribí reseñas.
                </p>
              </div>
              <div className="flex gap-3 shrink-0">
                <Link
                  href="/auth"
                  className="text-sm font-semibold bg-[#FFFD02] hover:bg-[#E5EB00] text-black px-4 py-2 rounded-lg transition-colors"
                >
                  Crear cuenta gratis
                </Link>
                <Link
                  href="/importar"
                  className="text-sm font-medium bg-[#1C1C27] hover:bg-zinc-700 border border-[#2A2A3A] text-zinc-300 px-4 py-2 rounded-lg transition-colors"
                >
                  Importar de Letterboxd
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
