import { NextResponse } from 'next/server'
import { requireAdminClient } from '@/lib/service-role'
import { completarGeneros } from '@/lib/generos-watched'

/**
 * GET /api/cron/generos — una vez por día (ver `vercel.json`).
 *
 * Completa `watched.genre_ids` de lo que se marcó desde la corrida anterior:
 * un pedido a TMDB por título distinto. Toda la lógica está en
 * `lib/generos-watched.ts`; la primera carga se hizo con
 * `scripts/completar-generos.ts`. Hay tope de títulos por corrida para entrar
 * holgado en los 300 s: si un día quedan más, siguen al otro.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_TITULOS = 2000

/** Mismo guard que `/api/cron/daily-notifications`. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { admin, failure } = requireAdminClient('cron/generos')
  if (failure) return failure

  try {
    const resumen = await completarGeneros(admin, { maxTitulos: MAX_TITULOS })
    console.log('[cron/generos]', JSON.stringify(resumen))
    return NextResponse.json(resumen)
  } catch (err) {
    console.error('[cron/generos]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
