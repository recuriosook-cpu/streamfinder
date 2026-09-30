/**
 * URLs de las imágenes de compartir (las arma app/api/share, ver
 * lib/share-image.tsx). Va aparte y sin dependencias para que las páginas y los
 * componentes del navegador lo puedan importar sin arrastrar el generador.
 */

/**
 * Siempre www: los links de las vistas previas los bajan WhatsApp, X y
 * Facebook, y no todos siguen el 307 de glynbox.com a www.
 */
export const SHARE_ORIGIN = 'https://www.glynbox.com'

export type ReviewFormato = 'historia' | 'publicacion' | 'link'
export type MediaFormato = 'historia' | 'link'

/**
 * Ruta de la imagen de una reseña, relativa al sitio. `v` cambia cuando se
 * edita, para no servir la imagen vieja desde la caché.
 *
 * La web la usa tal cual: pide al mismo dominio (también en los deploys de
 * prueba) y manda la cookie de sesión, que es lo que deja al autor compartir
 * una reseña con "Ocultar actividad".
 */
export function reviewImagePath(id: string, formato: ReviewFormato, v?: string | null) {
  const q = new URLSearchParams({ formato })
  if (v) q.set('v', String(Date.parse(v) || v))
  return `/api/share/review/${id}?${q}`
}

export function mediaImagePath(kind: 'movie' | 'tv', id: number | string, formato: MediaFormato) {
  return `/api/share/media/${kind}/${id}?formato=${formato}`
}

/** Las mismas, absolutas: para metadatos (vistas previas) y para la app. */
export const reviewImageUrl = (...a: Parameters<typeof reviewImagePath>) => SHARE_ORIGIN + reviewImagePath(...a)
export const mediaImageUrl = (...a: Parameters<typeof mediaImagePath>) => SHARE_ORIGIN + mediaImagePath(...a)
