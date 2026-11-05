import { notFound, permanentRedirect } from 'next/navigation'
import { TMDBError } from '@/lib/tmdb'

/**
 * El id numérico de una ficha (`/movie/[id]`, `/tv/[id]`, `/actor/[id]`…).
 *
 * - Si no es un número (`/movie/abc`, `/movie/27205-origen`): 404.
 * - Con ceros adelante (`/movie/027205`): redirección permanente a la URL sin
 *   ceros, para que no quede como otra página con el mismo contenido.
 *
 * Antes estas URLs respondían 200 con la portada o "no existe", y Google las
 * contaba como duplicadas. El 404 y la redirección con su status de verdad
 * los hacen los `redirects`/`rewrites` de `next.config.ts`, antes de llegar
 * acá: el `loading.tsx` raíz hace que la página ya haya mandado un 200 cuando
 * esto corre. Esto queda de respaldo (navegación dentro de la app) y, con el
 * 200 ya mandado, Next agrega `noindex`.
 *
 * Lo mismo vale para `oNoExiste`: un id numérico que TMDB no tiene sale con
 * 200 + `<meta name="robots" content="noindex">`, que Google respeta.
 */
export function idDeFicha(raw: string, ruta: (id: number) => string): number {
  if (!/^\d+$/.test(raw)) notFound()
  const id = Number(raw)
  if (id <= 0 || !Number.isSafeInteger(id)) notFound()
  if (String(id) !== raw) permanentRedirect(ruta(id))
  return id
}

/**
 * Un pedido a TMDB que da 404 si el título no existe allá. Cualquier otro
 * error (TMDB caído, límite de pedidos) se vuelve a tirar: es mejor un 500,
 * que Google reintenta, que un 404 que la CDN guarda un día y hace que Google
 * saque la ficha.
 */
export async function oNoExiste<T>(pedido: Promise<T>): Promise<T> {
  try {
    return await pedido
  } catch (e) {
    if (e instanceof TMDBError && e.status === 404) notFound()
    throw e
  }
}
