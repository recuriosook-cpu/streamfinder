import Link from 'next/link'
import { disponibilidad, fraseArgentina, hayAlgo, plataformasConPagina, type RegionTMDB } from '@/lib/donde-ver'
import { estadoEstreno, fraseEstrenoArgentina, hoyArgentina, type EstrenoRef } from '@/lib/estreno-pais'

/**
 * "Dónde ver [título] en Argentina", en texto. Componente de servidor: va
 * escrito en el HTML para que Google pueda responder "dónde ver X" con la
 * ficha. Los logos y el selector de país siguen en `StreamingSection`, arriba
 * de esto.
 *
 * Argentina es fija (es el país con que el servidor arma la ficha); quien está
 * en otro país lo encuentra en `DondeVerOtrosPaises`, debajo.
 */
export default function DondeVer({ titulo, tipo, results, estreno }: {
  titulo: string
  tipo: 'movie' | 'tv'
  results: Record<string, RegionTMDB>
  /**
   * Sin plataformas en Argentina: "todavía no se estrenó" o "solo en cines",
   * con las mismas reglas que `StreamingSection` (`lib/estreno-pais.ts`).
   */
  estreno?: EstrenoRef
}) {
  const ar = disponibilidad(results.AR)
  // Fecha de Argentina: es la que corresponde a este bloque, y es un componente
  // de servidor (sin hidratación). La ficha se cachea un día en la CDN.
  const hoy = hoyArgentina()
  const frase = (!hayAlgo(ar) && estreno && fraseEstrenoArgentina(estadoEstreno(estreno, 'AR', hoy), titulo, hoy))
    || fraseArgentina(titulo, ar, tipo).join(' ')
  // Links a la página de cada plataforma: de la ficha a lo demás que hay ahí.
  const conPagina = plataformasConPagina(results.AR)

  return (
    <section className="mt-6 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5" aria-labelledby="donde-ver-titulo">
      <h2 id="donde-ver-titulo" className="text-lg font-bold mb-2">Dónde ver {titulo} en Argentina</h2>
      <p className="text-sm text-zinc-300 leading-relaxed">{frase}</p>
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

      <p className="text-[11px] text-zinc-600 mt-4">Disponibilidad según JustWatch. Puede cambiar de un día para otro.</p>
    </section>
  )
}
