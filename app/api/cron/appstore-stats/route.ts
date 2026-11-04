import { NextResponse } from 'next/server'
import { requireAdminClient } from '@/lib/service-role'
import { faltantesAppStore, informeDelDia, leerConfigAppStore } from '@/lib/appstore-reports'

/**
 * GET /api/cron/appstore-stats — copia las descargas de App Store de Potion
 * Bottle a `appstore_descargas` (Supabase de Glynbox).
 *
 * Corre una vez por día por el cron de Vercel (`vercel.json`), a las 16:15
 * UTC: Apple arma los días en hora del Pacífico y publica el de ayer a la
 * mañana de allá. También se puede disparar a mano con el mismo `CRON_SECRET`.
 *
 * ── Qué días baja ─────────────────────────────────────────────────────────
 *
 * La primera vez (la tabla no tiene nada de la app), todos desde el
 * lanzamiento del juego. Después, los últimos 10: Apple a veces publica un
 * día tarde, y el upsert por (app, día, país) hace que repetir no duplique.
 *
 * ── Si algo falla ─────────────────────────────────────────────────────────
 *
 * Contesta 200 igual y dice qué pasó: qué variables faltan, si Apple dijo que
 * la clave no tiene permiso (403: le falta el acceso a "Ventas") o qué día
 * falló. Un día sin descargas es un 404 de Apple y no se reporta.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

/** El primer día que tiene sentido pedir: el lanzamiento del juego. */
const PRIMER_DIA = '2026-10-13'
const DIAS_DE_REPASO = 10
/** Pedidos a Apple a la vez. */
const EN_PARALELO = 5

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`
}

function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function faltaLaTabla(error: { code?: string; message?: string }): boolean {
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('could not find the table')
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const config = leerConfigAppStore()
  if (!config) {
    return NextResponse.json({ ok: false, configurado: false, faltan: faltantesAppStore() })
  }

  const { admin, failure } = requireAdminClient('cron/appstore-stats')
  if (failure) return failure

  const ultima = await admin
    .from('appstore_descargas')
    .select('fecha')
    .eq('app_id', config.appId)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (ultima.error) {
    if (faltaLaTabla(ultima.error)) {
      return NextResponse.json({ ok: false, motivo: 'Falta correr supabase-appstore-descargas-2026-11.sql' })
    }
    console.error('[cron/appstore-stats] no se pudo leer la tabla:', ultima.error.message)
    return NextResponse.json({ ok: false, motivo: ultima.error.message })
  }

  // Ayer en UTC es el último día que Apple puede tener listo.
  const hasta = sumarDias(new Date().toISOString().slice(0, 10), -1)
  const desde = ultima.data ? sumarDias(hasta, -(DIAS_DE_REPASO - 1)) : PRIMER_DIA
  const dias: string[] = []
  for (let d = desde < PRIMER_DIA ? PRIMER_DIA : desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d)

  const filas: { app_id: string; fecha: string; pais: string; descargas: number; redescargas: number; actualizado_en: string }[] = []
  const avisos: { fecha: string; motivo: string }[] = []
  let vacios = 0
  const ahora = new Date().toISOString()

  for (let i = 0; i < dias.length; i += EN_PARALELO) {
    const tanda = dias.slice(i, i + EN_PARALELO)
    const resultados = await Promise.all(tanda.map(f => informeDelDia(config, f)))
    let sinPermiso = false
    resultados.forEach((r, j) => {
      const fecha = tanda[j]
      if (r.estado === 'ok') {
        for (const p of r.paises) filas.push({ app_id: config.appId, fecha, ...p, actualizado_en: ahora })
      } else if (r.estado === 'vacio') {
        vacios++
      } else {
        avisos.push({
          fecha,
          motivo: r.estado === 'sin_permiso'
            ? `Apple no deja leer las ventas con esta clave (${r.detalle}). La clave necesita acceso a "Ventas".`
            : r.detalle,
        })
        if (r.estado === 'sin_permiso') sinPermiso = true
      }
    })
    // Sin permiso para un día es sin permiso para todos.
    if (sinPermiso) break
  }

  if (avisos.length > 0) console.error('[cron/appstore-stats] avisos:', JSON.stringify(avisos.slice(0, 5)))

  if (filas.length > 0) {
    const { error } = await admin
      .from('appstore_descargas')
      .upsert(filas, { onConflict: 'app_id,fecha,pais' })
    if (error) {
      console.error('[cron/appstore-stats] el upsert falló:', error.message)
      return NextResponse.json({ ok: false, motivo: error.message, avisos })
    }
  }

  return NextResponse.json({
    ok: avisos.length === 0,
    app: config.appId,
    dias: { desde: dias[0] ?? null, hasta: dias[dias.length - 1] ?? null, pedidos: dias.length, sinDescargas: vacios },
    filas: filas.length,
    descargas: filas.reduce((a, f) => a + f.descargas, 0),
    avisos,
  })
}
