import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminClient } from '@/lib/service-role'
import { leerMedicionDesde } from '@/lib/analytics-medicion'

/**
 * GET /api/admin/retencion
 *
 * Las cuatro consultas de la sección de retención: cohortes por semana de
 * alta, embudo del registro, sesiones de la primera semana y comparación
 * entre los que volvieron y los que no.
 *
 * ── Alcance: web y app ────────────────────────────────────────────────────
 *
 * La app manda eventos desde la 1.0.9 (20/9), con `platform = 'mobile'`, así
 * que acá entra todo:
 *
 *   · La retención de la app se cuenta por instalación y se separa por
 *     sistema (Android e iOS), con `retencion_app_instalaciones_v2`.
 *   · La de usuarios registrados cuenta como "volvió" cualquier actividad, en
 *     la web o en la app.
 *   · El embudo del registro se separa por plataforma, y el onboarding por
 *     flujo (el corto de 3 pasos y los viejos), con
 *     `retencion_embudo_registro_v2`.
 *
 * Las dos `_v2` están en `supabase-metricas-2026-10.sql`. Mientras no se
 * corran se usan las funciones viejas, que mezclan sistemas, plataformas y
 * flujos, y la respuesta lo avisa (`separado`).
 *
 * ── Todo el cálculo vive en SQL ───────────────────────────────────────────
 *
 * Cuatro RPC, en paralelo. Son agrupamientos por usuario y por cohorte sobre
 * `analytics_events`: bajarse las filas y agrupar en JavaScript significaría
 * traer todos los eventos de todos los usuarios de los últimos noventa días
 * a una función serverless. El detalle de cada consulta está en
 * `supabase-analytics-retencion.sql`.
 *
 * ── Sin ventana configurable, a propósito ─────────────────────────────────
 *
 * Los otros dos paneles tienen filtro de 7 y 30 días porque miran tráfico. Acá
 * no tendría sentido: una cohorte necesita 30 días cumplidos para tener D30, y
 * "retención de los últimos 7 días" no es nada. Las ventanas son fijas —12
 * semanas de cohortes, 90 días para el resto— y viven en las constantes de
 * abajo.
 */

export const runtime = 'nodejs'

/** Cuántas semanas de cohortes se muestran. */
const SEMANAS = 12

/** Ventana del embudo, las sesiones y la comparación de comportamiento. */
const DIAS = 90

// ── Auth ───────────────────────────────────────────────────────────────────

/** Mismo criterio que el resto de `/api/admin`. */
async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options) } catch { /**/ } }) },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  return profile?.username === 'Ferlageok' ? user : null
}

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface CohorteRetencion {
  /** Lunes de la semana de alta, en ISO. */
  semana: string
  usuarios: number
  d1: number
  d7: number
  d30: number
  /**
   * Porcentajes. `null` cuando la cohorte todavía no cumplió el plazo: ahí no
   * hay dato, y un 0% diría "no volvió nadie" cuando lo cierto es que todavía
   * no pasó el tiempo.
   */
  d1Pct: number | null
  d7Pct: number | null
  d30Pct: number | null
}

export interface PasoRegistro {
  clave: string
  etiqueta: string
  usuarios: number
  /** Sobre el primer paso del embudo. */
  pctSobrePrimero: number | null
  /** Sobre el paso inmediatamente anterior. `null` en el primero. */
  pctSobreAnterior: number | null
}

export interface SesionesPrimeraSemana {
  usuarios: number
  promedio: number | null
  mediana: number | null
  sinActividad: number
  unaSola: number
  unaSolaYNoVolvio: number
  unaSolaYNoVolvioPct: number | null
}

export interface GrupoComportamiento {
  grupo: 'volvio' | 'no_volvio'
  usuarios: number
  paginas: number | null
  sesiones: number | null
  calificaciones: number | null
  watchlist: number | null
  resenas: number | null
  favoritos: number | null
  onboardingCompletoPct: number | null
}

export interface CohorteApp {
  /** Lunes de la semana del primer evento de esa instalación. */
  semana: string
  instalaciones: number
  d1: number
  d7: number
  d30: number
  d1Pct: number | null
  d7Pct: number | null
  d30Pct: number | null
}

export type SistemaApp = 'android' | 'ios' | 'sin_dato' | 'todos'

/** Las cohortes de la app de un sistema. `todos` sólo sin el SQL nuevo. */
export interface GrupoApp {
  sistema: SistemaApp
  cohortes: CohorteApp[]
}

export interface FlujoOnboarding {
  flujo: 'corto' | 'viejo'
  /** Escalones encadenados, con porcentajes sobre el primero del flujo. */
  pasos: PasoRegistro[]
  salteo: number
  /** El último evento del flujo en la ventana. */
  ultimo: string | null
}

export interface EmbudoPlataforma {
  plataforma: 'web' | 'app'
  /** Vio la pantalla, empezó, completó. */
  registro: PasoRegistro[]
  /** Sólo los flujos con algún evento en los últimos 30 días. */
  onboarding: FlujoOnboarding[]
}

export interface RetencionResumen {
  disponible: boolean
  motivo: 'sin_migracion' | 'sin_datos' | null
  semanas: number
  dias: number
  /** Desde cuándo hay eventos. Define qué cohortes son legibles. */
  medicionDesde: string | null
  cohortes: CohorteRetencion[]
  /**
   * Retención de la app, por semana de instalación.
   *
   * Vacío mientras no haya eventos con `platform = 'mobile'`, o si todavía no
   * se corrió `supabase-analytics-app.sql`. Es la única parte que puede faltar
   * sin que falte todo el resto, así que se trata aparte.
   */
  app: GrupoApp[]
  /** El embudo viejo, todo mezclado. Sólo si falta el SQL nuevo. */
  registro: PasoRegistro[]
  /** El embudo por plataforma y flujo. `null` si falta el SQL nuevo. */
  embudos: EmbudoPlataforma[] | null
  /**
   * `false` si alguna de las dos `_v2` todavía no existe y se usó la vieja:
   * el panel lo avisa para que no se lea como separado algo que no lo está.
   */
  separado: { app: boolean; embudo: boolean }
  sesiones: SesionesPrimeraSemana | null
  comportamiento: GrupoComportamiento[]
  generadoEn: string
}

// ── Formas del SQL ─────────────────────────────────────────────────────────

interface FilaCohorte {
  semana: string; usuarios: number; d1: number; d7: number; d30: number
  d1_maduro: boolean; d7_maduro: boolean; d30_maduro: boolean
}
interface FilaCohorteApp {
  semana: string; instalaciones: number; d1: number; d7: number; d30: number
  d1_maduro: boolean; d7_maduro: boolean; d30_maduro: boolean
}
interface FilaPaso { orden: number; clave: string; etiqueta: string; usuarios: number }
interface FilaCohorteAppV2 extends FilaCohorteApp { sistema?: string }
interface FilaPasoV2 extends FilaPaso { plataforma?: string; flujo?: string; ultimo?: string | null }
interface FilaSesiones {
  usuarios: number; sesiones_promedio: number | null; sesiones_mediana: number | null
  sin_actividad: number; una_sola: number; una_sola_y_no_volvio: number
}
interface FilaComportamiento {
  grupo: string; usuarios: number
  paginas_promedio: number | null; sesiones_promedio: number | null
  calificaciones_promedio: number | null; watchlist_promedio: number | null
  resenas_promedio: number | null; favoritos_promedio: number | null
  onboarding_completo_pct: number | null
}

// ── Ayudas ─────────────────────────────────────────────────────────────────

function porcentaje(parte: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((parte / total) * 1000) / 10
}

const num = (v: number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v)

function vacio(motivo: 'sin_migracion' | 'sin_datos'): RetencionResumen {
  return {
    disponible: false, motivo, semanas: SEMANAS, dias: DIAS, medicionDesde: null,
    cohortes: [], app: [], registro: [], embudos: null, separado: { app: false, embudo: false },
    sesiones: null, comportamiento: [],
    generadoEn: new Date().toISOString(),
  }
}

/** Falta correr `supabase-analytics-retencion.sql`. */
function faltaLaMigracion(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42883' || error.code === 'PGRST202') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('could not find the function') || msg.includes('does not exist')
}

/** Un flujo viejo sin eventos en este tiempo deja de mostrarse. */
const VIGENCIA_MS = 30 * 86_400_000

const ORDEN_SISTEMA: SistemaApp[] = ['android', 'ios', 'sin_dato', 'todos']

/**
 * Filas de una escalera → pasos con porcentajes encadenados. Las de orden 99
 * (salidas laterales, como saltear el onboarding) van al final y sin
 * porcentaje sobre el anterior.
 */
function escalera(filas: FilaPaso[]): PasoRegistro[] {
  const ordenadas = [...filas].sort((a, b) => a.orden - b.orden)
  const escalones = ordenadas.filter(f => f.orden < 99)
  const laterales = ordenadas.filter(f => f.orden >= 99)
  const primero = Number(escalones[0]?.usuarios ?? 0)
  return [
    ...escalones.map((f, i) => {
      const valor = Number(f.usuarios)
      const anterior = i === 0 ? null : Number(escalones[i - 1].usuarios)
      return {
        clave: f.clave,
        etiqueta: f.etiqueta,
        usuarios: valor,
        pctSobrePrimero: porcentaje(valor, primero),
        pctSobreAnterior: anterior === null ? null : porcentaje(valor, anterior),
      }
    }),
    ...laterales.map(f => ({
      clave: f.clave,
      etiqueta: f.etiqueta,
      usuarios: Number(f.usuarios),
      pctSobrePrimero: porcentaje(Number(f.usuarios), primero),
      pctSobreAnterior: null,
    })),
  ]
}

function cohorteApp(f: FilaCohorteApp): CohorteApp {
  const instalaciones = Number(f.instalaciones)
  return {
    semana: f.semana,
    instalaciones,
    d1: Number(f.d1),
    d7: Number(f.d7),
    d30: Number(f.d30),
    d1Pct:  f.d1_maduro  ? porcentaje(Number(f.d1),  instalaciones) : null,
    d7Pct:  f.d7_maduro  ? porcentaje(Number(f.d7),  instalaciones) : null,
    d30Pct: f.d30_maduro ? porcentaje(Number(f.d30), instalaciones) : null,
  }
}

/** Las filas de `retencion_embudo_registro_v2`, agrupadas para el panel. */
function embudosDe(filas: FilaPasoV2[]): EmbudoPlataforma[] {
  const ahora = Date.now()
  return (['web', 'app'] as const).map(plataforma => {
    const propias = filas.filter(f => f.plataforma === plataforma)
    const onboarding = (['corto', 'viejo'] as const)
      .map(flujo => {
        const delFlujo = propias.filter(f => f.flujo === flujo)
        const pasos = escalera(delFlujo)
        return {
          flujo,
          pasos: pasos.filter(p => p.clave !== 'salteo'),
          salteo: pasos.find(p => p.clave === 'salteo')?.usuarios ?? 0,
          ultimo: delFlujo.find(f => f.ultimo)?.ultimo ?? null,
        }
      })
      // Como en el panel de la app: un flujo que nadie usa hace un mes ya no
      // dice nada, y sólo empuja para abajo al que importa.
      .filter(f => f.ultimo !== null && ahora - new Date(f.ultimo).getTime() < VIGENCIA_MS)
    return {
      plataforma,
      registro: escalera(propias.filter(f => f.flujo === 'registro')),
      onboarding,
    }
  })
}

/** Una RPC nueva, y si todavía no existe, la vieja con los mismos argumentos. */
async function conCaida(
  admin: SupabaseClient,
  nueva: string,
  vieja: string,
  args: Record<string, number>,
) {
  const res = await admin.rpc(nueva, args)
  if (!res.error || !faltaLaMigracion(res.error)) return { res, nueva: true }
  return { res: await admin.rpc(vieja, args), nueva: false }
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/retencion')
  if (failure) return failure

  const [cohortesRes, appV, registroV, sesionesRes, comportamientoRes, medicionRes] =
    await Promise.all([
      admin.rpc('retencion_cohortes', { p_semanas: SEMANAS }),
      // La de la app va aparte del resto: su SQL es otro archivo y puede no
      // estar corrido todavía. Su error NO tira abajo la sección entera.
      // Las dos `_v2` caen a la vieja mientras no se corra el SQL nuevo.
      conCaida(admin, 'retencion_app_instalaciones_v2', 'retencion_app_instalaciones', { p_semanas: SEMANAS }),
      conCaida(admin, 'retencion_embudo_registro_v2', 'retencion_embudo_registro', { p_dias: DIAS }),
      admin.rpc('retencion_sesiones_primera_semana', { p_dias: DIAS }),
      admin.rpc('retencion_comportamiento', { p_dias: DIAS }),
      // Desde cuándo hay eventos, que es lo que vuelve legibles (o no) a las
      // cohortes.
      leerMedicionDesde(admin),
    ])

  // `appRes` queda afuera: su migración es un archivo aparte y su ausencia no
  // puede dejar sin datos al resto.
  const appRes = appV.res
  const registroRes = registroV.res
  const errores = [cohortesRes.error, registroRes.error, sesionesRes.error, comportamientoRes.error]
  if (errores.some(faltaLaMigracion)) {
    console.warn('[admin/retencion] falta correr supabase-analytics-retencion.sql')
    return NextResponse.json(vacio('sin_migracion'))
  }

  const primerError = errores.find(e => e)
  if (primerError) {
    console.error('[admin/retencion] consulta falló:', primerError.message)
    return NextResponse.json(vacio('sin_datos'))
  }

  // ── Cohortes ─────────────────────────────────────────────────────────
  const cohortes: CohorteRetencion[] = ((cohortesRes.data as FilaCohorte[] | null) ?? [])
    .map(f => {
      const usuarios = Number(f.usuarios)
      return {
        semana: f.semana,
        usuarios,
        d1: Number(f.d1),
        d7: Number(f.d7),
        d30: Number(f.d30),
        // La bandera de madurez manda sobre el número: una cohorte que todavía
        // no cumplió 30 días no tiene D30, y devolver 0% sería inventar.
        d1Pct:  f.d1_maduro  ? porcentaje(Number(f.d1),  usuarios) : null,
        d7Pct:  f.d7_maduro  ? porcentaje(Number(f.d7),  usuarios) : null,
        d30Pct: f.d30_maduro ? porcentaje(Number(f.d30), usuarios) : null,
      }
    })

  // ── Retención de la app ──────────────────────────────────────────────
  //
  // Tolerante a propósito: si falta `supabase-analytics-app.sql`, o si la
  // versión instrumentada todavía no se publicó, esto queda vacío y el resto
  // de la sección se muestra igual. Al revés —que la falta de la app dejara
  // sin retención de la web— sería perder lo que ya funcionaba.
  if (appRes.error && !faltaLaMigracion(appRes.error)) {
    console.error('[admin/retencion] la parte de app falló:', appRes.error.message)
  }

  const app: GrupoApp[] = []
  for (const f of (appRes.data as FilaCohorteAppV2[] | null) ?? []) {
    const sistema: SistemaApp = !appV.nueva
      ? 'todos'
      : f.sistema === 'android' || f.sistema === 'ios' ? f.sistema : 'sin_dato'
    let grupo = app.find(g => g.sistema === sistema)
    if (!grupo) { grupo = { sistema, cohortes: [] }; app.push(grupo) }
    grupo.cohortes.push(cohorteApp(f))
  }
  app.sort((a, b) => ORDEN_SISTEMA.indexOf(a.sistema) - ORDEN_SISTEMA.indexOf(b.sistema))
  for (const g of app) g.cohortes.sort((a, b) => (a.semana < b.semana ? 1 : -1))

  // ── Embudo del registro ──────────────────────────────────────────────
  const filasPaso = (registroRes.data as FilaPasoV2[] | null) ?? []
  const embudos = registroV.nueva ? embudosDe(filasPaso) : null
  const registro = registroV.nueva ? [] : escalera(filasPaso)

  // ── Sesiones de la primera semana ────────────────────────────────────
  const fs = (sesionesRes.data as FilaSesiones[] | null)?.[0]
  const sesiones: SesionesPrimeraSemana | null = fs
    ? {
        usuarios: Number(fs.usuarios),
        promedio: num(fs.sesiones_promedio),
        mediana: num(fs.sesiones_mediana),
        sinActividad: Number(fs.sin_actividad),
        unaSola: Number(fs.una_sola),
        unaSolaYNoVolvio: Number(fs.una_sola_y_no_volvio),
        unaSolaYNoVolvioPct: porcentaje(Number(fs.una_sola_y_no_volvio), Number(fs.usuarios)),
      }
    : null

  // ── Comportamiento ───────────────────────────────────────────────────
  const comportamiento: GrupoComportamiento[] =
    ((comportamientoRes.data as FilaComportamiento[] | null) ?? [])
      .map(f => ({
        grupo: f.grupo === 'volvio' ? ('volvio' as const) : ('no_volvio' as const),
        usuarios: Number(f.usuarios),
        paginas: num(f.paginas_promedio),
        sesiones: num(f.sesiones_promedio),
        calificaciones: num(f.calificaciones_promedio),
        watchlist: num(f.watchlist_promedio),
        resenas: num(f.resenas_promedio),
        favoritos: num(f.favoritos_promedio),
        onboardingCompletoPct: num(f.onboarding_completo_pct),
      }))
      // "Volvió" primero, siempre: la tabla se lee comparando contra la
      // primera columna y conviene que sea la del grupo bueno.
      .sort(a => (a.grupo === 'volvio' ? -1 : 1))

  const hayAlgo =
    cohortes.length > 0 ||
    app.length > 0 ||
    registro.some(p => p.usuarios > 0) ||
    (embudos ?? []).some(e => e.registro.some(p => p.usuarios > 0)) ||
    (sesiones?.usuarios ?? 0) > 0 ||
    comportamiento.length > 0

  const medicionDesde = medicionRes.desde

  if (!hayAlgo) {
    const sinDatos = vacio('sin_datos')
    sinDatos.medicionDesde = medicionDesde
    return NextResponse.json(sinDatos)
  }

  const resumen: RetencionResumen = {
    disponible: true,
    motivo: null,
    semanas: SEMANAS,
    dias: DIAS,
    medicionDesde,
    cohortes,
    app,
    registro,
    embudos,
    separado: { app: appV.nueva, embudo: registroV.nueva },
    sesiones,
    comportamiento,
    generadoEn: new Date().toISOString(),
  }

  return NextResponse.json(resumen)
}
