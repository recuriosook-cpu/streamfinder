import { loadShareAssets, renderShareImage, MediaStory, LinkPreview, SIZES } from '@/lib/share-image'
import { loadShareMedia } from '@/lib/share-data'

/**
 * Imagen de una ficha (película o serie) para compartir.
 *   ?formato=historia  1080 × 1920 PNG (default)
 *   ?formato=link      1200 × 630 JPEG, la vista previa de los links
 */
export async function GET(req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params
  if ((type !== 'movie' && type !== 'tv') || !/^\d+$/.test(id)) {
    return new Response('No encontrada', { status: 404 })
  }
  const formato = new URL(req.url).searchParams.get('formato') ?? 'historia'

  const [media, { logo }] = await Promise.all([loadShareMedia(type, Number(id)), loadShareAssets()])
  if (!media) return new Response('No encontrada', { status: 404 })

  return formato === 'link'
    ? renderShareImage(<LinkPreview media={media} logo={logo} />, SIZES.link, { cache: 'publica', jpeg: true })
    : renderShareImage(<MediaStory media={media} logo={logo} />, SIZES.historia, { cache: 'publica' })
}
