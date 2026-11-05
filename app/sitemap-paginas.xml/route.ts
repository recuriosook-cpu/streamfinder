import { paginas, respuestaXml, urlset } from '@/lib/sitemap'

/** Páginas fijas, guías, géneros, plataformas, listas, reseñas y perfiles. Ver `lib/sitemap.ts`. */
export const dynamic = 'force-dynamic'

export async function GET() {
  return respuestaXml(urlset(await paginas()))
}
