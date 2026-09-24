import { createServerClient } from '@/lib/supabase-server'
import {
  normalizar,
  combinarResultados,
  type TipoBusqueda,
  type FilaIndice,
  type PaginaTmdb,
  type ResultadoBusqueda,
} from '@/lib/search-ranking'

export type { TipoBusqueda, FilaBusqueda, ResultadoBusqueda } from '@/lib/search-ranking'

/**
 * El buscador de películas, series y personas: lo usan `/api/search` (las
 * sugerencias del Navbar y la app) y la página `/search`.
 *
 * Busca en dos lados a la vez y junta:
 *
 *   - TMDB, como antes. Trae la cola larga, pero no tolera errores de tipeo y
 *     ordena mal (ver `supabase-search-index.sql`).
 *   - El índice propio (`search_titles_fuzzy`), con los ~86.000 títulos que se
 *     buscan de verdad, todos sus nombres, y búsqueda aproximada.
 *
 * Cómo se juntan y se ordenan está en `lib/search-ranking.ts`.
 *
 * Si el índice falla o todavía no existe, se sigue con TMDB solo: el buscador
 * queda como estaba, no se rompe.
 *
 * La respuesta tiene la forma de las filas de `/search/multi` de TMDB (con
 * `media_type`, `title`/`name`, `release_date`/`first_air_date`...), así la web
 * y la app las leen como antes.
 */

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

/** Con menos letras el índice trae medio catálogo: se busca sólo en TMDB. */
const LARGO_MINIMO_INDICE = 3

/** Candidatos que se le piden al índice. */
const CANDIDATOS_INDICE = 40

async function buscarEnTmdb(q: string, tipo: TipoBusqueda, page: number): Promise<PaginaTmdb> {
  const vacio = { page, total_pages: 0, total_results: 0, results: [] }
  const params = new URLSearchParams({
    api_key: TMDB_KEY ?? '',
    language: 'es-AR',
    include_adult: 'false',
    query: q,
    page: String(page),
  })
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/${tipo === 'all' ? 'multi' : tipo}?${params}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return vacio
    const data = await res.json() as PaginaTmdb
    // Los endpoints de un solo tipo no mandan `media_type`.
    if (tipo !== 'all') data.results = data.results.map(r => ({ ...r, media_type: tipo }))
    return data
  } catch {
    return vacio
  }
}

async function buscarEnIndice(qn: string, tipo: TipoBusqueda): Promise<FilaIndice[]> {
  if (tipo === 'person' || qn.length < LARGO_MINIMO_INDICE) return []
  try {
    const { data, error } = await createServerClient()
      .rpc('search_titles_fuzzy', { q: qn, max_results: CANDIDATOS_INDICE })
    if (error) {
      console.error('[search] índice:', error.message)
      return []
    }
    const filas = data as FilaIndice[]
    return tipo === 'all' ? filas : filas.filter(f => f.media_type === tipo)
  } catch (e) {
    console.error('[search] índice:', e)
    return []
  }
}

export async function buscar(q: string, tipo: TipoBusqueda = 'all', page = 1): Promise<ResultadoBusqueda> {
  const texto = q.trim()
  const qn = normalizar(texto)
  if (!qn) return { page, total_pages: 0, total_results: 0, results: [], correction: null }

  const [tmdb, indice] = await Promise.all([buscarEnTmdb(texto, tipo, page), buscarEnIndice(qn, tipo)])
  return combinarResultados(qn, page, tmdb, indice)
}
