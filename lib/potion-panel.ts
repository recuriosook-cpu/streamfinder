/**
 * Los filtros de `/admin/potion`, compartidos por la página y la ruta.
 *
 * Viven acá y no en el `route.ts` por la regla de Next 16 que explica
 * `lib/metricas-ventanas.ts`: una ruta no puede exportar valores.
 *
 * La lista de rangos es cerrada porque el parámetro llega por querystring.
 */

export const RANGOS = ['hoy', '7d', 'todo'] as const

export type Rango = (typeof RANGOS)[number]

export const RANGO_POR_DEFECTO: Rango = '7d'

export const ETIQUETA_RANGO: Record<Rango, string> = {
  hoy: 'Hoy',
  '7d': 'Últimos 7 días',
  todo: 'Todo',
}

export function esRango(v: unknown): v is Rango {
  return (RANGOS as readonly unknown[]).includes(v)
}

/**
 * El lanzamiento del juego. Lo anterior es de los testers.
 *
 * Medianoche de Buenos Aires, que es la zona de los días del panel: con
 * medianoche UTC, lo jugado el 12 a la noche en Argentina entraría.
 */
export const LANZAMIENTO = '2026-10-13T00:00:00-03:00'

/** La zona de los días. Va a la función SQL tal cual. */
export const ZONA = 'America/Argentina/Buenos_Aires'
