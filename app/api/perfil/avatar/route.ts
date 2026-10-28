import { NextResponse, type NextRequest } from 'next/server'
import { enforceRateLimit } from '@/lib/rate-limit'
import { requireAdminClient } from '@/lib/service-role'
import { getRequestUserId } from '@/lib/request-user'
import { optimizarAvatar } from '@/lib/avatar-perfil'

/**
 * POST /api/perfil/avatar  { ruta }
 *
 * Después de subir la foto original al bucket `avatars`, la web y la app
 * piden esto con la ruta: se achica a WebP de 256 px con caché de un año, queda
 * en el perfil y se borra el original. Contesta `{ avatarUrl }`. Ver
 * `lib/avatar-perfil.ts`.
 *
 * El original va directo a Storage y no por acá porque una foto del teléfono
 * puede pasar los 4,5 MB que acepta el cuerpo de una función de Vercel.
 */

export const runtime = 'nodejs'

const RATE_LIMIT = 10

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, {}, RATE_LIMIT)
  if (limited) return limited

  const userId = await getRequestUserId(req)
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { ruta?: unknown } | null
  if (typeof body?.ruta !== 'string') return NextResponse.json({ error: 'ruta' }, { status: 400 })

  const { admin, failure } = requireAdminClient('perfil/avatar')
  if (failure) return failure

  try {
    return NextResponse.json({ avatarUrl: await optimizarAvatar(admin, userId, body.ruta) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[perfil/avatar]', message)
    return NextResponse.json({ error: message }, { status: message === 'ruta ajena' ? 403 : 500 })
  }
}
