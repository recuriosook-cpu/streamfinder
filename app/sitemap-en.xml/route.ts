import { fichasPopularesEn, respuestaXml, urlset } from '@/lib/sitemap'

/** Las fichas en inglés de lo más popular en streaming en Estados Unidos. Ver `lib/sitemap.ts`. */
export const dynamic = 'force-dynamic'
// ~350 pedidos a TMDB, de a 10: una vez por día por la CDN.
export const maxDuration = 120

export async function GET() {
  const entradas = await fichasPopularesEn()
  // Si TMDB no respondió, mejor un 503 que Google reintenta que un sitemap vacío por 24 h.
  if (entradas.length === 0) return new Response('No se pudo armar el sitemap', { status: 503, headers: { 'Retry-After': '3600' } })
  return respuestaXml(urlset(entradas))
}
