import { getAllGuides, getGuideBySlug, type GuideFrontmatter } from '@/lib/guides'

/**
 * Serializador de las guías editoriales para la app mobile.
 *
 * React Native no puede compilar MDX, así que el trabajo pesado —parsear el
 * .mdx y resolver los títulos contra TMDB— se hace acá y la app sólo recibe
 * JSON y lo dibuja.
 *
 * El contenido vive en `content/guides/*.mdx` (en inglés, ojo: el directorio no
 * es `content/guias/`). Estas rutas se llaman `/api/guias/*` porque es el
 * contrato que consume la app; `lib/guides.ts` sigue siendo la fuente.
 *
 * Convive con `/api/guides`, que devuelve el frontmatter crudo y lo usa el
 * carrusel del home de la web. No se toca: son dos contratos distintos sobre el
 * mismo contenido.
 */

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const TMDB_BASE = 'https://api.themoviedb.org/3'

/** Un día. Las guías se editan cada varios meses. */
export const GUIAS_TTL_SECONDS = 86_400

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
} as const

/**
 * Cache compartida: las guías son iguales para todos, así que el CDN puede
 * servir la misma respuesta a todo el mundo. Es lo contrario de los endpoints
 * de comunidad, que devuelven algo distinto según quién pregunta.
 */
export function sharedCache(seconds: number): Record<string, string> {
  return {
    'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`,
  }
}

export type MediaType = 'movie' | 'tv'

export type GuiaItem = {
  id: number
  mediaType: MediaType
  title: string
  posterPath: string | null
  releaseYear: number | null
}

export type GuiaSection =
  | { type: 'heading'; level: 2 | 3; body: string; personId?: number }
  | { type: 'text'; body: string }
  | { type: 'list'; items: string[] }
  | { type: 'movie_grid'; label: string | null; items: GuiaItem[] }
  | { type: 'movie_card'; item: GuiaItem }
  | { type: 'callout'; variant: CalloutVariant; body: string }

export type CalloutVariant = 'tip' | 'warning' | 'note' | 'info'

const CALLOUT_VARIANTS: CalloutVariant[] = ['tip', 'warning', 'note', 'info']

export type GuiaIndexEntry = {
  slug: string
  title: string
  tagline: string
  hero: string | null
  heroColor: string | null
  category: string
  itemCount: number
  publishedAt: string
}

export type GuiaDetail = {
  slug: string
  title: string
  tagline: string
  hero: string | null
  heroColor: string | null
  category: string
  author: string
  publishedAt: string
  updatedAt: string
  tags: string[]
  itemCount: number
  sections: GuiaSection[]
}

const SITE_URL = 'https://www.glynbox.com'

/** Los heros son rutas relativas en el frontmatter; la app necesita absolutas. */
function absoluteHero(heroImage: string | undefined): string | null {
  if (!heroImage) return null
  return heroImage.startsWith('http') ? heroImage : `${SITE_URL}${heroImage}`
}

// ── Parser del MDX ──────────────────────────────────────────────────────────

/**
 * Referencia a un título antes de resolverse contra TMDB.
 *
 * El parser sale rápido con los ids y después se resuelven todos juntos: así
 * una guía de 26 películas hace 26 fetches en paralelo y no 26 en serie.
 */
type PendingRef = { id: number; mediaType: MediaType }

type ParsedSection =
  | Exclude<GuiaSection, { type: 'movie_grid' } | { type: 'movie_card' }>
  | { type: 'movie_grid'; label: string | null; refs: PendingRef[] }
  | { type: 'movie_card'; ref: PendingRef }

const RE_GRID = /^<MovieGrid\s+([^>]*?)\/>\s*$/
const RE_CARD = /^<MovieCard\s+([^>]*?)\/>\s*$/
const RE_CALLOUT = /^<CalloutBox(?:\s+type="(\w+)")?\s*>([\s\S]*?)<\/CalloutBox>\s*$/
const RE_HEADING = /^(#{2,3})\s+(.+)$/
/** `### [Alfred Hitchcock](/director/2636) (1899–1980)` */
const RE_HEADING_LINK = /^\[([^\]]+)\]\(\/director\/(\d+)\)\s*(.*)$/
const RE_LIST_ITEM = /^[-*]\s+(.+)$/

function attr(source: string, name: string): string | null {
  const match = new RegExp(`${name}="([^"]*)"`).exec(source)
  return match ? match[1] : null
}

function numberList(source: string, name: string): number[] {
  const match = new RegExp(`${name}=\\{\\[([^\\]]*)\\]\\}`).exec(source)
  if (!match) return []
  return match[1]
    .split(',')
    .map((piece) => Number(piece.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
}

function singleNumber(source: string, name: string): number | null {
  const match = new RegExp(`${name}=\\{(\\d+)\\}`).exec(source)
  return match ? Number(match[1]) : null
}

function mediaTypeOf(source: string): MediaType {
  // `MovieGrid` de la web asume 'movie' cuando falta el atributo, y 54 de los
  // 58 grids lo omiten. Se replica ese default en vez de fallar.
  return attr(source, 'mediaType') === 'tv' ? 'tv' : 'movie'
}

/**
 * Convierte el cuerpo del MDX en una lista plana de secciones.
 *
 * Es un lector línea a línea y no un AST de verdad porque no hace falta: en las
 * 13 guías el JSX siempre está solo en su línea, los CalloutBox nunca cruzan
 * más de una, y no hay imágenes, tablas ni blockquotes. Verificado sobre los 13
 * archivos antes de escribir esto.
 *
 * La negrita `**así**` se deja tal cual dentro de `body`: el renderer de la app
 * la interpreta al dibujar. Sacarla acá perdería énfasis en ~226 lugares.
 */
export function parseGuideBody(content: string): ParsedSection[] {
  const sections: ParsedSection[] = []
  const lines = content.split('\n')

  let paragraph: string[] = []
  let list: string[] = []

  function flushParagraph() {
    if (paragraph.length === 0) return
    sections.push({ type: 'text', body: paragraph.join(' ').trim() })
    paragraph = []
  }

  function flushList() {
    if (list.length === 0) return
    sections.push({ type: 'list', items: list })
    list = []
  }

  function flush() {
    flushParagraph()
    flushList()
  }

  for (const raw of lines) {
    const line = raw.trim()

    if (line.length === 0) {
      flush()
      continue
    }

    const grid = RE_GRID.exec(line)
    if (grid) {
      flush()
      const mediaType = mediaTypeOf(grid[1])
      sections.push({
        type: 'movie_grid',
        label: attr(grid[1], 'label'),
        refs: numberList(grid[1], 'tmdbIds').map((id) => ({ id, mediaType })),
      })
      continue
    }

    const card = RE_CARD.exec(line)
    if (card) {
      flush()
      const id = singleNumber(card[1], 'tmdbId')
      if (id !== null) {
        sections.push({
          type: 'movie_card',
          ref: { id, mediaType: mediaTypeOf(card[1]) },
        })
      }
      continue
    }

    const callout = RE_CALLOUT.exec(line)
    if (callout) {
      flush()
      const variant = callout[1] as CalloutVariant
      sections.push({
        type: 'callout',
        variant: CALLOUT_VARIANTS.includes(variant) ? variant : 'note',
        body: callout[2].trim(),
      })
      continue
    }

    const heading = RE_HEADING.exec(line)
    if (heading) {
      flush()
      const level = heading[1].length === 2 ? 2 : 3
      const linked = RE_HEADING_LINK.exec(heading[2])

      // Los h3 de "directores icónicos" son `[Nombre](/director/id) (años)`.
      // El id de persona se separa para que la app pueda abrir su ficha.
      if (linked) {
        const suffix = linked[3].trim()
        sections.push({
          type: 'heading',
          level,
          body: suffix ? `${linked[1]} ${suffix}` : linked[1],
          personId: Number(linked[2]),
        })
      } else {
        sections.push({ type: 'heading', level, body: heading[2] })
      }
      continue
    }

    const item = RE_LIST_ITEM.exec(line)
    if (item) {
      flushParagraph()
      list.push(item[1])
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flush()
  return sections
}

// ── Resolución contra TMDB ──────────────────────────────────────────────────

type TmdbResponse = {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  release_date?: string
  first_air_date?: string
}

function yearOf(value: string | undefined): number | null {
  if (!value) return null
  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) && year > 1800 ? year : null
}

/**
 * Trae título, poster y año de cada referencia.
 *
 * Se cachea con el mismo TTL que la guía: los datos de una película de 1988 no
 * cambian, y sin esto cada revalidación dispararía 26 fetches a TMDB.
 *
 * Un título que falle se descarta en vez de romper la guía entera: si TMDB
 * borró un id o cambió de tipo, es mejor una grilla con una película menos que
 * un 500.
 */
async function resolveRefs(refs: PendingRef[]): Promise<Map<string, GuiaItem>> {
  const resolved = new Map<string, GuiaItem>()
  if (!TMDB_API_KEY || refs.length === 0) return resolved

  const unique = new Map<string, PendingRef>()
  for (const ref of refs) unique.set(`${ref.mediaType}:${ref.id}`, ref)

  await Promise.all(
    [...unique.entries()].map(async ([key, ref]) => {
      try {
        const url = `${TMDB_BASE}/${ref.mediaType}/${ref.id}?api_key=${TMDB_API_KEY}&language=es-AR`
        const res = await fetch(url, { next: { revalidate: GUIAS_TTL_SECONDS } })
        if (!res.ok) return

        const data = (await res.json()) as TmdbResponse
        resolved.set(key, {
          id: ref.id,
          mediaType: ref.mediaType,
          title: (ref.mediaType === 'movie' ? data.title : data.name) ?? '',
          posterPath: data.poster_path,
          releaseYear: yearOf(
            ref.mediaType === 'movie' ? data.release_date : data.first_air_date
          ),
        })
      } catch {
        // Silencio a propósito: el título simplemente no entra en la grilla.
      }
    })
  )

  return resolved
}

/** Cuántos títulos distintos referencia el cuerpo de una guía. */
function countItems(sections: ParsedSection[]): number {
  const ids = new Set<string>()
  for (const section of sections) {
    if (section.type === 'movie_grid') {
      for (const ref of section.refs) ids.add(`${ref.mediaType}:${ref.id}`)
    } else if (section.type === 'movie_card') {
      ids.add(`${section.ref.mediaType}:${section.ref.id}`)
    }
  }
  return ids.size
}

/**
 * El índice de guías.
 *
 * `itemCount` se cuenta parseando el cuerpo y no leyendo `movies` del
 * frontmatter: esa lista quedó desactualizada en 2 de las 13 guías
 * (marvel-cronologico dice 7 y tiene 9; evolucion-accion dice 16 y tiene 17).
 */
export function buildIndex(): GuiaIndexEntry[] {
  return getAllGuides().map((guide: GuideFrontmatter) => {
    const detail = getGuideBySlug(guide.slug)
    const sections = detail ? parseGuideBody(detail.content) : []

    return {
      slug: guide.slug,
      title: guide.title,
      tagline: guide.description,
      hero: absoluteHero(guide.heroImage),
      heroColor: guide.heroColor ?? null,
      category: guide.category,
      itemCount: countItems(sections),
      publishedAt: guide.publishedAt,
    }
  })
}

/** Una guía entera, con los títulos ya resueltos. `null` si el slug no existe. */
export async function buildDetail(slug: string): Promise<GuiaDetail | null> {
  const guide = getGuideBySlug(slug)
  if (!guide) return null

  const parsed = parseGuideBody(guide.content)

  const refs: PendingRef[] = []
  for (const section of parsed) {
    if (section.type === 'movie_grid') refs.push(...section.refs)
    else if (section.type === 'movie_card') refs.push(section.ref)
  }

  const resolved = await resolveRefs(refs)
  const pick = (ref: PendingRef) => resolved.get(`${ref.mediaType}:${ref.id}`)

  const sections: GuiaSection[] = []
  for (const section of parsed) {
    if (section.type === 'movie_grid') {
      const items = section.refs
        .map(pick)
        .filter((item): item is GuiaItem => item !== undefined)
      // Una grilla que quedó vacía no se manda: la app dibujaría un título de
      // sección con nada abajo.
      if (items.length > 0) {
        sections.push({ type: 'movie_grid', label: section.label, items })
      }
      continue
    }

    if (section.type === 'movie_card') {
      const item = pick(section.ref)
      if (item) sections.push({ type: 'movie_card', item })
      continue
    }

    sections.push(section)
  }

  return {
    slug: guide.slug,
    title: guide.title,
    tagline: guide.description,
    hero: absoluteHero(guide.heroImage),
    heroColor: guide.heroColor ?? null,
    category: guide.category,
    author: guide.author,
    publishedAt: guide.publishedAt,
    updatedAt: guide.updatedAt,
    tags: guide.tags ?? [],
    itemCount: countItems(parsed),
    sections,
  }
}

/** Los slugs válidos, para rechazar cualquier otra cosa antes de tocar el disco. */
export function isKnownSlug(slug: string): boolean {
  return getAllGuides().some((guide) => guide.slug === slug)
}
