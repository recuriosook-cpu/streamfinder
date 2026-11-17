import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminClient } from '@/lib/service-role'
import {
  faltantesAppStore, informeDelDia, leerConfigAppStore, POTION_APP_ID_POR_DEFECTO, type ResultadoDia,
} from '@/lib/appstore-reports'

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
 * Mientras la tabla no tenga nada de la app, todos desde el lanzamiento del
 * juego. Después, los últimos 10: Apple a veces publica un día tarde, y el
 * upsert por (app, día, país) hace que repetir no duplique.
 *
 * ── Cada corrida queda registrada ─────────────────────────────────────────
 *
 * En `appstore_corridas`, con lo que dijo Apple día por día: el código HTTP,
 * cuántos renglones traía el informe, qué apps venían y con cuántas descargas,
 * y el texto de Apple cuando no hubo informe. Hasta el 16/11 la copia
 * terminaba "bien" sin dejar rastro y la tabla de descargas vacía no decía
 * por qué. `/admin/potion` lee esta tabla para avisar si la copia no corrió o
 * si falló.
 *
 * Contesta 200 igual cuando algo falla y dice qué pasó, como antes.
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

/** Un día, como queda en `appstore_corridas.dias`. */
interface DiaRegistrado {
  fecha: string
  estado: ResultadoDia['estado']
  http: number | null
  filas?: number
  /** Primeras descargas de la app ese día, sumadas de todos los países. */
  unidades?: number
  apps?: { id: string; titulo: string; unidades: number }[]
  detalle?: string
}

/** Deja la corrida anotada. Si falla, al log: nunca rompe la respuesta. */
async function registrar(
  admin: SupabaseClient, appId: string, ok: boolean, motivo: string | null, dias: DiaRegistrado[],
) {
  const { error } = await admin.from('appstore_corridas').insert({ app_id: appId, ok, motivo, dias })
  if (error) console.error('[cron/appstore-stats] no se pudo registrar la corrida:', error.message)
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('cron/appstore-stats')
  if (failure) return failure

  const config = leerConfigAppStore()
  if (!config) {
    const faltan = faltantesAppStore()
    await registrar(admin, POTION_APP_ID_POR_DEFECTO, false, `Faltan variables: ${faltan.join(', ')}`, [])
    console.error('[cron/appstore-stats] faltan variables:', faltan.join(', '))
    return NextResponse.json({ ok: false, configurado: false, faltan })
  }

  const ultima = await admin
    .from('appstore_descargas')
    .select('fecha')
    .eq('app_id', config.appId)
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (ultima.error) {
    const motivo = faltaLaTabla(ultima.error)
      ? 'Falta correr supabase-appstore-descargas-2026-11.sql'
      : ultima.error.message
    await registrar(admin, config.appId, false, motivo, [])
    console.error('[cron/appstore-stats] no se pudo leer la tabla:', motivo)
    return NextResponse.json({ ok: false, motivo })
  }

  // Ayer en UTC es el último día que Apple puede tener listo.
  const hasta = sumarDias(new Date().toISOString().slice(0, 10), -1)
  const desde = ultima.data ? sumarDias(hasta, -(DIAS_DE_REPASO - 1)) : PRIMER_DIA
  const dias: string[] = []
  for (let d = desde < PRIMER_DIA ? PRIMER_DIA : desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d)

  const filas: { app_id: string; fecha: string; pais: string; descargas: number; redescargas: number; actualizado_en: string }[] = []
  const registro: DiaRegistrado[] = []
  const avisos: { fecha: string; motivo: string }[] = []
  let vacios = 0
  let sinPermiso = false
  const ahora = new Date().toISOString()

  for (let i = 0; i < dias.length && !sinPermiso; i += EN_PARALELO) {
    const tanda = dias.slice(i, i + EN_PARALELO)
    const resultados = await Promise.all(tanda.map(f => informeDelDia(config, f)))
    resultados.forEach((r, j) => {
      const fecha = tanda[j]
      const dia: DiaRegistrado = { fecha, estado: r.estado, http: r.diag.http }
      if (r.diag.filas !== undefined) dia.filas = r.diag.filas
      if (r.diag.apps) dia.apps = r.diag.apps
      if (r.diag.detalle) dia.detalle = r.diag.detalle
      if (r.estado === 'ok') {
        dia.unidades = r.paises.reduce((a, p) => a + p.descargas, 0)
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
        // Sin permiso para un día es sin permiso para todos.
        if (r.estado === 'sin_permiso') sinPermiso = true
      }
      registro.push(dia)
    })
  }

  if (avisos.length > 0) console.error('[cron/appstore-stats] avisos:', JSON.stringify(avisos.slice(0, 5)))

  let motivo: string | null = avisos.length > 0 ? `${avisos.length} día(s) con error: ${avisos[0].motivo}` : null
  if (filas.length > 0) {
    const { error } = await admin
      .from('appstore_descargas')
      .upsert(filas, { onConflict: 'app_id,fecha,pais' })
    if (error) {
      console.error('[cron/appstore-stats] el upsert falló:', error.message)
      motivo = `No se pudieron guardar las descargas: ${error.message}`
    }
  }

  const ok = motivo === null
  await registrar(admin, config.appId, ok, motivo, registro)

  const resumen = {
    ok,
    app: config.appId,
    dias: { desde: dias[0] ?? null, hasta: dias[dias.length - 1] ?? null, pedidos: dias.length, sinDescargas: vacios },
    filas: filas.length,
    descargas: filas.reduce((a, f) => a + f.descargas, 0),
    motivo,
    avisos,
  }
  // Una línea por corrida en el log, haya pasado lo que haya pasado.
  console.log('[cron/appstore-stats]', JSON.stringify({ ...resumen, avisos: avisos.length }))
  return NextResponse.json(resumen)
}
