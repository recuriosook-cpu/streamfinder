import { avatarParaImagen, loadShareAssets, pideJpeg, renderShareImage, SIZES } from '@/lib/share-image'
import { cargarWrapped } from '@/lib/wrapped-datos'
import { WrappedHistoria, WrappedLink } from '@/lib/wrapped-imagen'
import { anioDeRuta, wrappedAbierto } from '@/lib/wrapped'
import { normalizarIdioma } from '@/lib/idioma'

/**
 * La imagen del Wrapped (lib/wrapped-imagen.tsx):
 *   - sin parámetros: la vista previa de los links (1200 × 630, JPEG), el
 *     og:image de /wrapped/[usuario]/[año];
 *   - `?formato=historia`: la historia (1080 × 1920), igual a la tarjeta de
 *     la página; en JPEG con `?jpg=1`.
 *   - `?lang=en`: en inglés.
 *
 * Antes del 1 de diciembre da 404 (`proxy.ts`; acá también, por las dudas).
 * Pública y con caché corta: los datos cambian mientras dura diciembre.
 */
export async function GET(req: Request, { params }: { params: Promise<{ usuario: string; anio: string }> }) {
  const p = await params
  const anio = anioDeRuta(p.anio)
  if (anio == null || !wrappedAbierto(anio)) return new Response('No encontrado', { status: 404 })

  const url = new URL(req.url)
  const idioma = normalizarIdioma(url.searchParams.get('lang'))
  const historia = url.searchParams.get('formato') === 'historia'

  const carga = await cargarWrapped(decodeURIComponent(p.usuario), anio, idioma)
  if (carga.estado !== 'ok') return new Response('Sin Wrapped', { status: 404 })

  const [{ logo }, avatar] = await Promise.all([
    loadShareAssets(),
    avatarParaImagen(carga.vista.perfil.avatar_url),
  ])
  const props = { vista: carga.vista, idioma, logo, avatar }
  return historia
    ? renderShareImage(<WrappedHistoria {...props} />, SIZES.historia, { cache: 'corta', jpeg: pideJpeg(req) })
    // La vista previa siempre en JPEG: WhatsApp no muestra imágenes de más de ~300 KB.
    : renderShareImage(<WrappedLink {...props} />, SIZES.link, { cache: 'corta', jpeg: true })
}
