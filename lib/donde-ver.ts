import { ALL_PLATFORMS, FAMILIAS_DE_PLATAFORMA, PLATAFORMAS_GRANDES, idCanonico, nombreBase } from '@/lib/providers'
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

interface Proveedor { provider_id: number; provider_name: string; display_priority?: number; logo_path?: string | null }
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

/**
 * Plataformas con logo, sin repetir y en el mismo orden y con los mismos
 * nombres que el texto ("Netflix Standard with Ads" es Netflix): cada familia
 * una vez, con el logo de la primera que aparece.
 */
export function plataformasConLogo(lista: Proveedor[]): { nombre: string; logo: string | null }[] {
  const vistos = new Set<string>()
  const salida: { nombre: string; logo: string | null }[] = []
  for (const p of [...lista].sort((a, b) => orden(a) - orden(b))) {
    const n = nombre(p)
    if (vistos.has(n)) continue
    vistos.add(n)
    salida.push({ nombre: n, logo: p.logo_path ?? null })
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

/**
 * Las plataformas de suscripción o gratis del país que tienen página en
 * Glynbox (`/platform/[slug]`), con el nombre con que las nombra la ficha.
 */
export function plataformasConPagina(region: RegionTMDB | undefined): { nombre: string; slug: string }[] {
  const salida: { nombre: string; slug: string }[] = []
  for (const p of [...(region?.flatrate ?? []), ...(region?.ads ?? []), ...(region?.free ?? [])].sort((a, b) => orden(a) - orden(b))) {
    const conf = ALL_PLATFORMS.find(x => x.id === idCanonico(p.provider_id))
    if (conf && !salida.some(s => s.slug === conf.slug)) salida.push({ nombre: nombre(p), slug: conf.slug })
  }
  return salida
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

/** Si está en alguna plataforma (incluso para alquilar) en algún país de Latinoamérica. */
export function enAlgunPaisLatam(results: Record<string, RegionTMDB> | undefined): boolean {
  return LATAM.some(c => hayAlgo(disponibilidad(results?.[c.code])))
}

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
 * El <title> de la ficha en inglés, con la misma lógica que `tituloDondeVer`:
 * "Where to watch Inception (2010): HBO Max, Netflix | Glynbox". `us` es la
 * disponibilidad en Estados Unidos.
 */
export function tituloDondeVerEn(titulo: string, anio: string | undefined, us: DisponibilidadPais): string {
  const base = `Where to watch ${titulo}${anio ? ` (${anio})` : ''}`
  const plataformas = [...us.suscripcion, ...us.gratis]
  let detalle = ''
  if (plataformas.length > 3) detalle = `${plataformas.slice(0, 3).join(', ')} and more`
  else if (plataformas.length > 0) detalle = plataformas.join(', ')
  else if (us.alquiler.length || us.compra.length) detalle = us.alquiler.length ? 'rent or buy' : 'buy digitally'
  return `${base}${detalle ? `: ${detalle}` : ''} | Glynbox`
}

/** "A", "A and B", "A, B and C". */
export function enumerate(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/** `dondeVerCorto` en inglés, para Estados Unidos. */
export function dondeVerCortoEn(us: DisponibilidadPais): string {
  const partes: string[] = []
  if (us.suscripcion.length) partes.push(`${enumerate(us.suscripcion.slice(0, 3))} (subscription)`)
  if (us.gratis.length) partes.push(`${enumerate(us.gratis.slice(0, 2))} (free)`)
  const tiendas = us.alquiler.length ? us.alquiler : us.compra
  if (tiendas.length && partes.length < 2) partes.push(`${enumerate(tiendas.slice(0, 2))} (${us.alquiler.length ? 'rent' : 'buy'})`)
  return partes.length ? `In the US: ${partes.join('; ')}.` : 'Not streaming in the US right now.'
}

/** `descripcionDondeVer` en inglés: mismo orden y mismo largo máximo. */
export function descripcionDondeVerEn(o: {
  titulo: string
  anio?: string
  autor?: { rol: 'by' | 'created by'; nombre: string } | null
  us: DisponibilidadPais
  nota?: { avg: number; count: number } | null
  sinopsis?: string | null
}): string {
  const MAX = 160
  const cabeza = `${o.titulo}${o.anio ? ` (${o.anio})` : ''}${o.autor ? `, ${o.autor.rol} ${o.autor.nombre}` : ''}.`
  let texto = recortar(`${cabeza} ${dondeVerCortoEn(o.us)}`, MAX)
  if (o.nota && o.nota.count >= 3) {
    const nota = ` Glynbox rating: ${o.nota.avg.toFixed(1)}/5 (${o.nota.count} ratings).`
    if (texto.length + nota.length <= MAX) texto += nota
  }
  const resto = MAX - texto.length - 1
  if (o.sinopsis && resto > 40) texto += ` ${recortar(o.sinopsis, resto)}`
  return texto
}

/**
 * Las frases del bloque "Where to watch X in the United States", como
 * `fraseArgentina`.
 */
export function fraseEstadosUnidos(titulo: string, us: DisponibilidadPais, tipo: 'movie' | 'tv'): string[] {
  const cosa = tipo === 'movie' ? 'the movie' : 'the show'
  const frases: string[] = []
  if (us.suscripcion.length) frases.push(`In the United States, you can stream ${titulo} with a subscription on ${enumerate(us.suscripcion)}.`)
  if (us.gratis.length) frases.push(`${frases.length ? "It's also" : `In the United States, ${titulo} is`} free on ${enumerate(us.gratis)}.`)
  const alquila = us.alquiler.length > 0, compra = us.compra.length > 0
  if (alquila || compra) {
    const mismas = alquila && compra && enumerate(us.alquiler) === enumerate(us.compra)
    const tiendas = mismas
      ? `rent or buy it on ${enumerate(us.alquiler)}`
      : [alquila && `rent it on ${enumerate(us.alquiler)}`, compra && `buy it on ${enumerate(us.compra)}`].filter(Boolean).join(' or ')
    frases.push(frases.length ? `You can also ${tiendas}.` : `In the United States, ${cosa} isn't included with any subscription, but you can ${tiendas}.`)
  }
  if (!frases.length) frases.push(`${titulo} isn't available on any streaming service in the United States right now.`)
  return frases
}

/** Los países de habla inglesa de las fichas en inglés (el sitemap y `fichaDelgada`). */
export const ANGLO = ['US', 'GB', 'CA', 'AU', 'IE', 'NZ', 'IN']

/** Si está en alguna plataforma (incluso para alquilar) en algún país de habla inglesa. */
export function enAlgunPaisAnglo(results: Record<string, RegionTMDB> | undefined): boolean {
  return ANGLO.some(c => hayAlgo(disponibilidad(results?.[c])))
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
