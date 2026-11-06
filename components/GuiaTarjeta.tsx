import Link from 'next/link'
import type { GuideFrontmatter } from '@/lib/guides'

/** Tarjeta chica de una guía, para la portada y las fichas. Server Component: sin JS. */
export default function GuiaTarjeta({ guia }: { guia: GuideFrontmatter }) {
  return (
    <Link
      href={`/guias/${guia.slug}`}
      prefetch={false}
      className="group flex flex-col overflow-hidden rounded-xl border border-[#2A2A3A] bg-[#13131A] transition-colors hover:border-[#FFFD02]/40"
    >
      <div
        className="relative h-28 w-full overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${guia.heroColor ?? '#1a1a2e'} 0%, #13131A 100%)` }}
      >
        {guia.heroImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={guia.heroImage}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-90"
          />
        )}
        <span className="absolute bottom-2 left-3 rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-200">
          {guia.category}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-bold leading-snug text-white transition-colors group-hover:text-[#FFFD02]">
          {guia.title}
        </h3>
        <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-zinc-400">{guia.description}</p>
        <p className="mt-auto pt-3 text-[11px] text-zinc-500">por {guia.author}</p>
      </div>
    </Link>
  )
}
