/**
 * Llena el índice de búsqueda (`supabase-search-index.sql`) desde TMDB. Lo
 * usan `scripts/sync-search-index.mjs` (la carga completa, desde una
 * computadora) y `/api/cron/search-index` (una parte por semana), así que acá
 * va TypeScript "borrable" nomás: el script lo importa tal cual con Node.
 *
 * ── Cómo se recorre TMDB ──────────────────────────────────────────────────
 *
 * Con `/discover`, por tramos de fechas de estreno: `discover` corta en la
 * página 500 (10.000 resultados), y un año entero entra de sobra (el más
 * cargado tiene unas 4.000 películas con 20 votos o más). Si algún tramo se
 * pasa, se parte en dos y se vuelve a intentar.
 *
 * Cada tramo se pide en tres idiomas —es-AR, es-MX, en-US— y se juntan por id:
 * así cada título queda con su nombre argentino (o español, que es lo que TMDB
 * devuelve si no hay argentino), mexicano, inglés y original. Son ~13.000
 * pedidos para el catálogo entero; TMDB aguanta ~50 por segundo y acá van de a
 * 8 a la vez, con reintento si contesta 429.
 *
 * ── Qué se borra ──────────────────────────────────────────────────────────
 *
 * Al terminar un tramo sin errores, los títulos de ese tramo que no aparecieron
 * (bajaron del umbral de votos, o TMDB los borró) salen del índice. Si el tramo
 * no terminó —un error, o se acabó el tiempo del cron— no se borra nada.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizar } from './search-ranking.ts'

export type MediaType = 'movie' | 'tv'

/** Umbral de votos para entrar al índice. Medido: ~66.000 películas y ~19.500 series. */
export const VOTOS_MINIMOS: Record<MediaType, number> = { movie: 20, tv: 10 }

const IDIOMAS = ['es-AR', 'es-MX', 'en-US'] as const
const CONCURRENCIA = 8
const REINTENTOS = 4
const LOTE_UPSERT = 500
const LARGO_SINOPSIS = 200

/** Un tramo de fechas de estreno ('YYYY-MM-DD', los dos extremos incluidos). */
export interface Tramo {
  mediaType: MediaType
  desde: string
  hasta: string
}

export interface Opciones {
  apiKey: string
  /** `Date.now()` a partir del cual no se empieza nada nuevo. */
  limite?: number
}

export class SinTiempo extends Error {
  constructor() {
    super('se acabó el tiempo')
    this.name = 'SinTiempo'
  }
}

// ── Tramos ────────────────────────────────────────────────────────────────

/** Un tramo por año y por tipo, del año `desde` al `hasta`. */
export function tramosPorAnio(desde: number, hasta: number): Tramo[] {
  const out: Tramo[] = []
  for (let anio = desde; anio <= hasta; anio++) {
    for (const mediaType of ['movie', 'tv'] as const) {
      out.push({ mediaType, desde: `${anio}-01-01`, hasta: `${anio}-12-31` })
    }
  }
  return out
}

/** Parte un tramo por la mitad, en días. */
function partir(t: Tramo): [Tramo, Tramo] {
  const a = Date.parse(t.desde)
  const b = Date.parse(t.hasta)
  const medio = new Date(a + Math.floor((b - a) / 2 / 864e5) * 864e5)
  const dia = (d: Date) => d.toISOString().slice(0, 10)
  const siguiente = new Date(medio.getTime() + 864e5)
  return [
    { ...t, hasta: dia(medio) },
    { ...t, desde: dia(siguiente) },
  ]
}

// ── TMDB ──────────────────────────────────────────────────────────────────

interface FilaTmdb {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  poster_path: string | null
  release_date?: string
  first_air_date?: string
  vote_count?: number
  vote_average?: number
  popularity?: number
  overview?: string
}

interface PaginaTmdb {
  page: number
  total_pages: number
  total_results: number
  results: FilaTmdb[]
}

const pausa = (ms: number) => new Promise(r => setTimeout(r, ms))

async function pedir(url: string, opciones: Opciones): Promise<PaginaTmdb> {
  for (let intento = 1; ; intento++) {
    if (opciones.limite && Date.now() > opciones.limite) throw new SinTiempo()
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) })
      if (res.ok) return await res.json() as PaginaTmdb
      if (res.status !== 429 && res.status < 500) throw new Error(`TMDB ${res.status}`)
      if (intento >= REINTENTOS) throw new Error(`TMDB ${res.status} después de ${REINTENTOS} intentos`)
      const espera = Number(res.headers.get('retry-after')) || intento
      await pausa(espera * 1000)
    } catch (e) {
      if (e instanceof SinTiempo || (e instanceof Error && e.message.startsWith('TMDB 4'))) throw e
      if (intento >= REINTENTOS) throw e
      await pausa(intento * 1000)
    }
  }
}

function urlDiscover(t: Tramo, idioma: string, pagina: number, apiKey: string): string {
  const campoFecha = t.mediaType === 'movie' ? 'primary_release_date' : 'first_air_date'
  const p = new URLSearchParams({
    api_key: apiKey,
    language: idioma,
    include_adult: 'false',
    sort_by: 'vote_count.desc',
    'vote_count.gte': String(VOTOS_MINIMOS[t.mediaType]),
    [`${campoFecha}.gte`]: t.desde,
    [`${campoFecha}.lte`]: t.hasta,
    page: String(pagina),
  })
  return `https://api.themoviedb.org/3/discover/${t.mediaType}?${p}`
}

/** Corre `tareas` de a `tope` a la vez. */
async function conTope<T>(tareas: (() => Promise<T>)[], tope: number): Promise<T[]> {
  const out = new Array<T>(tareas.length)
  let siguiente = 0
  async function trabajador() {
    while (siguiente < tareas.length) {
      const i = siguiente++
      out[i] = await tareas[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(tope, tareas.length) }, trabajador))
  return out
}

/** Todas las páginas de un tramo en un idioma. `null` si el tramo pasa de 500 páginas. */
async function filasDelTramo(t: Tramo, idioma: string, opciones: Opciones): Promise<FilaTmdb[] | null> {
  const primera = await pedir(urlDiscover(t, idioma, 1, opciones.apiKey), opciones)
  if (primera.total_pages > 500) return null
  const resto = await conTope(
    Array.from({ length: primera.total_pages - 1 }, (_, i) =>
      () => pedir(urlDiscover(t, idioma, i + 2, opciones.apiKey), opciones)),
    CONCURRENCIA,
  )
  return [primera, ...resto].flatMap(p => p.results)
}

// ── Armado de filas ───────────────────────────────────────────────────────

export interface FilaIndice {
  media_type: MediaType
  tmdb_id: number
  title: string
  original_title: string | null
  poster_path: string | null
  release_date: string | null
  vote_count: number
  vote_average: number | null
  popularity: number | null
  overview: string | null
  names: string[]
}

function armarFilas(mediaType: MediaType, porIdioma: FilaTmdb[][]): FilaIndice[] {
  const [es, ...otros] = porIdioma
  const titulosPorId = new Map<number, string[]>()
  for (const filas of otros) {
    for (const f of filas) {
      const titulo = f.title ?? f.name
      if (titulo) titulosPorId.set(f.id, [...(titulosPorId.get(f.id) ?? []), titulo])
    }
  }

  const out: FilaIndice[] = []
  const vistos = new Set<number>()
  for (const f of es) {
    const title = f.title ?? f.name
    if (!title || vistos.has(f.id)) continue
    vistos.add(f.id)
    const original = f.original_title ?? f.original_name ?? null
    const names = [...new Set(
      [title, original, ...(titulosPorId.get(f.id) ?? [])]
        .filter((n): n is string => !!n)
        .map(normalizar)
        .filter(Boolean),
    )]
    const fecha = f.release_date || f.first_air_date || ''
    out.push({
      media_type: mediaType,
      tmdb_id: f.id,
      title,
      original_title: original,
      poster_path: f.poster_path ?? null,
      release_date: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
      vote_count: f.vote_count ?? 0,
      vote_average: f.vote_average ?? null,
      popularity: f.popularity ?? null,
      overview: f.overview ? f.overview.slice(0, LARGO_SINOPSIS) : null,
      names,
    })
  }
  return out
}

// ── Sincronización ────────────────────────────────────────────────────────

export interface ResultadoTramo {
  tramo: Tramo
  titulos: number
  borrados: number
  pedidos: number
}

/**
 * Trae un tramo de TMDB en los tres idiomas y lo guarda. Si el tramo es muy
 * grande para `discover`, lo parte y devuelve un resultado por parte.
 */
export async function sincronizarTramo(
  db: SupabaseClient,
  tramo: Tramo,
  opciones: Opciones,
): Promise<ResultadoTramo[]> {
  const inicio = new Date()

  // Los tres idiomas a la vez: 3 × CONCURRENCIA pedidos en vuelo, por debajo
  // de lo que aguanta TMDB. En serie, el catálogo entero tardaba el triple.
  const resultados = await Promise.all(IDIOMAS.map(idioma => filasDelTramo(tramo, idioma, opciones)))
  if (resultados.some(r => r === null)) {
    if (tramo.desde === tramo.hasta) throw new Error(`un solo día con más de 10.000 títulos: ${tramo.desde}`)
    const [a, b] = partir(tramo)
    return [
      ...await sincronizarTramo(db, a, opciones),
      ...await sincronizarTramo(db, b, opciones),
    ]
  }
  const porIdioma = resultados as FilaTmdb[][]
  const pedidos = porIdioma.reduce((n, filas) => n + Math.max(1, Math.ceil(filas.length / 20)), 0)

  const filas = armarFilas(tramo.mediaType, porIdioma)
  for (let i = 0; i < filas.length; i += LOTE_UPSERT) {
    const { error } = await db.rpc('upsert_search_titles', { filas: filas.slice(i, i + LOTE_UPSERT) })
    if (error) throw new Error(`upsert_search_titles: ${error.message}`)
  }

  const { data: borrados, error } = await db.rpc('prune_search_titles', {
    p_media_type: tramo.mediaType,
    p_desde: tramo.desde,
    p_hasta: tramo.hasta,
    p_antes: inicio.toISOString(),
  })
  if (error) throw new Error(`prune_search_titles: ${error.message}`)

  return [{ tramo, titulos: filas.length, borrados: borrados ?? 0, pedidos }]
}
