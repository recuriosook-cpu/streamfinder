import Link from 'next/link'
import GuiaTarjeta from '@/components/GuiaTarjeta'
import { guiasDeTitulo } from '@/lib/guias-relacionadas'

/**
 * Las guías de Glynbox que incluyen el título y, si ninguna lo incluye, las
 * más recientes. Va en el HTML de la ficha (Server Component): es contenido
 * propio, escrito por Fer, y lleva a páginas del sitio, no de TMDB.
 */
export default function GuiasRelacionadas({ tipo, id, titulo }: { tipo: 'movie' | 'tv'; id: number; titulo: string }) {
  const { relacionadas, otras } = guiasDeTitulo(tipo, id)
  const guias = relacionadas.length ? relacionadas : otras
  if (!guias.length) return null

  return (
    <section className="mt-10" aria-labelledby="guias-relacionadas">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="guias-relacionadas" className="text-xl font-bold">
            {relacionadas.length ? `${titulo} en las guías de Glynbox` : 'Guías de Glynbox'}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {relacionadas.length
              ? 'Dónde aparece, en qué orden verla y qué más ver después.'
              : 'Recorridos escritos por Fer Lage para descubrir cine y series.'}
          </p>
        </div>
        <Link href="/guias" prefetch={false} className="shrink-0 text-xs font-semibold text-[#FFFD02] hover:text-[#FFF84D]">
          Ver todas →
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {guias.map(g => <GuiaTarjeta key={g.slug} guia={g} />)}
      </div>
    </section>
  )
}
