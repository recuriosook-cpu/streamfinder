import { getAllGuides, type GuideFrontmatter } from '@/lib/guides'

/**
 * Las guías que nombran un título, para la ficha.
 *
 * Las guías son 13 archivos MDX: se leen una vez por instancia y queda el
 * índice en memoria (cambian sólo con un deploy, así que no hace falta más).
 * `next.config.ts` incluye `content/guides` en el paquete de las fichas, que
 * son dinámicas y leen el disco en runtime.
 */

let indice: { guias: GuideFrontmatter[]; porTitulo: Map<string, GuideFrontmatter[]> } | null = null

function armarIndice() {
  if (indice) return indice
  const guias = getAllGuides()
  const porTitulo = new Map<string, GuideFrontmatter[]>()
  for (const g of guias) {
    for (const m of g.movies ?? []) {
      const clave = `${m.mediaType}:${m.tmdbId}`
      const lista = porTitulo.get(clave) ?? []
      if (!lista.includes(g)) lista.push(g)
      porTitulo.set(clave, lista)
    }
  }
  indice = { guias, porTitulo }
  return indice
}

/**
 * `relacionadas`: las guías que incluyen el título. Si no hay ninguna, `otras`
 * trae las más recientes, para que la ficha igual lleve a contenido propio.
 * Nunca tira: sin guías legibles, las dos listas vienen vacías.
 */
export function guiasDeTitulo(
  tipo: 'movie' | 'tv',
  id: number,
  cuantas = 3,
): { relacionadas: GuideFrontmatter[]; otras: GuideFrontmatter[] } {
  try {
    const { guias, porTitulo } = armarIndice()
    const relacionadas = (porTitulo.get(`${tipo}:${id}`) ?? []).slice(0, cuantas)
    return { relacionadas, otras: relacionadas.length ? [] : guias.slice(0, cuantas) }
  } catch {
    return { relacionadas: [], otras: [] }
  }
}
