import { NextResponse, type NextRequest } from 'next/server'
import {
  buildIndex,
  CORS_HEADERS,
  GUIAS_TTL_SECONDS,
  sharedCache,
} from '@/lib/guias-api'
import { enforceRateLimit } from '@/lib/rate-limit'

/**
 * Índice de guías editoriales para la app mobile.
 *
 * Convive con `/api/guides`, que devuelve el frontmatter crudo y lo consume el
 * carrusel del home de la web. Esta ruta expone el contrato que espera la app
 * —`tagline`, `hero` absoluto, `itemCount`— sin tocar el otro.
 */

export const revalidate = 86_400

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, CORS_HEADERS)
  if (limited) return limited

  try {
    return NextResponse.json(
      { guias: buildIndex() },
      { headers: { ...CORS_HEADERS, ...sharedCache(GUIAS_TTL_SECONDS) } }
    )
  } catch (err: unknown) {
    console.error('[api/guias]', err)
    // La app trata una lista vacía como "no hay guías" y muestra su empty
    // state, que es mejor que un error de red sin explicación.
    return NextResponse.json({ guias: [] }, { headers: CORS_HEADERS })
  }
}
