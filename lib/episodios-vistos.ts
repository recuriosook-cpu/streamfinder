import type { TmdbSeason } from '@/lib/seasons'

/**
 * Capítulos vistos de series: tabla `episodios_vistos` de Supabase
 * (user_id, serie_id, temporada, capitulo, fecha; clave primaria con las
 * cuatro primeras; RLS: cada uno ve y toca sólo los suyos). La comparte la app
 * (glynbox-mobile, `src/lib/episodiosVistos.ts`): lo que se marca en una se ve
 * en la otra.
 *
 * Aparte de las notas de capítulos (`episode_ratings`): calificar no marca
 * como visto ni al revés.
 */

/** 'temporada-capitulo', la clave de un capítulo en el Set de vistos. */
export function claveCapitulo(temporada: number, capitulo: number): string {
  return `${temporada}-${capitulo}`
}

function separarClave(clave: string): { temporada: number; capitulo: number } {
  const [temporada, capitulo] = clave.split('-').map(Number)
  return { temporada, capitulo }
}

export interface Progreso {
  vistos: number
  total: number
  /** El último capítulo marcado, en orden (temporada y capítulo). */
  ultimo: { temporada: number; capitulo: number } | null
}

/**
 * Cuántos capítulos vio de cuántos, y por dónde va. Sin los especiales
 * (temporada 0), que no son parte del recorrido de la serie. Sólo cuentan los
 * capítulos que existen en TMDB: si una temporada se achica, no queda
 * "14 de 12". Igual que en la app.
 */
export function progresoSerie(
  temporadas: Pick<TmdbSeason, 'season_number' | 'episode_count'>[] | null | undefined,
  vistos: Set<string>,
): Progreso {
  const porTemporada = new Map<number, number>()
  for (const t of temporadas ?? []) {
    if (t.season_number > 0) porTemporada.set(t.season_number, t.episode_count ?? 0)
  }
  const total = [...porTemporada.values()].reduce((a, b) => a + b, 0)

  let cuenta = 0
  let ultimo: Progreso['ultimo'] = null
  for (const clave of vistos) {
    const c = separarClave(clave)
    const enLaTemporada = porTemporada.get(c.temporada)
    if (!enLaTemporada || c.capitulo < 1 || c.capitulo > enLaTemporada) continue
    cuenta++
    if (!ultimo || c.temporada > ultimo.temporada || (c.temporada === ultimo.temporada && c.capitulo > ultimo.capitulo)) {
      ultimo = c
    }
  }
  return { vistos: cuenta, total, ultimo }
}

/** "Viste 14 de 30 capítulos · Vas por T2 E4". */
export function textoProgreso(p: Progreso): string {
  return [
    `Viste ${p.vistos} de ${p.total} ${p.total === 1 ? 'capítulo' : 'capítulos'}`,
    p.ultimo ? `Vas por T${p.ultimo.temporada} E${p.ultimo.capitulo}` : null,
  ].filter(Boolean).join(' · ')
}
