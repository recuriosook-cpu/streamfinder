import { NextResponse, type NextRequest } from 'next/server'
import {
  buildDetail,
  CORS_HEADERS,
  GUIAS_TTL_SECONDS,
  isKnownSlug,
  sharedCache,
} from '@/lib/guias-api'
import { enforceRateLimit } from '@/lib/rate-limit'

/**
 * Una guía entera, ya parseada y con los títulos resueltos contra TMDB.
 *
 * El slug se valida contra las guías que existen antes de tocar el disco: sin
 * eso, `lib/guides.ts` armaría un path con lo que venga en la URL.
 */

export const revalidate = 86_400

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const limited = enforceRateLimit(req, CORS_HEADERS)
  if (limited) return limited

  const { slug } = await params

  if (!isKnownSlug(slug)) {
    return NextResponse.json(
      { error: 'Guía no encontrada' },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  try {
    const guia = await buildDetail(slug)
    if (!guia) {
      return NextResponse.json(
        { error: 'Guía no encontrada' },
        { status: 404, headers: CORS_HEADERS }
      )
    }

    return NextResponse.json(guia, {
      headers: { ...CORS_HEADERS, ...sharedCache(GUIAS_TTL_SECONDS) },
    })
  } catch (err: unknown) {
    console.error('[api/guias/slug]', err)
    return NextResponse.json(
      { error: 'No pudimos cargar la guía' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
