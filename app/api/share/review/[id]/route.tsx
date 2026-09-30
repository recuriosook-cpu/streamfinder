import { loadShareAssets, renderShareImage, ReviewPost, ReviewStory, LinkPreview, SIZES } from '@/lib/share-image'
import { loadShareReview } from '@/lib/share-data'
import { getRequestUserId } from '@/lib/request-user'

/**
 * Imagen de una reseña para compartir.
 *   ?formato=historia     1080 × 1920 PNG (default)
 *   ?formato=publicacion  1080 × 1350 PNG
 *   ?formato=link         1200 × 630 JPEG, la vista previa de los links
 *   ?v=...                versión (fecha de edición); sólo cambia la URL
 *
 * Si el autor tiene "Ocultar actividad", sólo él la puede pedir (cookie en la
 * web, Bearer en la app) y la respuesta no se cachea.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const formato = new URL(req.url).searchParams.get('formato') ?? 'historia'

  const [found, { logo }] = await Promise.all([
    loadShareReview(id, () => getRequestUserId(req)),
    loadShareAssets(),
  ])
  if (!found) return new Response('No encontrada', { status: 404 })
  const { review, privada } = found
  const cache = privada ? 'privada' : 'publica'

  if (formato === 'publicacion') {
    return renderShareImage(<ReviewPost review={review} logo={logo} />, SIZES.publicacion, { cache })
  }
  if (formato === 'link') {
    return renderShareImage(<LinkPreview media={review.media} review={review} logo={logo} />, SIZES.link, { cache, jpeg: true })
  }
  return renderShareImage(<ReviewStory review={review} logo={logo} />, SIZES.historia, { cache })
}
