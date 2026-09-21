import { getPopularMovies, getPopularTV } from '@/lib/tmdb'

/**
 * Los posters que alimentan el mosaico de `/descargar`.
 *
 * Vive acá y no en `lib/tmdb.ts` porque no es una capacidad de TMDB sino una
 * decisión de esta pantalla: cuántos posters, de dónde salen y en qué orden.
 * `lib/tmdb.ts` sigue siendo el que sabe hablar con la API.
 *
 * Nada de esto llega al bundle del navegador. La página lo pide en el
 * servidor y al cliente le baja un `string[]` con las rutas ya elegidas.
 */

/**
 * Cuántos posters distintos se traen.
 *
 * 24 es lo que llenan tres filas de ocho. No es una cifra libre: cada poster es
 * una imagen más que baja el visitante, y esta es la pantalla a la que llega
 * gente desde un anuncio, muchas veces con datos móviles. En `w185` son unos
 * 15 KB cada una, así que el mosaico entero pesa alrededor de 350 KB — bastante
 * para decoración, y el techo de lo que vale la pena gastar en ella.
 *
 * Las tiras repiten la lista dos veces para poder girar sin corte, pero eso no
 * agrega descargas: son las mismas URLs y el navegador las pide una sola vez.
 */
export const POSTERS_MOSAICO = 24

/**
 * Seis horas en el Data Cache.
 *
 * "Lo más popular del momento" se mueve en días, no en minutos, y acá se usa
 * como textura: nadie va a notar que a las tres de la tarde figura la misma
 * película que a las nueve de la mañana. Lo que sí se nota es la espera cuando
 * el cache está frío, porque la landing no responde hasta que TMDB contesta.
 * Seis horas hacen que eso pase cuatro veces por día y no una por hora.
 */
const CACHE_SEGUNDOS = 6 * 60 * 60

/** Lo único que nos importa de cada resultado de TMDB. */
type ResultadoTmdb = { poster_path?: string | null }

/**
 * Las rutas de poster de una respuesta de TMDB, sin las que vienen vacías.
 *
 * Un título sin `poster_path` en el mosaico sería el placeholder gris de
 * `getPosterUrl`, que es justo lo que no queremos ver acá.
 */
function rutasDePosters(respuesta: unknown): string[] {
  const resultados = (respuesta as { results?: ResultadoTmdb[] } | null)?.results
  if (!Array.isArray(resultados)) return []

  return resultados
    .map((r) => r.poster_path)
    .filter((ruta): ruta is string => typeof ruta === 'string' && ruta.length > 0)
}

/**
 * Las rutas de poster para el mosaico, pelis y series mezcladas.
 *
 * Los dos pedidos van en paralelo y cada uno se atrapa por separado: si TMDB
 * falla para películas pero responde para series, el mosaico se arma igual con
 * la mitad. Si fallan los dos devuelve una lista vacía y la pantalla se dibuja
 * sin mosaico, como antes de todo esto. Una landing de campaña no se puede caer
 * porque falló la decoración.
 *
 * El intercalado —una peli, una serie, una peli— y no una lista pegada a la
 * otra: concatenadas, las tres filas quedarían con las 24 primeras posiciones
 * de películas y las series no aparecerían nunca. Intercaladas, cada fila
 * muestra de las dos.
 */
export async function obtenerPostersPopulares(): Promise<string[]> {
  const [pelis, series] = await Promise.all([
    getPopularMovies(1, { revalidate: CACHE_SEGUNDOS }).catch(() => null),
    getPopularTV(1, { revalidate: CACHE_SEGUNDOS }).catch(() => null),
  ])

  const dePelis = rutasDePosters(pelis)
  const deSeries = rutasDePosters(series)

  const intercaladas: string[] = []
  for (let i = 0; i < Math.max(dePelis.length, deSeries.length); i++) {
    if (dePelis[i]) intercaladas.push(dePelis[i])
    if (deSeries[i]) intercaladas.push(deSeries[i])
  }

  // El `Set` es barato y evita que un mismo poster aparezca dos veces en la
  // misma fila, que se lee como un error aunque no lo sea.
  return Array.from(new Set(intercaladas)).slice(0, POSTERS_MOSAICO)
}
