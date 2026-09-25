/**
 * Temporadas de una serie: qué pestañas se muestran, en qué orden, y cuáles se
 * pueden reseñar. Funciones puras; los datos vienen de `/tv/{id}` de TMDB, que
 * ya trae el arreglo `seasons` en la misma llamada que usa la ficha.
 *
 * La app (glynbox-mobile, `src/lib/seasons.ts`) tiene las mismas reglas.
 */

/** Una temporada tal como la manda TMDB en `/tv/{id}`. */
export interface TmdbSeason {
  season_number: number
  name: string | null
  episode_count: number | null
  air_date: string | null
  poster_path: string | null
  overview: string | null
  vote_average: number | null
}

/**
 * Las temporadas para las pestañas: las normales en orden y "Especiales"
 * (temporada 0) al final. `null` si hay una sola, porque entonces las
 * pestañas no aportan nada: la serie y su temporada son lo mismo.
 */
export function temporadasParaPestanias(seasons: TmdbSeason[] | null | undefined): TmdbSeason[] | null {
  if (!seasons || seasons.length < 2) return null
  const normales = seasons.filter(s => s.season_number > 0).sort((a, b) => a.season_number - b.season_number)
  const especiales = seasons.filter(s => s.season_number === 0)
  return [...normales, ...especiales]
}

/** "T3", o "Especiales" para la temporada 0. */
export function etiquetaTemporada(s: Pick<TmdbSeason, 'season_number'>): string {
  return s.season_number === 0 ? 'Especiales' : `T${s.season_number}`
}

/** "Temporada 3" / "Especiales" / el nombre de TMDB si es otro ("Miniserie"). */
export function nombreTemporada(s: Pick<TmdbSeason, 'season_number' | 'name'>): string {
  if (s.season_number === 0) return 'Especiales'
  return s.name?.trim() || `Temporada ${s.season_number}`
}

/** Hoy como 'YYYY-MM-DD' en hora local, para comparar con `air_date`. */
function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Sin estrenar: sin fecha, o con fecha futura. Se muestra, pero no se puede
 * reseñar (acordado el 2026-09-24).
 */
export function sinEstrenar(s: Pick<TmdbSeason, 'air_date'>): boolean {
  return !s.air_date || s.air_date > hoyISO()
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/**
 * '2009-03-08' → '8 mar 2009'. Meses a mano, como en las notificaciones: cada
 * motor de Intl abrevia distinto y la app tiene que mostrar lo mismo.
 */
export function fechaCorta(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]} ${y}`
}

/** 48 → '48 min', 65 → '1 h 5 min'. */
export function duracion(minutos: number | null | undefined): string | null {
  if (!minutos || minutos <= 0) return null
  if (minutos < 60) return `${minutos} min`
  const h = Math.floor(minutos / 60), m = minutos % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** '2026-09-27' → '27 de septiembre de 2026'. */
export function fechaLarga(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}
