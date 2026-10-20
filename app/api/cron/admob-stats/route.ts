import { NextResponse } from 'next/server'
import { requireAdminClient } from '@/lib/service-role'
import { APP_ADMOB_POTION, informeAdMob, leerConfigAdMob } from '@/lib/admob-reports'

/**
 * GET /api/cron/admob-stats — copia el informe de AdMob de Potion Bottle a
 * Supabase.
 *
 * Corre una vez por día por el cron de Vercel (ver `vercel.json`). También se
 * puede disparar a mano con el mismo `CRON_SECRET`, que es lo que conviene
 * hacer la primera vez para no esperar al horario.
 *
 * ── Qué baja ──────────────────────────────────────────────────────────────
 *
 * Los últimos `DIAS` días, por día, formato y país, a `admob_stats`. No sólo
 * ayer: AdMob ajusta la ganancia estimada de los días anteriores, y así cada
 * corrida pisa los números viejos con los corregidos. Todo es un `upsert` por
 * (app, fecha, formato, país), así que correrlo dos veces no duplica nada.
 *
 * ── Qué pasa si algo falla ────────────────────────────────────────────────
 *
 * Igual que `/api/cron/play-stats`: sin configurar es 200 diciendo qué falta,
 * para no llenar las alertas de Vercel con algo que no es un incidente. Un
 * refresh token vencido o un 403 sí son 500: el cron dejó de copiar y hay que
 * hacer algo. El cómo está en `lib/admob-reports.ts`.
 */

export const runtime = 'nodejs'

export const maxDuration = 60

/** Cuántos días hacia atrás se vuelven a pedir en cada corrida. */
const DIAS = 35

/** Filas por pedido de upsert: decenas de países por día y por formato. */
const LOTE = 1000

/** Mismo guard que `/api/cron/play-stats`. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`
}

function faltaLaTabla(error: { code?: string; message?: string }): boolean {
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('could not find the table')
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const cfg = leerConfigAdMob()
  if (!cfg.ok) {
    console.warn('[cron/admob-stats] sin configurar. Faltan:', cfg.faltan.join(', '))
    return NextResponse.json({ ok: true, configurado: false, faltan: cfg.faltan })
  }

  const { admin, failure } = requireAdminClient('cron/admob-stats')
  if (failure) return failure

  // Hasta mañana en UTC: la cuenta de AdMob puede estar en una zona donde ya
  // es otro día, y pedir un día de más no cuesta nada.
  const hasta = new Date()
  hasta.setUTCDate(hasta.getUTCDate() + 1)
  const desde = new Date()
  desde.setUTCDate(desde.getUTCDate() - DIAS)
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  const informe = await informeAdMob(cfg.config, iso(desde), iso(hasta))

  if (informe.estado !== 'ok') {
    const motivo =
      informe.estado === 'token_vencido'
        ? 'El refresh token venció o lo revocaron: correr scripts/admob-token.mjs y reemplazar ADMOB_REFRESH_TOKEN en Vercel.'
        : informe.estado === 'sin_permiso'
          ? '403: la cuenta que dio el permiso no tiene acceso a la cuenta de AdMob, o la API de AdMob no está activa en el proyecto de Google Cloud.'
          : 'El pedido a AdMob falló.'
    console.error(`[cron/admob-stats] ${motivo}`, informe.detalle)
    return NextResponse.json(
      { ok: false, configurado: true, estado: informe.estado, motivo, detalle: informe.detalle },
      { status: 500 },
    )
  }

  const ahora = new Date().toISOString()
  const filas = informe.filas.map(f => ({
    app_id:                  APP_ADMOB_POTION,
    fecha:                   f.fecha,
    formato:                 f.formato,
    pais:                    f.pais,
    ganancia_micros:         f.gananciaMicros,
    impresiones:             f.impresiones,
    solicitudes:             f.solicitudes,
    solicitudes_con_anuncio: f.solicitudesConAnuncio,
    clics:                   f.clics,
    actualizado_en:          ahora,
  }))

  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await admin
      .from('admob_stats')
      .upsert(filas.slice(i, i + LOTE), { onConflict: 'app_id,fecha,formato,pais' })

    if (error && faltaLaTabla(error)) {
      console.warn('[cron/admob-stats] falta correr supabase-admob-stats.sql')
      return NextResponse.json({ ok: false, configurado: true, sinMigracion: true }, { status: 500 })
    }
    if (error) {
      console.error('[cron/admob-stats] el upsert falló:', error.message)
      return NextResponse.json({ ok: false, configurado: true, filas: i, error: error.message }, { status: 500 })
    }
  }

  const fechas = filas.map(f => f.fecha).sort()
  return NextResponse.json({
    ok: true,
    configurado: true,
    filas: filas.length,
    desde: fechas[0] ?? null,
    hasta: fechas[fechas.length - 1] ?? null,
  })
}
