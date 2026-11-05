import { fichasConActividad, respuestaXml, urlset } from '@/lib/sitemap'

/** Fichas con reseñas, recomendaciones o notas de Glynbox. Ver `lib/sitemap.ts`. */
export const dynamic = 'force-dynamic'
// Recorre `ratings` entera (unas 60 páginas de 1000, en 16 tramos): una vez por día por la CDN.
export const maxDuration = 120

export async function GET() {
  try {
    return respuestaXml(urlset(await fichasConActividad()))
  } catch (e) {
    // Sin cache: mejor un 503 que Google reintenta que un sitemap vacío por 24 h.
    console.error('[sitemap-actividad]', e)
    return new Response('No se pudo armar el sitemap', { status: 503, headers: { 'Retry-After': '3600' } })
  }
}
