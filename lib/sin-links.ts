/**
 * Sin links en reseñas, comentarios, listas y bio (octubre de 2026).
 *
 * Había reseñas con links a sitios piratas y a subtítulos descargados, un
 * riesgo para AdMob, Google Play y App Store. La regla de verdad está en la
 * base: los triggers de `supabase-sin-links-2026-10.sql` rechazan cualquier
 * texto con links, venga de la web, de la app (también las versiones viejas)
 * o de donde sea. Esto es lo mismo del lado de la web, para avisar antes de
 * mandar nada.
 *
 * La regla tiene que ser la misma que `glynbox_tiene_link` en la base y que
 * `src/lib/sinLinks.ts` de la app:
 *   · http:// o https://, www., o una etiqueta <a>.
 *   · Un dominio con una terminación de las que usan los sitios (.com, .ru,
 *     .to, .app…), aunque no tenga http.
 *   · Un dominio de país o de acortador (.es, .ar, el .be de youtu.be…)
 *     seguido de "/". Sin la barra no cuenta: "bueno.es una joya" es una
 *     errata y no un link.
 */

const TLD_SITIO =
  'com|net|org|ru|io|xyz|info|biz|site|online|top|club|live|stream|tv|to|cc|ly|gg|su|ws|link|app|watch|movie|movies|film|cam|vip|icu|lol|fun|pw|sx|nu|li|vc|ink|space|store|website|click|download|cyou|lat|bio|page|dev|ai'
const TLD_PAIS =
  'es|me|ar|mx|co|cl|uy|pe|br|la|de|fr|it|uk|us|eu|ve|ec|bo|py|is|in|ac|tk|ml|ga|cf|gq|cx|nz|au|ca|ch|jp|be|gl|gd|im|ms|so|sh|fm|am'

const LINK = new RegExp(
  `https?://|www\\.|<\\s*a[\\s>]|(^|[^a-z0-9.@_-])[a-z0-9][a-z0-9-]*(\\.[a-z0-9-]+)*\\.((${TLD_SITIO})([^a-z0-9-]|$)|(${TLD_PAIS})/)`,
  'i'
)

/** Los mismos textos que devuelve la base. */
export const MENSAJE_SIN_LINKS = {
  resena: 'No se permiten links en las reseñas',
  comentario: 'No se permiten links en los comentarios',
  lista: 'No se permiten links en las listas',
  bio: 'No se permiten links en la bio',
} as const

export type DondeSinLinks = keyof typeof MENSAJE_SIN_LINKS

export function tieneLink(texto: string | null | undefined): boolean {
  return typeof texto === 'string' && LINK.test(texto)
}

/** El aviso para mostrar si alguno de los textos tiene un link, o `null`. */
export function avisoDeLinks(donde: DondeSinLinks, ...textos: (string | null | undefined)[]): string | null {
  return textos.some(tieneLink) ? MENSAJE_SIN_LINKS[donde] : null
}

/** ¿Lo rechazó el trigger de la base? (código 23514 con la pista `sin_links`) */
export function esRechazoPorLinks(error: { message?: string; code?: string; hint?: string | null } | null | undefined): boolean {
  if (!error) return false
  return error.hint === 'sin_links' || (error.code === '23514' && /links/i.test(error.message ?? ''))
}
