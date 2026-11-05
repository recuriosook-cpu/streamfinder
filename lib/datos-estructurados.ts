/**
 * Datos estructurados (schema.org, JSON-LD) de las fichas.
 *
 * La nota que va en `aggregateRating` es sólo la de Glynbox: Google no admite
 * publicar como propias notas tomadas de otro sitio (la de TMDB se sacó por
 * eso). Y sólo con `MIN_VOTOS` o más, para no mostrar un 5/5 de un voto.
 */

const BASE = 'https://www.glynbox.com'
const MIN_VOTOS = 5

type JsonLd = Record<string, unknown>
interface Persona { id: number; name: string }
interface Nota { avg: number; count: number }

/** Sin las claves vacías: `undefined`, `[]` y `''` no aportan y ensucian el JSON. */
function limpio(o: JsonLd): JsonLd {
  return Object.fromEntries(Object.entries(o).filter(([, v]) =>
    v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)))
}

function notaLD(nota: Nota | null | undefined): JsonLd | undefined {
  if (!nota || nota.count < MIN_VOTOS) return undefined
  return {
    '@type': 'AggregateRating',
    ratingValue: Math.round(nota.avg * 10) / 10,
    ratingCount: nota.count,
    bestRating: 5,
    worstRating: 0.5,
  }
}

const persona = (ruta: 'actor' | 'director') => (p: Persona): JsonLd =>
  ({ '@type': 'Person', name: p.name, url: `${BASE}/${ruta}/${p.id}` })

/** Minutos a duración ISO 8601: 148 → "PT2H28M". */
function duracion(min: number | null | undefined): string | undefined {
  if (!min || min <= 0) return undefined
  const h = Math.floor(min / 60), m = min % 60
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}`
}

const poster = (path: string | null | undefined) => (path ? `https://image.tmdb.org/t/p/w500${path}` : undefined)

export function peliculaLD(o: {
  id: number
  titulo: string
  tituloOriginal?: string | null
  sinopsis?: string | null
  posterPath?: string | null
  estreno?: string | null
  minutos?: number | null
  generos: string[]
  directores: Persona[]
  actores: Persona[]
  imdbId?: string | null
  nota?: Nota | null
}): JsonLd {
  return limpio({
    '@context': 'https://schema.org',
    '@type': 'Movie',
    name: o.titulo,
    alternateName: o.tituloOriginal ?? undefined,
    url: `${BASE}/movie/${o.id}`,
    description: o.sinopsis ?? undefined,
    image: poster(o.posterPath),
    datePublished: o.estreno || undefined,
    duration: duracion(o.minutos),
    genre: o.generos,
    director: o.directores.map(persona('director')),
    actor: o.actores.slice(0, 5).map(persona('actor')),
    sameAs: o.imdbId ? [`https://www.imdb.com/title/${o.imdbId}/`] : undefined,
    aggregateRating: notaLD(o.nota),
  })
}

export function serieLD(o: {
  id: number
  titulo: string
  tituloOriginal?: string | null
  sinopsis?: string | null
  posterPath?: string | null
  inicio?: string | null
  generos: string[]
  creadores: Persona[]
  actores: Persona[]
  temporadas?: number | null
  episodios?: number | null
  imdbId?: string | null
  nota?: Nota | null
}): JsonLd {
  return limpio({
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    name: o.titulo,
    alternateName: o.tituloOriginal ?? undefined,
    url: `${BASE}/tv/${o.id}`,
    description: o.sinopsis ?? undefined,
    image: poster(o.posterPath),
    startDate: o.inicio || undefined,
    genre: o.generos,
    // Los creadores no tienen página de director: van sin `url`.
    creator: o.creadores.map(p => ({ '@type': 'Person', name: p.name })),
    actor: o.actores.slice(0, 5).map(persona('actor')),
    numberOfSeasons: o.temporadas || undefined,
    numberOfEpisodes: o.episodios || undefined,
    sameAs: o.imdbId ? [`https://www.imdb.com/title/${o.imdbId}/`] : undefined,
    aggregateRating: notaLD(o.nota),
  })
}

export function temporadaLD(o: {
  serieId: number
  serie: string
  numero: number
  nombre: string
  sinopsis?: string | null
  posterPath?: string | null
  inicio?: string | null
  episodios: { numero: number; nombre: string | null }[]
}): JsonLd {
  return limpio({
    '@context': 'https://schema.org',
    '@type': 'TVSeason',
    name: o.nombre,
    seasonNumber: o.numero,
    url: `${BASE}/tv/${o.serieId}/temporada/${o.numero}`,
    description: o.sinopsis ?? undefined,
    image: poster(o.posterPath),
    startDate: o.inicio || undefined,
    numberOfEpisodes: o.episodios.length || undefined,
    partOfSeries: { '@type': 'TVSeries', name: o.serie, url: `${BASE}/tv/${o.serieId}` },
    episode: o.episodios.map(e => limpio({ '@type': 'TVEpisode', episodeNumber: e.numero, name: e.nombre ?? undefined })),
  })
}

/** Las migas de pan: las mismas que muestra `Breadcrumb` en la página. */
export function migasLD(items: { nombre: string; ruta: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.nombre, item: `${BASE}${it.ruta}` })),
  }
}

/** Para `<script type="application/ld+json">`: sin `<` crudo, que cerraría el script si un texto trae "</script>". */
export function ldJson(datos: JsonLd | JsonLd[]): string {
  return JSON.stringify(datos).replace(/</g, '\\u003c')
}
