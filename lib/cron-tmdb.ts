// SERVER-ONLY — lo usan los crons y el feed de Comunidad (`lib/feed-extras.ts`).

/**
 * Lo que comparten los avisos del cron diario (`lib/avisos-famosos.ts` y
 * `lib/disponibilidad.ts`): pedirle a TMDB sin pasar por el caché de datos de
 * Vercel, ir de a varios pedidos a la vez sin pasarse, y el día de Argentina.
 *
 * `cache: 'no-store'` no es un detalle: el caché de datos de Vercel se cobra
 * por escritura, y fue lo que pausó el proyecto en septiembre de 2026 (ver el
 * encabezado de `app/movie/[id]/page.tsx`). Un cron que lee cientos de fichas
 * por día no tiene nada que guardar ahí.
 */

const TMDB = 'https://api.themoviedb.org/3'

/**
 * Un GET a TMDB. `null` si falla o no hay clave: quien llama saltea ese dato.
 *
 * Sin `revalidate` no pasa por el caché de datos (lo de arriba). Con
 * `revalidate`, sí: es para quien pide siempre las mismas pocas URLs desde una
 * ruta que se llama mucho (el feed de Comunidad), donde cada escritura se lee
 * cientos de veces. Nunca para un cron que recorre ids distintos. Next sólo
 * guarda las respuestas 200: un 429 o un 404 no queda cacheado.
 */
export async function tmdbJson<T>(
  ruta: string,
  params: Record<string, string> = {},
  opciones: { revalidate?: number } = {},
): Promise<T | null> {
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!key) return null
  const qs = new URLSearchParams({ api_key: key, ...params })
  const cache: RequestInit = opciones.revalidate
    ? { next: { revalidate: opciones.revalidate } }
    : { cache: 'no-store' }
  for (let intento = 0; intento < 2; intento++) {
    try {
      const res = await fetch(`${TMDB}${ruta}?${qs}`, cache)
      if (res.status === 429) {
        // Límite de TMDB: se espera un poco y se reintenta una vez.
        await new Promise(r => setTimeout(r, 1500))
        continue
      }
      return res.ok ? ((await res.json()) as T) : null
    } catch {
      return null
    }
  }
  return null
}

/** `fn` sobre cada item, de a `cuantos` a la vez, en el orden original. */
export async function enParalelo<T, R>(items: T[], cuantos: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(items.length)
  let siguiente = 0
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++
      salida[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(cuantos, items.length) }, trabajador))
  return salida
}

/** Argentina no tiene horario de verano: siempre UTC-3. */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000

/** `YYYY-MM-DD` en Argentina, hoy o `dias` atrás (negativo = adelante). */
export function diaArgentina(dias = 0, ahora = Date.now()): string {
  return new Date(ahora - AR_OFFSET_MS - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
