import { NextResponse } from 'next/server'
import { requireAdminClient } from '@/lib/service-role'
import {
  leerConfig,
  descargarObjeto,
  filasPorFecha,
  mesesAConsultar,
  rutasInstalls,
  rutasFicha,
  type ConfigPlay,
  type DiaPlay,
} from '@/lib/google-play-reports'

/**
 * GET /api/cron/play-stats — copia los informes de Google Play a Supabase.
 *
 * Corre una vez por día por el cron de Vercel (ver `vercel.json`). También se
 * puede disparar a mano con el mismo `CRON_SECRET`, que es lo que conviene
 * hacer la primera vez para no esperar al horario.
 *
 * ── Qué baja ──────────────────────────────────────────────────────────────
 *
 * Dos informes, dos meses cada uno: el corriente y el anterior. Son cuatro
 * descargas. El mes anterior no es por las dudas — el día 1 el mes en curso
 * tiene una sola fila, y Google además sigue corrigiendo los últimos días del
 * mes cerrado durante una semana larga.
 *
 * ── Por qué es idempotente ────────────────────────────────────────────────
 *
 * Todo termina en un `upsert` por (paquete, fecha). Correrlo dos veces el
 * mismo día no duplica nada y correrlo mañana pisa los números de ayer con la
 * versión corregida, que es justamente lo que se quiere: los datos de Play no
 * son definitivos hasta varios días después.
 *
 * ── Qué pasa si algo falla ────────────────────────────────────────────────
 *
 * Nada se cae. Si falta configuración contesta 200 diciendo qué falta; si un
 * archivo no está —un mes sin datos no genera archivo— se saltea; si Google
 * contesta 403 se dice explícitamente que el problema es el permiso de Play
 * Console, porque es el error que se va a dar y el que menos se entiende.
 *
 * El 403 casi nunca es de IAM: el bucket es de Google, no del proyecto de
 * Cloud, y el acceso se da invitando a la cuenta de servicio como usuario en
 * Play Console con "Ver información de la app" en alcance **global**. Un
 * permiso por app no alcanza.
 */

export const runtime = 'nodejs'

/** Cuatro descargas y un parseo de CSV: no entra en los 10s del default. */
export const maxDuration = 60

// ── Auth ───────────────────────────────────────────────────────────────────

/** Mismo guard que `/api/cron/daily-notifications`. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

// ── Descarga de un informe ─────────────────────────────────────────────────

interface Aviso {
  ruta: string
  motivo: string
}

/**
 * Baja el primer archivo que exista de una lista de candidatos.
 *
 * Los informes de la ficha salen desglosados por país o por fuente de tráfico
 * según la cuenta, y no hay forma de saber cuál de antemano. Se prueban en
 * orden y se usa el primero que esté; los 404 de los otros son esperables y no
 * se reportan como problema.
 */
async function bajarPrimero(
  config: ConfigPlay,
  candidatos: string[],
  avisos: Aviso[],
): Promise<Map<string, Partial<DiaPlay>> | null> {
  for (const ruta of candidatos) {
    const res = await descargarObjeto(config, ruta)

    if (res.estado === 'ok') return filasPorFecha(res.texto)
    if (res.estado === 'no_esta') continue

    if (res.estado === 'sin_permiso') {
      avisos.push({
        ruta,
        motivo:
          '403 — la cuenta de servicio no tiene acceso al bucket. Revisá que en ' +
          'Play Console esté invitada con "Ver información de la app" en alcance global.',
      })
      // Sin permiso para uno es sin permiso para todos: no tiene sentido
      // seguir probando candidatos del mismo bucket.
      return null
    }

    avisos.push({ ruta, motivo: res.detalle })
  }

  return null
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const cfg = leerConfig()
  if (!cfg.ok) {
    // 200 y no 500: la tarea no falló, todavía no está configurada. Un 500
    // diario llenaría las alertas de Vercel con algo que no es un incidente.
    console.warn('[cron/play-stats] sin configurar. Faltan:', cfg.faltan.join(', '))
    return NextResponse.json({ ok: true, configurado: false, faltan: cfg.faltan })
  }

  const { admin, failure } = requireAdminClient('cron/play-stats')
  if (failure) return failure

  const config = cfg.config
  const avisos: Aviso[] = []

  /** Acumulador por fecha: los dos informes se mezclan acá. */
  const porFecha = new Map<string, Partial<DiaPlay>>()

  const fusionar = (parcial: Map<string, Partial<DiaPlay>> | null) => {
    if (!parcial) return
    for (const [fecha, datos] of parcial) {
      porFecha.set(fecha, { ...porFecha.get(fecha), ...datos, fecha })
    }
  }

  for (const mes of mesesAConsultar()) {
    fusionar(await bajarPrimero(config, rutasInstalls(config.paquete, mes), avisos))
    fusionar(await bajarPrimero(config, rutasFicha(config.paquete, mes), avisos))
  }

  if (porFecha.size === 0) {
    console.warn('[cron/play-stats] no se pudo leer ningún informe.', avisos)
    return NextResponse.json({ ok: true, configurado: true, filas: 0, avisos })
  }

  const filas = [...porFecha.values()].map(d => ({
    package_name:     config.paquete,
    fecha:            d.fecha,
    // `?? null` y no `?? 0`: un día sin dato tiene que quedar en NULL para que
    // el gráfico dibuje un hueco y no una caída a cero que nunca pasó.
    instalaciones:    d.instalaciones ?? null,
    desinstalaciones: d.desinstalaciones ?? null,
    base_instalada:   d.baseInstalada ?? null,
    visitantes_ficha: d.visitantes ?? null,
    adquisiciones:    d.adquisiciones ?? null,
    actualizado_en:   new Date().toISOString(),
  }))

  const { error } = await admin
    .from('play_install_stats')
    .upsert(filas, { onConflict: 'package_name,fecha' })

  if (error) {
    console.error('[cron/play-stats] el upsert falló:', error.message)
    // Acá sí 500: la descarga anduvo y la escritura no. Es un problema real y
    // conviene que se vea en el panel de Vercel.
    return NextResponse.json(
      { ok: false, error: error.message, filas: filas.length },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    configurado: true,
    filas: filas.length,
    desde: filas.reduce((min, f) => (f.fecha! < min ? f.fecha! : min), filas[0].fecha!),
    hasta: filas.reduce((max, f) => (f.fecha! > max ? f.fecha! : max), filas[0].fecha!),
    avisos,
  })
}
