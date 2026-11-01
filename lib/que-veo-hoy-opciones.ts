/**
 * Lo de "¿Qué veo hoy?" que necesita también el navegador. Aparte de
 * `lib/que-veo-hoy.ts`, que es sólo del servidor.
 */

/** Película, serie o "Me da igual". Sin esto en el pedido (la app de antes), "igual". */
export type Tipo = 'pelicula' | 'serie' | 'igual'

/**
 * Cuánto tiempo tiene. Se mira la duración real: en películas, la película; en
 * series, el episodio.
 *
 *              película      episodio de serie
 *   corta      < 90 min      hasta 35 min (comedias y demás de 20-30)
 *   hasta2     hasta 2 h     hasta 1 h
 *   larga      más de 2 h    (no hay: es sólo de películas)
 *   sinApuro   cualquiera    cualquiera
 *
 * "capitulo" lo manda sólo la app de antes de la pregunta de película o serie.
 */
export type Duracion = 'corta' | 'hasta2' | 'larga' | 'capitulo' | 'sinApuro'

export const TIPOS: Tipo[] = ['pelicula', 'serie', 'igual']

/** Las duraciones que se ofrecen con cada tipo. */
export const DURACIONES_POR_TIPO: Record<Tipo, Duracion[]> = {
  pelicula: ['corta', 'hasta2', 'larga', 'sinApuro'],
  serie: ['corta', 'hasta2', 'sinApuro'],
  igual: ['corta', 'hasta2', 'larga', 'sinApuro'],
}
