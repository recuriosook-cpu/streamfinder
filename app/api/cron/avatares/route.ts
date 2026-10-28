import { NextResponse } from 'next/server'
import { requireAdminClient } from '@/lib/service-role'
import { optimizarAvataresPendientes } from '@/lib/avatar-perfil'

/**
 * GET /api/cron/avatares — una vez por día (ver `vercel.json`).
 *
 * Achica las fotos de perfil que siguen en el formato viejo (las que suben las
 * versiones de la app anteriores a `POST /api/perfil/avatar`) y borra las que
 * ningún perfil usa. Ver `lib/avatar-perfil.ts`. La primera corrida pasa todas
 * las fotos existentes; se puede disparar a mano con el `CRON_SECRET`.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

/** Mismo guard que `/api/cron/daily-notifications`. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { admin, failure } = requireAdminClient('cron/avatares')
  if (failure) return failure

  try {
    const resumen = await optimizarAvataresPendientes(admin)
    if (resumen.fallidos.length) console.error('[cron/avatares] fallidos', resumen.fallidos)
    return NextResponse.json(resumen)
  } catch (err) {
    console.error('[cron/avatares]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
