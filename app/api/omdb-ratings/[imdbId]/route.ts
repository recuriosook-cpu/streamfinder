import { NextRequest, NextResponse } from 'next/server'
import { enforceRateLimit } from '@/lib/rate-limit'
import { IMDB_ID_PATTERN, puntajesOMDb, type PuntajesOMDb } from '@/lib/omdb-cache'

/**
 * Proxy de OMDB para clientes sin backend propio (la app nativa), y para la
 * ficha web cuando se generó sin puntajes (`RatingsSection`).
 *
 * La key de OMDB es server-only (`OMDB_API_KEY`, sin `NEXT_PUBLIC_`), así que
 * la app no puede pegarle directo sin filtrarla en el bundle. Esta ruta la
 * mantiene del lado del servidor y devuelve sólo los puntajes ya normalizados.
 * Lee de `omdb_ratings` y sólo va a OMDb si el título no está o venció: ver
 * `lib/omdb-cache.ts`.
 *
 * La respuesta es data pública de películas: no hay datos de usuario ni sesión,
 * por eso el CORS abierto es seguro.
 */

/** Un día. Los puntajes se mueven lento y la cuota de OMDB es finita. */
const CACHE_SECONDS = 86_400

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const

/** La forma que espera `src/lib/omdb.ts` de glynbox-mobile. No cambiarla. */
export type OMDBRatingsResponse = PuntajesOMDb

/**
 * Lo que no se pudo traer NO se cachea: si OMDB se quedó sin cupo un rato no
 * queremos servir "sin puntajes" durante 24 horas. Un título que OMDb no tiene
 * sí: eso no cambia mañana.
 */
function json(body: OMDBRatingsResponse, cacheable: boolean) {
  return NextResponse.json(body, {
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': cacheable
        ? `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=604800`
        : 'no-store',
    },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ imdbId: string }> },
) {
  const limited = enforceRateLimit(req, CORS_HEADERS)
  if (limited) return limited

  const { imdbId } = await params

  // Validación estricta: el id va a una URL saliente y sin esto la ruta sería
  // un proxy abierto a OMDB contra nuestra cuota.
  if (!IMDB_ID_PATTERN.test(imdbId)) {
    return NextResponse.json(
      { error: 'imdbId inválido' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  const { puntajes, estado } = await puntajesOMDb(imdbId)
  return json(puntajes, estado !== 'no_disponible')
}
