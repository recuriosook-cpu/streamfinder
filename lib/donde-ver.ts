import { FAMILIAS_DE_PLATAFORMA, PLATAFORMAS_GRANDES, nombreBase } from '@/lib/providers'
import { COUNTRIES } from '@/lib/countries'

/**
 * "Dónde ver" en texto: el título y la descripción de las fichas y el bloque
 * "Dónde ver en Argentina" con la tabla de Latinoamérica. Sale de lo mismo que
 * los logos de `StreamingSection` (`/watch/providers` de TMDB, que viene de
 * JustWatch), pero escrito, para que Google lo lea y responda "dónde ver X".
 *
 * El país de las fichas es Argentina, el mismo con que el servidor arma los
 * logos (`DEFAULT_COUNTRY`); el país que elige cada uno lo aplica el cliente.
 */

interface Proveedor { provider_id: number; provider_name: string; display_priority?: number }
export interface RegionTMDB { flatrate?: Proveedor[]; ads?: Proveedor[]; free?: Proveedor[]; rent?: Proveedor[]; buy?: Proveedor[]; link?: string }

export interface DisponibilidadPais {
  /** Suscripción. */
  suscripcion: string[]
  /** Gratis, con o sin publicidad. */
  gratis: string[]
  alquiler: string[]
  compra: string[]
}

const FAMILIA_POR_ID = new Map(FAMILIAS_DE_PLATAFORMA.flatMap(f => f.ids.map(id => [id, f.name] as const)))

/** El nombre para mostrar: "Netflix Standard with Ads" es Netflix, "HBO Max Amazon Channel" es HBO Max. */
function nombre(p: Proveedor): string {
  return FAMILIA_POR_ID.get(p.provider_id) ?? nombreBase(p.provider_name)
}

/**
 * Las grandes primero, como en el resto del sitio (`plataformas-pais.ts`): el
 * orden de TMDB pone a Claro video antes que HBO Max en Argentina, y el título
 * de la ficha nombra las primeras.
 */
const GRANDES = new Set(PLATAFORMAS_GRANDES.flatMap(f => f.ids))
const orden = (p: Proveedor) => (GRANDES.has(p.provider_id) ? 0 : 1000) + (p.display_priority ?? 999)

function nombres(lista: Proveedor[] | undefined, ya: Set<string> = new Set()): string[] {
  const salida: string[] = []
  for (const p of [...(lista ?? [])].sort((a, b) => orden(a) - orden(b))) {
    const n = nombre(p)
    if (ya.has(n)) continue
    ya.add(n)
    salida.push(n)
  }
  return salida
}

export function disponibilidad(region: RegionTMDB | undefined): DisponibilidadPais {
  // Lo que está en suscripción no se repite como gratis; lo que se alquila sí
  // puede estar también para comprar (es lo normal: Apple TV, Google Play).
  const ya = new Set<string>()
  const suscripcion = nombres(region?.flatrate, ya)
  const gratis = nombres([...(region?.ads ?? []), ...(region?.free ?? [])], ya)
  return { suscripcion, gratis, alquiler: nombres(region?.rent), compra: nombres(region?.buy) }
}

export function hayAlgo(d: DisponibilidadPais): boolean {
  return d.suscripcion.length + d.gratis.length + d.alquiler.length + d.compra.length > 0
}

/** "A", "A y B", "A, B y C". */
export function enumerar(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`
}

/** Los países de Latinoamérica de `COUNTRIES` (sin el Caribe angloparlante), en ese orden. */
export const LATAM = COUNTRIES.slice(0, COUNTRIES.findIndex(c => c.code === 'AG'))

/**
 * El <title> de la ficha: "Dónde ver Origen (2010): HBO Max, Netflix | Glynbox".
 * Hasta tres plataformas de suscripción o gratis; si no hay, si se alquila.
 */
export function tituloDondeVer(titulo: string, anio: string | undefined, ar: DisponibilidadPais): string {
  const base = `Dónde ver ${titulo}${anio ? ` (${anio})` : ''}`
  const plataformas = [...ar.suscripcion, ...ar.gratis]
  let detalle = ''
  if (plataformas.length > 3) detalle = `${plataformas.slice(0, 3).join(', ')} y más`
  else if (plataformas.length > 0) detalle = plataformas.join(', ')
  else if (ar.alquiler.length || ar.compra.length) detalle = ar.alquiler.length ? 'alquiler y compra' : 'compra digital'
  return `${base}${detalle ? `: ${detalle}` : ''} | Glynbox`
}

/** Corta en el último espacio antes de `max` y agrega "…". */
export function recortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const corte = t.lastIndexOf(' ', max - 1)
  return `${t.slice(0, corte > max * 0.6 ? corte : max - 1).replace(/[\s,.;:]+$/, '')}…`
}

/** Una línea corta para la meta description: "En Argentina: HBO Max (suscripción); Apple TV (alquiler)." */
export function dondeVerCorto(ar: DisponibilidadPais): string {
  const partes: string[] = []
  if (ar.suscripcion.length) partes.push(`${enumerar(ar.suscripcion.slice(0, 3))} (suscripción)`)
  if (ar.gratis.length) partes.push(`${enumerar(ar.gratis.slice(0, 2))} (gratis)`)
  const tiendas = ar.alquiler.length ? ar.alquiler : ar.compra
  if (tiendas.length && partes.length < 2) partes.push(`${enumerar(tiendas.slice(0, 2))} (${ar.alquiler.length ? 'alquiler' : 'compra'})`)
  return partes.length ? `En Argentina: ${partes.join('; ')}.` : 'Por ahora no está en streaming en Argentina.'
}

/**
 * La meta description: quién la hizo, dónde verla en Argentina, la nota de
 * Glynbox si hay y el comienzo de la sinopsis, hasta 160 caracteres.
 */
export function descripcionDondeVer(o: {
  titulo: string
  anio?: string
  autor?: { rol: 'de' | 'creada por'; nombre: string } | null
  ar: DisponibilidadPais
  nota?: { avg: number; count: number } | null
  sinopsis?: string | null
}): string {
  const MAX = 160
  const cabeza = `${o.titulo}${o.anio ? ` (${o.anio})` : ''}${o.autor ? `, ${o.autor.rol} ${o.autor.nombre}` : ''}.`
  // Se agregan partes enteras mientras entren, en orden de importancia; sólo la
  // sinopsis, la última, se corta. Antes se cortaba todo junto y quedaba
  // "Nota en Glynbox: 4,0/5 (370…".
  let texto = recortar(`${cabeza} ${dondeVerCorto(o.ar)}`, MAX)
  if (o.nota && o.nota.count >= 3) {
    const nota = ` Nota en Glynbox: ${o.nota.avg.toFixed(1).replace('.', ',')}/5 (${o.nota.count} calificaciones).`
    if (texto.length + nota.length <= MAX) texto += nota
  }
  const resto = MAX - texto.length - 1
  if (o.sinopsis && resto > 40) texto += ` ${recortar(o.sinopsis, resto)}`
  return texto
}

/**
 * Las frases del bloque "Dónde ver en Argentina". `tipo` decide "la película"
 * o "la serie" donde nombrarla por el título queda forzado.
 */
export function fraseArgentina(titulo: string, ar: DisponibilidadPais, tipo: 'movie' | 'tv'): string[] {
  const cosa = tipo === 'movie' ? 'la película' : 'la serie'
  const frases: string[] = []
  if (ar.suscripcion.length) frases.push(`En Argentina, ${titulo} se puede ver con suscripción en ${enumerar(ar.suscripcion)}.`)
  if (ar.gratis.length) frases.push(`${frases.length ? 'También está' : `En Argentina, ${titulo} está`} gratis en ${enumerar(ar.gratis)}.`)
  const alquila = ar.alquiler.length > 0, compra = ar.compra.length > 0
  if (alquila || compra) {
    const mismas = alquila && compra && enumerar(ar.alquiler) === enumerar(ar.compra)
    const tiendas = mismas
      ? `alquilar o comprar en ${enumerar(ar.alquiler)}`
      : [alquila && `alquilar en ${enumerar(ar.alquiler)}`, compra && `comprar en ${enumerar(ar.compra)}`].filter(Boolean).join(' o ')
    frases.push(frases.length ? `Además se puede ${tiendas}.` : `En Argentina, ${cosa} no está incluida en ninguna suscripción, pero se puede ${tiendas}.`)
  }
  if (!frases.length) frases.push(`Por ahora ${titulo} no está en ninguna plataforma de streaming en Argentina.`)
  return frases
}
