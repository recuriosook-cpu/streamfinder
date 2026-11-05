import { BASE, indice, respuestaXml } from '@/lib/sitemap'

/** El índice de sitemaps: el que figura en robots.txt y en Search Console. Ver `lib/sitemap.ts`. */
export const dynamic = 'force-dynamic'

export function GET() {
  return respuestaXml(indice([
    `${BASE}/sitemap-paginas.xml`,
    `${BASE}/sitemap-actividad.xml`,
    `${BASE}/sitemap-populares.xml`,
  ]))
}
