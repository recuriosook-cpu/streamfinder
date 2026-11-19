import Image from 'next/image'
import { getCountry } from '@/lib/countries'
import { enumerar, plataformasConLogo, type RegionTMDB } from '@/lib/donde-ver'
import { estadoEstreno, fechaEstreno, hoyArgentina, type EstrenoRef } from '@/lib/estreno-pais'
import { FlagCircle } from '@/components/CountrySelector'

/** Los países del desplegable, en este orden. */
const PAISES = ['MX', 'ES', 'CO', 'CL', 'PE', 'UY', 'EC', 'VE', 'US']

/** Logos visibles por fila; los demás quedan en el texto accesible y en "+N". */
const MAX_LOGOS = 5

type Fila =
  | { code: string; pais: string; tipo: 'suscripcion' | 'alquiler'; plataformas: { nombre: string; logo: string | null }[] }
  | { code: string; pais: string; tipo: 'estreno'; texto: string }

/**
 * Una fila por país: las plataformas de suscripción (o gratis); si no hay,
 * las de alquiler o compra; si tampoco, lo que digan las reglas de estreno
 * (`lib/estreno-pais.ts`). `null` si no hay nada que decir de ese país.
 */
function fila(code: string, region: RegionTMDB | undefined, estreno: EstrenoRef | undefined, hoy: string): Fila | null {
  const pais = getCountry(code).name
  const suscripcion = plataformasConLogo([...(region?.flatrate ?? []), ...(region?.ads ?? []), ...(region?.free ?? [])])
  if (suscripcion.length) return { code, pais, tipo: 'suscripcion', plataformas: suscripcion }
  const alquiler = plataformasConLogo([...(region?.rent ?? []), ...(region?.buy ?? [])])
  if (alquiler.length) return { code, pais, tipo: 'alquiler', plataformas: alquiler }
  const estado = estreno ? estadoEstreno(estreno, code, hoy) : null
  if (!estado) return null
  const texto = estado.tipo === 'proximo' ? `Se estrena el ${fechaEstreno(estado.fecha, hoy)}`
    : estado.tipo === 'proximoSinFecha' ? 'Todavía no se estrenó'
    : 'Solo en cines'
  return { code, pais, tipo: 'estreno', texto }
}

/** "En México: Prime Video y Netflix." — lo que lee Google y un lector de pantalla. */
function textoAccesible(f: Fila): string {
  if (f.tipo === 'estreno') return `En ${f.pais}: ${f.texto.toLowerCase()}.`
  const nombres = enumerar(f.plataformas.map(p => p.nombre))
  return f.tipo === 'alquiler' ? `En ${f.pais}: alquiler o compra en ${nombres}.` : `En ${f.pais}: ${nombres}.`
}

/**
 * "Dónde ver X en otros países": un desplegable cerrado, al final de la ficha,
 * con México, España, el resto de Latinoamérica y Estados Unidos.
 *
 * Componente de servidor: todo va en el HTML aunque esté cerrado (Google lee
 * lo que está dentro de un <details>). Sale de los mismos datos que ya pide la
 * ficha (`/watch/providers` y `/release_dates` traen todos los países): no
 * agrega pedidos.
 */
export default function DondeVerOtrosPaises({ titulo, results, estreno }: {
  titulo: string
  results: Record<string, RegionTMDB>
  estreno?: EstrenoRef
}) {
  const hoy = hoyArgentina()
  const filas = PAISES.map(code => fila(code, results[code], estreno, hoy)).filter((f): f is Fila => f !== null)
  if (filas.length === 0) return null

  return (
    <details className="group mt-3 bg-[#13131A] border border-[#2A2A3A] rounded-xl">
      <summary className="cursor-pointer list-none flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span>
        <h2 className="inline min-w-0 truncate">Dónde ver {titulo} en otros países</h2>
      </summary>
      <ul className="divide-y divide-[#2A2A3A] px-5 pb-3">
        {filas.map(f => (
          <li key={f.code} className="py-2 flex items-center gap-3 min-h-[44px]">
            <span className="sr-only">{textoAccesible(f)}</span>
            <span className="w-32 sm:w-40 shrink-0 flex items-center gap-2 text-sm text-white" aria-hidden="true">
              {/* Imagen y no el emoji: Windows muestra el emoji como dos letras. */}
              <FlagCircle code={f.code} size={18} />
              <span className="truncate">{f.pais}</span>
            </span>
            {f.tipo === 'estreno' ? (
              <span className="text-xs text-[#A0A0B0]" aria-hidden="true">{f.texto}</span>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5" aria-hidden="true">
                {f.plataformas.slice(0, MAX_LOGOS).map(p => p.logo ? (
                  <Image
                    key={p.nombre}
                    src={`https://image.tmdb.org/t/p/w92${p.logo}`}
                    alt={p.nombre}
                    title={p.nombre}
                    width={28}
                    height={28}
                    loading="lazy"
                    className="h-7 w-7 shrink-0 rounded-md ring-1 ring-white/10"
                  />
                ) : (
                  <span key={p.nombre} className="text-xs text-zinc-300 truncate">{p.nombre}</span>
                ))}
                {f.plataformas.length > MAX_LOGOS && (
                  <span className="text-xs text-[#A0A0B0]">+{f.plataformas.length - MAX_LOGOS}</span>
                )}
                {f.tipo === 'alquiler' && (
                  <span className="ml-1 text-[11px] text-[#A0A0B0]">Alquiler</span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
