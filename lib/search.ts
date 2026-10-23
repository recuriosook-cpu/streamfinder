import { createServerClient } from '@/lib/supabase-server'
import type { Idioma } from '@/lib/idioma'
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

/**
 * Con menos letras el índice trae medio catálogo: se busca sólo en TMDB. Con
 * tres ("har", "los", "man") tardaba más de un segundo, y un error de tipeo en
 * tres letras no es algo que valga la pena corregir.
 */
const LARGO_MINIMO_INDICE = 4

/** Candidatos que se le piden al índice. */
const CANDIDATOS_INDICE = 40

/**
 * Después de esto se sigue con TMDB solo. El límite de Supabase para la anon
 * key es de 3 segundos; esperarlo entero demoraba todas las sugerencias.
 */
const ESPERA_INDICE_MS = 1500

/**
 * Palabras que están en decenas de miles de títulos. Con ellas el índice de
 * trigramas tiene que revisar casi toda la tabla: "the", "las" o "the last"
 * se cortaban por tiempo (23/10, más de 50 veces desde la noche anterior).
 * Para el índice se sacan; TMDB las sigue recibiendo, y el orden final
 * (`lib/search-ranking.ts`) compara con la búsqueda entera.
 */
const PALABRAS_COMUNES = new Set([
  'the', 'a', 'an', 'of', 'and', 'in', 'on', 'to', 'for', 'with',
  'el', 'la', 'los', 'las', 'lo', 'un', 'una', 'unos', 'unas', 'de', 'del',
  'y', 'e', 'en', 'al', 'por', 'con', 'para', 'le', 'les', 'des', 'du', 'il',
])

/**
 * Lo que se le manda al índice: sin palabras comunes ni letras sueltas (la que
 * queda al final mientras se escribe, "the last o"). Vacío si no queda nada.
 */
export function consultaIndice(qn: string): string {
  return qn.split(' ').filter(p => p.length > 1 && !PALABRAS_COMUNES.has(p)).join(' ')
}

async function buscarEnTmdb(q: string, tipo: TipoBusqueda, page: number, idioma: Idioma): Promise<PaginaTmdb> {
  const vacio = { page, total_pages: 0, total_results: 0, results: [] }
  const params = new URLSearchParams({
    api_key: TMDB_KEY ?? '',
    language: idioma === 'en' ? 'en-US' : 'es-AR',
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
  const q = consultaIndice(qn)
  if (tipo === 'person' || q.length < LARGO_MINIMO_INDICE) return []
  try {
    const { data, error } = await createServerClient()
      .rpc('search_titles_fuzzy', { q, max_results: CANDIDATOS_INDICE })
      .abortSignal(AbortSignal.timeout(ESPERA_INDICE_MS))
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

/** `idioma`: en inglés para la app en inglés (desde la 1.0.16); la web es en castellano. */
export async function buscar(q: string, tipo: TipoBusqueda = 'all', page = 1, idioma: Idioma = 'es'): Promise<ResultadoBusqueda> {
  const texto = q.trim()
  const qn = normalizar(texto)
  if (!qn) return { page, total_pages: 0, total_results: 0, results: [], correction: null }

  const [tmdb, indice] = await Promise.all([buscarEnTmdb(texto, tipo, page, idioma), buscarEnIndice(qn, tipo)])
  return combinarResultados(qn, page, tmdb, indice, idioma)
}
