import { CalificacionStory, loadShareAssets, pideJpeg, renderShareImage, SIZES } from '@/lib/share-image'
import { loadShareCalificacion } from '@/lib/share-data'
import { getRequestUserId } from '@/lib/request-user'

/**
 * "Compartí tu calificación": la historia (1080 × 1920) de la nota de quien la
 * pide, con su reseña si escribió una. Las calificaciones sólo las ve su
 * dueño, así que hace falta su sesión (cookie en la web, Bearer en la app) y
 * no se cachea.
 */
export async function GET(req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params
  const viewerId = await getRequestUserId(req)
  if (!viewerId) return new Response('Sin sesión', { status: 401 })

  const kind = type === 'tv' ? 'tv' : 'movie'
  const [c, { logo }] = await Promise.all([loadShareCalificacion(viewerId, kind, Number(id)), loadShareAssets()])
  if (!c) return new Response('No encontrada', { status: 404 })
  return renderShareImage(<CalificacionStory c={c} logo={logo} />, SIZES.historia, { cache: 'privada', jpeg: pideJpeg(req) })
}
