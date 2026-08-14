import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy de OMDB para clientes sin backend propio (la app nativa).
 *
 * La key de OMDB es server-only (`OMDB_API_KEY`, sin `NEXT_PUBLIC_`), así que
 * la app no puede pegarle directo sin filtrarla en el bundle. Esta ruta la
 * mantiene del lado del servidor y devuelve sólo los puntajes ya normalizados.
 *
 * La respuesta es data pública de películas: no hay datos de usuario ni sesión,
 * por eso el CORS abierto es seguro.
 */

const OMDB_KEY = process.env.OMDB_API_KEY

/** Los ids de IMDb son `tt` + 7 a 10 dígitos. */
const IMDB_ID_PATTERN = /^tt\d{7,10}$/

/** OMDB puede colgarse; después de esto devolvemos vacío y listo. */
const FETCH_TIMEOUT_MS = 8000

/** Un día. Los puntajes se mueven lento y la cuota de OMDB es finita. */
const CACHE_SECONDS = 86_400

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const

export interface OMDBRatingsResponse {
  /** 0–10, como lo publica IMDb. */
  imdbRating: number | null
  /** Cantidad de votos en IMDb, ya sin separadores de miles. */
  imdbVotes: number | null
  /** 0–100, el % de críticos de Rotten Tomatoes. */
  tomatoMeter: number | null
  /** 0–100. */
  metacritic: number | null
  /** Texto crudo de OMDB ("Won 4 Oscars. 32 wins & 87 nominations."). */
  awards: string | null
}

const EMPTY: OMDBRatingsResponse = {
  imdbRating: null,
  imdbVotes: null,
  tomatoMeter: null,
  metacritic: null,
  awards: null,
}

/** OMDB usa la string 'N/A' en vez de omitir el campo. */
function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && trimmed !== 'N/A' ? trimmed : null
}

function toNumber(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number(value.replace(/[,%]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

interface OMDBRating {
  Source: string
  Value: string
}

/**
 * Los resultados vacíos NO se cachean: si OMDB estuvo caído un minuto no
 * queremos servir "sin puntajes" durante 24 horas.
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
  _req: NextRequest,
  { params }: { params: Promise<{ imdbId: string }> },
) {
  const { imdbId } = await params

  // Validación estricta: el id va a una URL saliente y sin esto la ruta sería
  // un proxy abierto a OMDB contra nuestra cuota.
  if (!IMDB_ID_PATTERN.test(imdbId)) {
    return NextResponse.json(
      { error: 'imdbId inválido' },
      { status: 400, headers: CORS_HEADERS },
    )
  }

  if (!OMDB_KEY) {
    console.error('[omdb-ratings] falta OMDB_API_KEY')
    return json(EMPTY, false)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(
      `https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${imdbId}`,
      { signal: controller.signal, next: { revalidate: CACHE_SECONDS } },
    )
    clearTimeout(timer)

    if (!res.ok) return json(EMPTY, false)

    const data = await res.json()
    if (data.Response === 'False') {
      // El id es válido en forma pero no existe en OMDB: eso no cambia mañana,
      // así que sí se cachea.
      return json(EMPTY, true)
    }

    const tomato = (data.Ratings as OMDBRating[] | undefined)?.find(
      r => r.Source === 'Rotten Tomatoes',
    )

    return json(
      {
        imdbRating: toNumber(clean(data.imdbRating)),
        imdbVotes: toNumber(clean(data.imdbVotes)),
        tomatoMeter: toNumber(clean(tomato?.Value ?? null)),
        metacritic: toNumber(clean(data.Metascore)),
        awards: clean(data.Awards),
      },
      true,
    )
  } catch (err) {
    clearTimeout(timer)
    console.error('[omdb-ratings]', err)
    return json(EMPTY, false)
  }
}
