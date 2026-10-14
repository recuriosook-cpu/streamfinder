import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminClient } from '@/lib/service-role'
import {
  APPS_PLAY,
  leerConfig,
  descargarObjeto,
  filasPorFecha,
  filasPorFechaYPais,
  mesesAConsultar,
  rutasInstalls,
  rutaInstallsPorPais,
  rutasFicha,
  type AppPlay,
  type ConfigPlay,
  type DiaPlay,
  type DiaPaisPlay,
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
 * Por cada app de `APPS_PLAY` (Glynbox y Potion Bottle), dos meses -el
 * corriente y el anterior- de tres archivos: instalaciones, la ficha, y las
 * instalaciones por país. El mes anterior no es por las dudas — el día 1 el mes
 * en curso tiene una sola fila, y Google además sigue corrigiendo los últimos
 * días del mes cerrado durante una semana larga.
 *
 * Cada app se copia por su lado, y dentro de cada app lo diario y lo de los
 * países también: si una parte falla, la otra se guarda igual. Lo diario va a
 * `play_install_stats` y lo de los países a `play_install_stats_pais`.
 *
 * ── Por qué es idempotente ────────────────────────────────────────────────
 *
 * Todo termina en un `upsert` por (paquete, fecha), o (paquete, fecha, país). Correrlo dos veces el
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

/** Unas seis descargas y sus parseos por app: no entra en los 10s del default. */
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

// ── Una app ────────────────────────────────────────────────────────────────

/** La tabla de países todavía no existe: falta correr la migración. */
function faltaLaTabla(error: { code?: string; message?: string }): boolean {
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('could not find the table')
}

/**
 * Filas por pedido de upsert. Los países son unas decenas por día y se copian
 * dos meses: miles de filas, que en un solo pedido rozan el límite de cuerpo
 * de PostgREST.
 */
const LOTE = 1000

type ResultadoPaises =
  | { filas: number; error?: string }
  /** Falta correr `supabase-play-stats-paises-2026-10.sql`. No es un 500. */
  | { filas: 0; sinMigracion: true }

type ResultadoApp =
  | { configurado: false; faltan: string[] }
  | {
      configurado: true
      paquete: string
      filas: number
      desde?: string
      hasta?: string
      paises: ResultadoPaises
      avisos: Aviso[]
      error?: string
    }

/** Los días de la app, de los dos informes sin desglose. */
async function copiarDias(
  admin: SupabaseClient,
  app: AppPlay,
  config: ConfigPlay,
  avisos: Aviso[],
): Promise<{ filas: number; desde?: string; hasta?: string; error?: string }> {
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
    console.warn(`[cron/play-stats] ${app}: no se pudo leer ningún informe.`, avisos)
    return { filas: 0 }
  }

  const filas = [...porFecha.values()].map(d => ({
    package_name:     config.paquete,
    fecha:            d.fecha!,
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
    console.error(`[cron/play-stats] ${app}: el upsert falló:`, error.message)
    return { filas: filas.length, error: error.message }
  }

  return {
    filas: filas.length,
    desde: filas.reduce((min, f) => (f.fecha < min ? f.fecha : min), filas[0].fecha),
    hasta: filas.reduce((max, f) => (f.fecha > max ? f.fecha : max), filas[0].fecha),
  }
}

/** Los días de la app por país, del informe de instalaciones desglosado. */
async function copiarPaises(
  admin: SupabaseClient,
  app: AppPlay,
  config: ConfigPlay,
  avisos: Aviso[],
): Promise<ResultadoPaises> {
  const dias: DiaPaisPlay[] = []

  for (const mes of mesesAConsultar()) {
    const ruta = rutaInstallsPorPais(config.paquete, mes)
    const res = await descargarObjeto(config, ruta)
    if (res.estado === 'ok') dias.push(...filasPorFechaYPais(res.texto))
    else if (res.estado === 'sin_permiso') avisos.push({ ruta, motivo: '403 — sin acceso al bucket.' })
    else if (res.estado === 'error') avisos.push({ ruta, motivo: res.detalle })
    // `no_esta`: un mes sin datos no genera archivo. Normal.
  }

  if (dias.length === 0) return { filas: 0 }

  const ahora = new Date().toISOString()
  const filas = dias.map(d => ({
    package_name:     config.paquete,
    fecha:            d.fecha,
    pais:             d.pais,
    instalaciones:    d.instalaciones,
    desinstalaciones: d.desinstalaciones,
    base_instalada:   d.baseInstalada,
    actualizado_en:   ahora,
  }))

  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await admin
      .from('play_install_stats_pais')
      .upsert(filas.slice(i, i + LOTE), { onConflict: 'package_name,fecha,pais' })

    if (error && faltaLaTabla(error)) {
      console.warn('[cron/play-stats] falta correr supabase-play-stats-paises-2026-10.sql')
      return { filas: 0, sinMigracion: true }
    }
    if (error) {
      console.error(`[cron/play-stats] ${app}: el upsert de países falló:`, error.message)
      return { filas: i, error: error.message }
    }
  }

  return { filas: filas.length }
}

async function copiarApp(admin: SupabaseClient, app: AppPlay): Promise<ResultadoApp> {
  const cfg = leerConfig(app)
  if (!cfg.ok) {
    console.warn(`[cron/play-stats] ${app} sin configurar. Faltan:`, cfg.faltan.join(', '))
    return { configurado: false, faltan: cfg.faltan }
  }

  const avisos: Aviso[] = []
  const dias = await copiarDias(admin, app, cfg.config, avisos)
  const paises = await copiarPaises(admin, app, cfg.config, avisos)

  return { configurado: true, paquete: cfg.config.paquete, ...dias, paises, avisos }
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { admin, failure } = requireAdminClient('cron/play-stats')
  if (failure) return failure

  const apps = {} as Record<AppPlay, ResultadoApp>
  for (const app of APPS_PLAY) apps[app] = await copiarApp(admin, app)

  const resultados = Object.values(apps)

  // Sin configurar es 200 y no 500: la tarea no falló, todavía no está
  // configurada. Un 500 diario llenaría las alertas de Vercel con algo que no
  // es un incidente. Sí 500 si una descarga anduvo y la escritura no: es un
  // problema real y conviene que se vea en el panel de Vercel.
  const fallo = resultados.some(
    r => r.configurado && (r.error || ('error' in r.paises && r.paises.error)),
  )

  return NextResponse.json(
    { ok: !fallo, configurado: resultados.some(r => r.configurado), apps },
    { status: fallo ? 500 : 200 },
  )
}
