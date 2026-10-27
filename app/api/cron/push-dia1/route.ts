import { NextResponse } from 'next/server'
import { requireAdminClient } from '@/lib/service-role'
import { correrDia1 } from '@/lib/push-dia1'
import { revisarRecibosPendientes } from '@/lib/push-envios'

/**
 * /api/cron/push-dia1 — "Para esta noche", la push del día 1. Toda la lógica
 * está en `lib/push-dia1.ts`.
 *
 * Corre cada hora: a las 20 de cada país le toca a la gente que se registró
 * el día anterior. El plan de Vercel sólo deja crons diarios, así que no está
 * en `vercel.json`: la llama pg_cron desde Supabase con `DIA1_CRON_SECRET`,
 * un secreto propio de esta tarea (ver supabase-push-dia1-2026-10.sql). No
 * usa `CRON_SECRET` porque en Vercel está marcado como sensible y no se puede
 * leer para copiarlo a Supabase; igual se acepta, por si algún día se llama
 * con ése. Llamarla más de una vez
 * en la misma hora no manda nada dos veces: cada persona queda anotada en
 * `push_dia1_enviados`.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

function authorized(req: Request): boolean {
  const header = req.headers.get('authorization') ?? ''
  return [process.env.DIA1_CRON_SECRET, process.env.CRON_SECRET].some(
    secret => !!secret && header === `Bearer ${secret}`
  )
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { admin, failure } = requireAdminClient('cron/push-dia1')
  if (failure) return failure

  // De paso, los recibos de Expo de cualquier envío que ya los tenga: es lo que
  // anota los tokens de quien desinstaló (`push_tokens_inactivos`). Va antes y
  // aparte para que un error del día 1 no lo frene.
  const recibosRevisados = await revisarRecibosPendientes(admin)

  try {
    const resumen = await correrDia1(admin)
    console.log('[dia1]', JSON.stringify({ ...resumen, recibosRevisados }))
    return NextResponse.json({ ok: true, ...resumen, recibosRevisados })
  } catch (err) {
    console.error('[dia1] falló:', (err as Error).message)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
