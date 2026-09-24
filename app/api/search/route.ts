import { NextResponse, type NextRequest } from 'next/server'
import { buscar, type TipoBusqueda } from '@/lib/search'

/**
 * GET /api/search?q=<texto>&type=all|movie|tv|person&page=1
 *
 * El buscador de películas, series y personas; ver `lib/search.ts`. Lo usan
 * las sugerencias del Navbar y la app. Devuelve la forma de `/search/multi`
 * de TMDB más `correction`.
 *
 * Público y cacheado en el CDN: la misma búsqueda da lo mismo para todos, así
 * que las repetidas no llegan ni a la función. Una hora alcanza: el índice
 * cambia una vez por semana y TMDB se cachea una hora igual.
 */

export const runtime = 'nodejs'

const TIPOS: TipoBusqueda[] = ['all', 'movie', 'tv', 'person']
const LARGO_MAXIMO = 100

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const q = (params.get('q') ?? '').trim().slice(0, LARGO_MAXIMO)
  const tipo = (params.get('type') ?? 'all') as TipoBusqueda
  const page = Number(params.get('page') ?? '1')

  if (!TIPOS.includes(tipo)) {
    return NextResponse.json({ error: 'type tiene que ser all, movie, tv o person' }, { status: 400 })
  }
  // TMDB no pagina más allá de la 500.
  if (!Number.isInteger(page) || page < 1 || page > 500) {
    return NextResponse.json({ error: 'page tiene que ser un entero entre 1 y 500' }, { status: 400 })
  }

  const resultado = await buscar(q, tipo, page)

  return NextResponse.json(resultado, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  })
}
