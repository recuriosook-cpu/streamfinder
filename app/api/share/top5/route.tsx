import { loadShareAssets, pideJpeg, renderShareImage, SIZES, Top5Story } from '@/lib/share-image'
import { loadShareTop5 } from '@/lib/share-data'
import { getRequestUserId } from '@/lib/request-user'

/**
 * "Compartir mi top": la historia (1080 × 1920) de quien la pide, con las
 * favoritas que fijó en su perfil y nada más (ver `loadShareTop5`). La ruta
 * se sigue llamando top5 porque la piden las versiones ya publicadas de la
 * app. Con su sesión y sin caché.
 */
export async function GET(req: Request) {
  const viewerId = await getRequestUserId(req)
  if (!viewerId) return new Response('Sin sesión', { status: 401 })
  const [t, { logo }] = await Promise.all([loadShareTop5(viewerId), loadShareAssets()])
  if (!t) return new Response('Sin títulos', { status: 404 })
  return renderShareImage(<Top5Story t={t} logo={logo} />, SIZES.historia, { cache: 'privada', jpeg: pideJpeg(req) })
}
