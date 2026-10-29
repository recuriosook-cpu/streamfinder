import { ListaStory, loadShareAssets, pideJpeg, renderShareImage, SIZES } from '@/lib/share-image'
import { loadShareGuia } from '@/lib/share-data'
import { isKnownSlug } from '@/lib/guias-api'

/**
 * "Compartir guía": la historia (1080 × 1920) con el mismo diseño que la de
 * las listas, con el logo al pie en vez de un usuario. Las guías son públicas
 * e iguales para todos, así que se cachea.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!isKnownSlug(slug)) return new Response('No encontrada', { status: 404 })
  const [guia, { logo, logoOscuro }] = await Promise.all([loadShareGuia(slug), loadShareAssets()])
  if (!guia) return new Response('No encontrada', { status: 404 })
  return renderShareImage(<ListaStory l={guia} logo={logo} logoOscuro={logoOscuro} />, SIZES.historia, {
    cache: 'publica',
    jpeg: pideJpeg(req),
  })
}
