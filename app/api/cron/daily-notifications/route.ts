import { NextResponse } from 'next/server'
import { requireAdminClient } from '@/lib/service-role'
import { novedadesDeFamosos, type ResumenFamosos } from '@/lib/avisos-famosos'
import { novedadesDeDisponibilidad, type ResumenDisponibilidad } from '@/lib/disponibilidad'
import { insertarYAvisar } from '@/lib/avisos-push'

/**
 * GET /api/cron/daily-notifications — todos los días a las 9 de Argentina
 * (12 UTC, `vercel.json`).
 *
 * Desde la 1.0.16 (2026-10):
 *
 *   1. Famosos que cada uno sigue (`lib/avisos-famosos.ts`): cumpleaños,
 *      proyecto nuevo anunciado y estreno, de cine y de series, como actor o
 *      como director, guionista o creador.
 *   2. Disponibilidad (`lib/disponibilidad.ts`): algo de su "Ver después" o
 *      de un famoso que sigue llegó a una de sus plataformas, en su país.
 *   3. Todo junto a la bandeja, y una sola push por persona con el tope de 1
 *      por día y 4 por semana (`lib/avisos-push.ts`).
 *
 * Necesita supabase-famosos-disponibilidad-2026-10.sql. Hasta 2026-10 sólo
 * mandaba cumpleaños (de la fecha guardada al seguir, que la app no
 * guardaba) y estrenos de películas como actor.
 *
 * Una sola invocación por día: en Vercel es un par de minutos de función como
 * mucho. Los pedidos a TMDB (unos 400 por día en octubre de 2026) no cuestan.
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

  const { admin, failure } = requireAdminClient('cron/daily-notifications')
  if (failure) return failure

  const inicio = Date.now()
  const famosos: ResumenFamosos = { famosos: 0, sembrados: 0, sinRespuesta: 0, creditosNuevos: 0, cumpleanosCompletados: 0, errores: 0 }
  const disponibilidad: ResumenDisponibilidad = { titulos: 0, pedidos: 0, sinRespuesta: 0, sembrados: 0, llegadas: 0 }
  const errores: string[] = []

  // Cada parte por separado: si la disponibilidad falla, los cumpleaños igual salen.
  const novedades = []
  try {
    novedades.push(...(await novedadesDeFamosos(admin, famosos)))
  } catch (err) {
    errores.push(`famosos: ${(err as Error).message}`)
  }
  try {
    novedades.push(...(await novedadesDeDisponibilidad(admin, disponibilidad)))
  } catch (err) {
    errores.push(`disponibilidad: ${(err as Error).message}`)
  }

  let avisos = null
  try {
    avisos = await insertarYAvisar(admin, novedades)
  } catch (err) {
    errores.push(`avisos: ${(err as Error).message}`)
  }

  for (const e of errores) console.error('[daily-notifications]', e)

  return NextResponse.json({
    ok: errores.length === 0,
    segundos: Math.round((Date.now() - inicio) / 1000),
    famosos,
    disponibilidad,
    novedades: novedades.length,
    avisos,
    errores,
  })
}
