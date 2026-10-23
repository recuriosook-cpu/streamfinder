import { ListaStory, loadShareAssets, pideJpeg, renderShareImage, SIZES } from '@/lib/share-image'
import { loadShareLista } from '@/lib/share-data'
import { getRequestUserId } from '@/lib/request-user'

/**
 * "Compartir lista": la historia (1080 × 1920) con el título, quién la armó y
 * una grilla de pósters. Una lista pública se cachea; una privada sólo la pide
 * su dueño, con su sesión.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [found, { logo }] = await Promise.all([loadShareLista(id, () => getRequestUserId(req)), loadShareAssets()])
  if (!found) return new Response('No encontrada', { status: 404 })
  return renderShareImage(<ListaStory l={found.lista} logo={logo} />, SIZES.historia, {
    cache: found.privada ? 'privada' : 'publica',
    jpeg: pideJpeg(req),
  })
}
