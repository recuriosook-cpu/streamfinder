import Image from 'next/image'
import { countryName, getCountry } from '@/lib/countries'
import { LATAM, enumerar, enumerate, plataformasConLogo, type RegionTMDB } from '@/lib/donde-ver'
import { estadoEstreno, fechaEstreno, hoyArgentina, hoyEstadosUnidos, type EstrenoRef } from '@/lib/estreno-pais'
import type { Idioma } from '@/lib/idioma'
import { FlagCircle } from '@/components/CountrySelector'

/** Primero estos, en este orden. */
const PRINCIPALES = ['MX', 'ES', 'CO', 'CL', 'PE', 'UY', 'EC', 'VE', 'US']

/**
 * Los países del desplegable: los principales y después el resto de
 * Latinoamérica (sin Argentina, que tiene su bloque) por orden alfabético.
 */
const PAISES = [
  ...PRINCIPALES,
  ...LATAM
    .filter(c => c.code !== 'AR' && !PRINCIPALES.includes(c.code))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map(c => c.code),
]

/**
 * En inglés (fichas de `/en/`): primero los de habla inglesa, en este orden, y
 * después Latinoamérica y España como en castellano, con Argentina (que ahí no
 * tiene bloque propio) y sin Estados Unidos (que sí).
 */
const PRINCIPALES_EN = ['GB', 'CA', 'AU', 'IE', 'NZ', 'IN', 'AR']
const PAISES_EN = [
  ...PRINCIPALES_EN,
  ...PAISES.filter(code => code !== 'US' && !PRINCIPALES_EN.includes(code)),
]

/** Los países que en inglés llevan "the" ("in the United Kingdom"). */
const CON_THE = new Set(['GB', 'US', 'DO', 'BS', 'TC', 'NL', 'CZ'])

/** Logos visibles por fila; los demás quedan en el texto accesible y en "+N". */
const MAX_LOGOS = 5

type Fila =
  | { code: string; pais: string; tipo: 'suscripcion' | 'alquiler'; plataformas: { nombre: string; logo: string | null }[] }
  | { code: string; pais: string; tipo: 'estreno'; texto: string }

/**
 * Una fila por país: las plataformas de suscripción (o gratis); si no hay,
 * las de alquiler o compra; si tampoco, la fecha de estreno o "Solo en cines"
 * (`lib/estreno-pais.ts`). `null` si no hay nada de eso.
 */
function fila(code: string, region: RegionTMDB | undefined, estreno: EstrenoRef | undefined, hoy: string, idioma: Idioma = 'es'): Fila | null {
  const en = idioma === 'en'
  const pais = en ? countryName(code, 'en') : getCountry(code).name
  const suscripcion = plataformasConLogo([...(region?.flatrate ?? []), ...(region?.ads ?? []), ...(region?.free ?? [])])
  if (suscripcion.length) return { code, pais, tipo: 'suscripcion', plataformas: suscripcion }
  const alquiler = plataformasConLogo([...(region?.rent ?? []), ...(region?.buy ?? [])])
  if (alquiler.length) return { code, pais, tipo: 'alquiler', plataformas: alquiler }
  const estado = estreno ? estadoEstreno(estreno, code, hoy) : null
  // "Todavía no se estrenó" sin fecha no dice nada útil y alarga la lista.
  if (!estado || estado.tipo === 'proximoSinFecha') return null
  const texto = en
    ? (estado.tipo === 'proximo' ? `Comes out ${fechaEstreno(estado.fecha, hoy, 'en')}` : 'Only in theaters')
    : (estado.tipo === 'proximo' ? `Se estrena el ${fechaEstreno(estado.fecha, hoy)}` : 'Solo en cines')
  return { code, pais, tipo: 'estreno', texto }
}

/** "En México: Prime Video y Netflix." — lo que lee Google y un lector de pantalla. */
function textoAccesible(f: Fila, idioma: Idioma = 'es'): string {
  if (idioma === 'en') {
    // "In the United Kingdom", "In Canada".
    const en = `In ${CON_THE.has(f.code) ? 'the ' : ''}${f.pais}`
    if (f.tipo === 'estreno') return `${en}: ${f.texto.charAt(0).toLowerCase()}${f.texto.slice(1)}.`
    const nombresEn = enumerate(f.plataformas.map(p => p.nombre))
    return f.tipo === 'alquiler' ? `${en}: rent or buy on ${nombresEn}.` : `${en}: ${nombresEn}.`
  }
  if (f.tipo === 'estreno') return `En ${f.pais}: ${f.texto.toLowerCase()}.`
  const nombres = enumerar(f.plataformas.map(p => p.nombre))
  return f.tipo === 'alquiler' ? `En ${f.pais}: alquiler o compra en ${nombres}.` : `En ${f.pais}: ${nombres}.`
}

/**
 * "Dónde ver X en otros países": un desplegable cerrado, debajo del bloque de
 * Argentina, con México, España, Estados Unidos y toda Latinoamérica.
 *
 * Componente de servidor: todo va en el HTML aunque esté cerrado (Google lee
 * lo que está dentro de un <details>). Sale de los mismos datos que ya pide la
 * ficha (`/watch/providers` y `/release_dates` traen todos los países): no
 * agrega pedidos.
 */
export default function DondeVerOtrosPaises({ titulo, results, estreno, idioma = 'es' }: {
  titulo: string
  results: Record<string, RegionTMDB>
  estreno?: EstrenoRef
  /** En inglés: otros países y orden, y las fechas de Estados Unidos. */
  idioma?: Idioma
}) {
  const en = idioma === 'en'
  const hoy = en ? hoyEstadosUnidos() : hoyArgentina()
  const filas = (en ? PAISES_EN : PAISES).map(code => fila(code, results[code], estreno, hoy, idioma)).filter((f): f is Fila => f !== null)
  if (filas.length === 0) return null

  return (
    <details className="group mt-3 bg-[#13131A] border border-[#2A2A3A] rounded-xl">
      <summary className="cursor-pointer list-none flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90" aria-hidden="true">›</span>
        <h2 className="inline min-w-0 truncate">{en ? `Where to watch ${titulo} in other countries` : <>Dónde ver {titulo} en otros países</>}</h2>
      </summary>
      <ul className="divide-y divide-[#2A2A3A] px-5 pb-3">
        {filas.map(f => (
          <li key={f.code} className="py-2 flex items-center gap-3 min-h-[44px]">
            <span className="sr-only">{textoAccesible(f, idioma)}</span>
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
                  <span className="ml-1 text-[11px] text-[#A0A0B0]">{en ? 'Rent' : 'Alquiler'}</span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
