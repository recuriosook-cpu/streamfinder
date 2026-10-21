import { NextResponse, type NextRequest } from 'next/server'
import { enforceRateLimit } from '@/lib/rate-limit'
import { requireAdminClient } from '@/lib/service-role'
import { getRequestUserId } from '@/lib/request-user'
import { paisDelPedido } from '@/lib/geo'
import { guardarPaisDetectado } from '@/lib/pais-perfil'

/**
 * El país de quien pide, detectado por Vercel desde la IP.
 *
 *   GET  -> sólo lo dice. Es lo que usa `CountryContext` sin sesión, en lugar
 *           del ipapi.co de antes, que era un tercero viendo la IP de cada
 *           visitante y que muchos bloqueadores de anuncios cortaban.
 *   POST -> con sesión, además lo guarda en el perfil. `CountryContext` lo
 *           llama en cada carga con sesión, y eso cubre el registro y todos los
 *           ingresos: con Google, Apple o Facebook, y con contraseña, que no
 *           pasa por ningún handler del servidor.
 *
 * La regla del POST está en `lib/pais-perfil.ts`, que también usan las rutas
 * que pide la app: un país elegido a mano no se toca; si no, queda el detectado
 * como 'auto'.
 *
 * Contesta siempre `{ pais }`: el país que la página tiene que usar, que con
 * un país manual es el manual y no el detectado. `null` si no se sabe.
 */

export const runtime = 'nodejs'

const RATE_LIMIT = 30

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {}, RATE_LIMIT)
  if (limited) return limited
  return NextResponse.json({ pais: paisDelPedido(req.headers) })
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, {}, RATE_LIMIT)
  if (limited) return limited

  const detectado = paisDelPedido(req.headers)

  const userId = await getRequestUserId(req)
  if (!userId) return NextResponse.json({ pais: detectado })

  const { admin, failure } = requireAdminClient('perfil/pais')
  if (failure) return NextResponse.json({ pais: detectado })

  return NextResponse.json(await guardarPaisDetectado(admin, userId, req.headers))
}
