/**
 * Cómo se comparan y se ordenan los resultados del buscador. Funciones puras,
 * sin red ni base: las usan `lib/search.ts` (al buscar) y
 * `lib/search-index-sync.ts` (al llenar el índice), y como el sync corre
 * también desde un script con Node, acá va TypeScript "borrable" nomás.
 *
 * ── El orden ──────────────────────────────────────────────────────────────
 *
 * Como IMDb: cuánto se parece el texto, y entre parecidos, lo más conocido.
 *
 *   puntaje = texto³ × log10(10 + votos + 20 × popularidad)
 *
 * El texto va al cubo para que una coincidencia exacta le gane a una parcial
 * aunque la parcial tenga bastantes más votos: "Forgotten" tiene que traer
 * primero a "Olvidado" (título en inglés exacto, 1.399 votos) y no a "The
 * Forgotten" (contiene la palabra, 1.288 votos). Los votos sí deciden entre
 * parecidos: "titanc" se parece un poco más a "Titans" que a "Titanic", y
 * Titanic tiene veinte veces más votos.
 *
 * La popularidad está para los estrenos, que todavía no juntaron votos pero sí
 * se buscan; por 20 porque la popularidad de TMDB anda entre 1 y ~500 y los
 * votos entre 0 y ~40.000.
 */

// ── Normalización ─────────────────────────────────────────────────────────

/**
 * Minúsculas, sin tildes, y todo lo que no sea letra o número pasa a espacio.
 * Se aplica igual a los nombres que se guardan y a lo que se busca: si las dos
 * normalizaciones no fueran la misma, "dia" no encontraría "Día".
 *
 * `\p{L}` y no `[a-z]`: los títulos originales en coreano o japonés se
 * conservan (alguien puede pegarlos), sólo se sacan los signos.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// ── Trigramas (mismo criterio que pg_trgm) ────────────────────────────────

function trigramas(texto: string): Set<string> {
  const out = new Set<string>()
  for (const palabra of texto.split(' ')) {
    if (!palabra) continue
    const p = `  ${palabra} `
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3))
  }
  return out
}

/** `similarity()` de pg_trgm: trigramas en común sobre trigramas totales. */
export function similitud(a: string, b: string): number {
  const A = trigramas(a)
  const B = trigramas(b)
  if (A.size === 0 || B.size === 0) return 0
  let comunes = 0
  for (const t of A) if (B.has(t)) comunes++
  return comunes / (A.size + B.size - comunes)
}

/**
 * Parecido a `word_similarity(q, texto)` de pg_trgm: qué parte de `q` aparece
 * en el mejor tramo de palabras seguidas de `texto`. Es 1 cuando `q` está
 * entera, como palabras, dentro de `texto`.
 */
export function similitudDePalabras(q: string, texto: string): number {
  const Q = trigramas(q)
  if (Q.size === 0) return 0
  const palabras = texto.split(' ').filter(Boolean)
  let mejor = 0
  for (let i = 0; i < palabras.length; i++) {
    for (let j = i + 1; j <= palabras.length; j++) {
      const T = trigramas(palabras.slice(i, j).join(' '))
      let comunes = 0
      for (const t of Q) if (T.has(t)) comunes++
      mejor = Math.max(mejor, comunes / Q.size)
      if (mejor === 1) return 1
    }
  }
  return mejor
}

/**
 * Parecido por distancia de edición (Damerau-Levenshtein, versión "optimal
 * string alignment"): 1 − ediciones / largo del más largo. Complementa a los
 * trigramas, que con una letra cambiada de lugar pierden mucho: "moebuis" y
 * "moebius" comparten pocos trigramas pero están a una sola transposición.
 */
export function similitudDeEdicion(a: string, b: string): number {
  const largo = Math.max(a.length, b.length)
  if (largo === 0) return 1
  // Si la diferencia de largo ya supera la mitad, no hace falta calcular.
  if (Math.abs(a.length - b.length) > largo / 2) return 0

  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return 1 - d[a.length][b.length] / largo
}

// ── Puntaje ───────────────────────────────────────────────────────────────

/** Por encima de esto la coincidencia es "de verdad" y no una corrección. */
export const TEXTO_SIN_CORRECCION = 0.85

/** Por debajo de esto un candidato del índice es ruido y no se muestra. */
export const TEXTO_MINIMO = 0.4

/**
 * Cuánto coincide la búsqueda `q` (normalizada) con el mejor de `nombres`
 * (normalizados), de 0 a 1:
 *
 *   1     exacto                             "forgotten" = "forgotten"
 *   0.92  el nombre empieza con la búsqueda  "el padrino" → "el padrino ii"
 *   0.85  la búsqueda está entera adentro    "forgotten" → "the forgotten"
 *   ~0.7  el nombre está entero en la búsqueda, con palabras de más
 *                                            "moebius argentina" → "moebius"
 *   <0.8  parecido con errores de tipeo      "inseption" → "inception",
 *                                            "moebuis" → "moebius"
 */
export function puntajeTexto(q: string, nombres: string[]): number {
  let mejor = 0
  for (const nombre of nombres) {
    if (!nombre) continue
    if (nombre === q) return 1

    let s: number
    if (q.length >= 3 && nombre.startsWith(q)) {
      s = 0.92
    } else {
      const adentro = similitudDePalabras(q, nombre)
      if (adentro === 1) {
        s = TEXTO_SIN_CORRECCION
      } else {
        // Trigramas: la mitad es cuánto se parece a alguna parte del nombre,
        // la otra mitad cuánto al nombre entero. Sólo con lo primero, "movius"
        // empata con cualquier título que diga "movie" y "Scary Movie 2" le
        // gana a "Moebius" por votos.
        const entero = similitud(q, nombre)
        const trigramas = (Math.max(entero, adentro) + entero) / 2
        // Edición: para los errores de tipeo en el nombre entero ("moebuis").
        s = 0.8 * Math.max(trigramas, similitudDeEdicion(q, nombre))
        // Al revés: la búsqueda tiene palabras de más ("moebius argentina").
        // Pesa según cuánto de la búsqueda cubre el nombre, y sólo con nombres
        // de 4 letras o más: si no, "Up" o "It" aparecerían en todo.
        if (nombre.length >= 4 && similitudDePalabras(nombre, q) === 1) {
          s = Math.max(s, 0.55 + 0.3 * (nombre.length / q.length))
        }
      }
    }
    mejor = Math.max(mejor, s)
  }
  return mejor
}

/** Cuán conocido es un título. Ver el encabezado. */
export function pesoTitulo(votos: number, popularidad: number): number {
  return Math.log10(10 + Math.max(0, votos) + 20 * Math.max(0, popularidad))
}

/**
 * Cuán conocida es una persona. No tienen votos, sólo popularidad; el factor
 * está elegido para que alguien famoso (popularidad ~40) pese como una
 * película con unos miles de votos, y así "tom hanks" traiga a Tom Hanks antes
 * que cualquier título que se le parezca un poco.
 */
export function pesoPersona(popularidad: number): number {
  return Math.log10(10 + 100 * Math.max(0, popularidad))
}

export function puntaje(texto: number, peso: number): number {
  return texto ** 3 * peso
}

// ── Juntar TMDB y el índice ───────────────────────────────────────────────

export type TipoBusqueda = 'all' | 'movie' | 'tv' | 'person'

/** Una fila de resultado, con la forma de `/search/multi` de TMDB. */
export interface FilaBusqueda {
  id: number
  media_type: 'movie' | 'tv' | 'person'
  title?: string
  original_title?: string | null
  release_date?: string
  name?: string
  original_name?: string | null
  first_air_date?: string
  poster_path?: string | null
  vote_average?: number
  vote_count?: number
  popularity?: number
  overview?: string
  profile_path?: string | null
  known_for_department?: string | null
  known_for?: { title?: string; name?: string }[]
}

/** Lo que devuelve `search_titles_fuzzy`. */
export interface FilaIndice {
  media_type: 'movie' | 'tv'
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

export interface PaginaTmdb {
  page: number
  total_pages: number
  total_results: number
  results: FilaBusqueda[]
}

export interface ResultadoBusqueda {
  page: number
  total_pages: number
  total_results: number
  results: FilaBusqueda[]
  /**
   * Cuando nada coincide bien y lo que se muestra es una corrección, el título
   * corregido: "Mostrando resultados para *Titanic*". `null` si no hizo falta.
   */
  correction: string | null
}

/**
 * Piso del parecido para lo que trae TMDB. TMDB lo encontró por algún título,
 * a veces uno que acá no se ve (un título alternativo), y sin piso quedaría
 * por debajo de candidatos del índice que no tienen nada que ver.
 */
const PISO_TMDB = 0.5

function desdeIndice(f: FilaIndice): FilaBusqueda {
  const comun = {
    id: f.tmdb_id,
    media_type: f.media_type,
    poster_path: f.poster_path,
    vote_average: f.vote_average ?? 0,
    vote_count: f.vote_count,
    popularity: f.popularity ?? 0,
    overview: f.overview ?? '',
  }
  return f.media_type === 'movie'
    ? { ...comun, title: f.title, original_title: f.original_title, release_date: f.release_date ?? '' }
    : { ...comun, name: f.title, original_name: f.original_title, first_air_date: f.release_date ?? '' }
}

function nombresDe(f: FilaBusqueda): string[] {
  return [f.title, f.name, f.original_title, f.original_name]
    .filter((n): n is string => !!n)
    .map(normalizar)
}

/**
 * Junta una página de TMDB con los candidatos del índice y los ordena.
 *
 * El índice suma en la primera página. En las siguientes sólo sirve para
 * sacar lo que ya salió por el índice en la primera, que si no se repetiría.
 */
export function combinarResultados(
  qn: string,
  page: number,
  tmdb: PaginaTmdb,
  indice: FilaIndice[],
): ResultadoBusqueda {
  const nombresIndice = new Map(indice.map(f => [`${f.media_type}:${f.tmdb_id}`, f.names]))
  const candidatos = new Map<string, { fila: FilaBusqueda; texto: number; puntaje: number }>()

  for (const fila of tmdb.results) {
    if (fila.media_type === 'person') {
      const t = Math.max(PISO_TMDB, puntajeTexto(qn, nombresDe(fila)))
      candidatos.set(`person:${fila.id}`, { fila, texto: t, puntaje: puntaje(t, pesoPersona(fila.popularity ?? 0)) })
      continue
    }
    if (fila.media_type !== 'movie' && fila.media_type !== 'tv') continue
    const clave = `${fila.media_type}:${fila.id}`
    const t = Math.max(PISO_TMDB, puntajeTexto(qn, [...nombresDe(fila), ...(nombresIndice.get(clave) ?? [])]))
    candidatos.set(clave, { fila, texto: t, puntaje: puntaje(t, pesoTitulo(fila.vote_count ?? 0, fila.popularity ?? 0)) })
  }

  let soloIndice = 0
  for (const f of indice) {
    const clave = `${f.media_type}:${f.tmdb_id}`
    if (page > 1) {
      candidatos.delete(clave)
      continue
    }
    if (candidatos.has(clave)) continue
    const t = puntajeTexto(qn, f.names)
    if (t < TEXTO_MINIMO) continue
    soloIndice++
    candidatos.set(clave, { fila: desdeIndice(f), texto: t, puntaje: puntaje(t, pesoTitulo(f.vote_count, f.popularity ?? 0)) })
  }

  const ordenados = [...candidatos.values()].sort((a, b) => b.puntaje - a.puntaje)

  // Corrección sólo si nada coincide de verdad: si hay una coincidencia buena,
  // aunque no haya quedado primera, la búsqueda no tenía un error.
  const primero = ordenados[0]
  const correction = page === 1 && primero && !ordenados.some(c => c.texto >= TEXTO_SIN_CORRECCION)
    ? (primero.fila.title ?? primero.fila.name ?? null)
    : null

  return {
    page,
    total_pages: Math.max(ordenados.length > 0 ? 1 : 0, tmdb.total_pages),
    total_results: tmdb.total_results + soloIndice,
    results: ordenados.map(c => c.fila),
    correction,
  }
}
