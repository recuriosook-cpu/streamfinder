import { NextRequest, NextResponse } from 'next/server'
import { CORS_HEADERS, corsPreflight, jsonError } from '@/lib/community-api'
import { enforceRateLimit } from '@/lib/rate-limit'
import { plataformasDelPais } from '@/lib/plataformas-pais'

/**
 * /api/plataformas?pais=AR — las plataformas de un país, ordenadas por
 * popularidad y con su logo (`lib/plataformas-pais.ts`). Es igual para todos: se
 * cachea en la CDN un día. Lo usan la web y la app.
 */

export const OPTIONS = corsPreflight

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, CORS_HEADERS)
  if (limited) return limited

  const pais = (req.nextUrl.searchParams.get('pais') ?? '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(pais)) return jsonError('País inválido', 400)

  try {
    const plataformas = await plataformasDelPais(pais)
    return NextResponse.json(
      { pais, plataformas },
      { headers: { ...CORS_HEADERS, 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    )
  } catch (err) {
    console.error('[plataformas]', (err as Error).message)
    return jsonError('No se pudieron traer las plataformas', 502)
  }
}
