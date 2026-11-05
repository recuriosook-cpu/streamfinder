import Link from 'next/link'
import { LATAM, disponibilidad, enumerar, fraseArgentina, hayAlgo, plataformasConPagina, type RegionTMDB } from '@/lib/donde-ver'
import { FlagCircle } from '@/components/CountrySelector'

/**
 * "Dónde ver [título] en Argentina" y, debajo, el resto de Latinoamérica, en
 * texto. Componente de servidor: va escrito en el HTML para que Google pueda
 * responder "dónde ver X" con la ficha. Los logos y el selector de país siguen
 * en `StreamingSection`, arriba de esto.
 *
 * Argentina es fija (es el país con que el servidor arma la ficha); quien está
 * en otro país lo encuentra en la tabla.
 */
export default function DondeVer({ titulo, tipo, results }: {
  titulo: string
  tipo: 'movie' | 'tv'
  results: Record<string, RegionTMDB>
}) {
  const ar = disponibilidad(results.AR)
  // Links a la página de cada plataforma: de la ficha a lo demás que hay ahí.
  const conPagina = plataformasConPagina(results.AR)
  const otros = LATAM
    .filter(c => c.code !== 'AR')
    .map(c => ({ pais: c, d: disponibilidad(results[c.code]) }))
    .filter(x => hayAlgo(x.d))

  return (
    <section className="mt-6 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5" aria-labelledby="donde-ver-titulo">
      <h2 id="donde-ver-titulo" className="text-lg font-bold mb-2">Dónde ver {titulo} en Argentina</h2>
      <p className="text-sm text-zinc-300 leading-relaxed">{fraseArgentina(titulo, ar, tipo).join(' ')}</p>
      {conPagina.length > 0 && (
        <p className="text-sm text-[#A0A0B0] mt-2">
          Más para ver en{' '}
          {conPagina.map((p, i) => (
            <span key={p.slug}>
              {i > 0 && (i === conPagina.length - 1 ? ' y ' : ', ')}
              <Link prefetch={false} href={`/platform/${p.slug}`} className="text-white underline decoration-[#2A2A3A] underline-offset-2 hover:text-[#FFFD02]">{p.nombre}</Link>
            </span>
          ))}
          .
        </p>
      )}

      {otros.length > 0 && (
        // Cerrado: abierto, en el celular empuja todo lo demás muy abajo. Google
        // lee igual lo que está dentro de un <details>.
        <details className="group mt-4">
          <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors">
            <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span>
            <h3 className="inline">
              Dónde ver {titulo} en el resto de Latinoamérica{' '}
              <span className="font-normal text-[#A0A0B0] whitespace-nowrap">({otros.length} {otros.length === 1 ? 'país' : 'países'})</span>
            </h3>
          </summary>
          <ul className="divide-y divide-[#2A2A3A] text-sm mt-2">
            {otros.map(({ pais, d }) => (
              <li key={pais.code} className="py-2 flex flex-col sm:flex-row sm:gap-4">
                <span className="sm:w-40 shrink-0 font-medium text-white flex items-center gap-2">
                  {/* Imagen y no el emoji: Windows muestra el emoji como dos letras. */}
                  <FlagCircle code={pais.code} size={16} />{pais.name}
                </span>
                <span className="text-[#A0A0B0]">
                  {[
                    d.suscripcion.length > 0 && <span key="s"><span className="text-zinc-300">Suscripción:</span> {enumerar(d.suscripcion)}</span>,
                    d.gratis.length > 0 && <span key="g"><span className="text-zinc-300">Gratis:</span> {enumerar(d.gratis)}</span>,
                    d.alquiler.length > 0 && <span key="a"><span className="text-zinc-300">Alquiler:</span> {enumerar(d.alquiler)}</span>,
                    d.alquiler.length === 0 && d.compra.length > 0 && <span key="c"><span className="text-zinc-300">Compra:</span> {enumerar(d.compra)}</span>,
                  ].filter(Boolean).flatMap((x, i) => (i ? [<span key={`sep${i}`} aria-hidden="true"> · </span>, x] : [x]))}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-[11px] text-zinc-600 mt-4">Disponibilidad según JustWatch. Puede cambiar de un día para otro.</p>
    </section>
  )
}
