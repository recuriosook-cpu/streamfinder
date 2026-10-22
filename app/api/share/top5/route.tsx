import { loadShareAssets, renderShareImage, SIZES, Top5Story } from '@/lib/share-image'
import { loadShareTop5 } from '@/lib/share-data'
import { getRequestUserId } from '@/lib/request-user'

/**
 * "Mi top 5": la historia (1080 × 1920) de quien la pide. Sus favoritas
 * fijadas y, si no llegan a cinco, lo que calificó más alto (ver
 * `loadShareTop5`). Con su sesión y sin caché.
 */
export async function GET(req: Request) {
  const viewerId = await getRequestUserId(req)
  if (!viewerId) return new Response('Sin sesión', { status: 401 })
  const [t, { logo }] = await Promise.all([loadShareTop5(viewerId), loadShareAssets()])
  if (!t) return new Response('Sin títulos', { status: 404 })
  return renderShareImage(<Top5Story t={t} logo={logo} />, SIZES.historia, { cache: 'privada' })
}
