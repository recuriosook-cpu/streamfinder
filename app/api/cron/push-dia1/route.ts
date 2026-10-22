import { NextResponse } from 'next/server'
import { requireAdminClient } from '@/lib/service-role'
import { correrDia1 } from '@/lib/push-dia1'

/**
 * /api/cron/push-dia1 — "Para esta noche", la push del día 1. Toda la lógica
 * está en `lib/push-dia1.ts`.
 *
 * Corre cada hora: a las 20 de cada país le toca a la gente que se registró
 * el día anterior. El plan de Vercel sólo deja crons diarios, así que no está
 * en `vercel.json`: la llama pg_cron desde Supabase, con el mismo
 * `CRON_SECRET` (ver supabase-push-dia1-2026-10.sql). Llamarla más de una vez
 * en la misma hora no manda nada dos veces: cada persona queda anotada en
 * `push_dia1_enviados`.
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

  const { admin, failure } = requireAdminClient('cron/push-dia1')
  if (failure) return failure

  try {
    const resumen = await correrDia1(admin)
    console.log('[dia1]', JSON.stringify(resumen))
    return NextResponse.json({ ok: true, ...resumen })
  } catch (err) {
    console.error('[dia1] falló:', (err as Error).message)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
