import { NextResponse } from 'next/server'
import { requireAdminClient } from '@/lib/service-role'
import { correrSemanal, esViernesEnArgentina } from '@/lib/resumen-semanal'

/**
 * /api/cron/resumen-semanal — "Tu resumen semanal", los viernes a las 18 de
 * Argentina (21 UTC, en `vercel.json`). Toda la lógica está en
 * `lib/resumen-semanal.ts`.
 *
 * Sólo corre un viernes de Argentina, aunque alguien con el secreto la llame
 * otro día, y una sola vez por semana aunque Vercel la dispare dos veces.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!esViernesEnArgentina()) {
    return NextResponse.json({ ok: true, saltada: 'Hoy no es viernes en Argentina.' })
  }

  const { admin, failure } = requireAdminClient('cron/resumen-semanal')
  if (failure) return failure

  try {
    const resumen = await correrSemanal(admin)
    console.log('[semanal]', JSON.stringify(resumen))
    return NextResponse.json({ ok: true, ...resumen })
  } catch (err) {
    console.error('[semanal] falló:', (err as Error).message)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
