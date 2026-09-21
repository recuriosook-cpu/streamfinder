import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'

/**
 * GET /api/admin/retencion
 *
 * Las cuatro consultas de la sección de retención: cohortes por semana de
 * alta, embudo del registro, sesiones de la primera semana y comparación
 * entre los que volvieron y los que no.
 *
 * ── Alcance: esto mide la WEB ─────────────────────────────────────────────
 *
 * La app de Android no manda un solo evento —no tiene analytics— así que nada
 * de acá explica las desinstalaciones. Lo que sabemos de la app es el conteo
 * agregado de Play, sin usuario y sin motivo, y eso ya está en su propio
 * panel. El panel de retención lo dice en pantalla, porque es la confusión
 * más fácil de cometer mirando estos números.
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

export interface RetencionResumen {
  disponible: boolean
  motivo: 'sin_migracion' | 'sin_datos' | null
  semanas: number
  dias: number
  /** Desde cuándo hay eventos. Define qué cohortes son legibles. */
  medicionDesde: string | null
  cohortes: CohorteRetencion[]
  registro: PasoRegistro[]
  sesiones: SesionesPrimeraSemana | null
  comportamiento: GrupoComportamiento[]
  generadoEn: string
}

// ── Formas del SQL ─────────────────────────────────────────────────────────

interface FilaCohorte {
  semana: string; usuarios: number; d1: number; d7: number; d30: number
  d1_maduro: boolean; d7_maduro: boolean; d30_maduro: boolean
}
interface FilaPaso { orden: number; clave: string; etiqueta: string; usuarios: number }
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
    cohortes: [], registro: [], sesiones: null, comportamiento: [],
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

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/retencion')
  if (failure) return failure

  const [cohortesRes, registroRes, sesionesRes, comportamientoRes, medicionRes] =
    await Promise.all([
      admin.rpc('retencion_cohortes', { p_semanas: SEMANAS }),
      admin.rpc('retencion_embudo_registro', { p_dias: DIAS }),
      admin.rpc('retencion_sesiones_primera_semana', { p_dias: DIAS }),
      admin.rpc('retencion_comportamiento', { p_dias: DIAS }),
      // Vista vieja, de `supabase-analytics-actividad.sql`: dice desde cuándo
      // hay eventos, que es lo que vuelve legibles (o no) a las cohortes.
      admin.from('analytics_medicion').select('desde').maybeSingle(),
    ])

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

  // ── Embudo del registro ──────────────────────────────────────────────
  const filasPaso = ((registroRes.data as FilaPaso[] | null) ?? [])
    .sort((a, b) => a.orden - b.orden)

  // El salteo del onboarding va con orden 99: es una salida lateral y no un
  // escalón, así que no participa de los porcentajes encadenados.
  const escalones = filasPaso.filter(f => f.orden < 99)
  const laterales = filasPaso.filter(f => f.orden >= 99)
  const primero = Number(escalones[0]?.usuarios ?? 0)

  const registro: PasoRegistro[] = [
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
    registro.some(p => p.usuarios > 0) ||
    (sesiones?.usuarios ?? 0) > 0 ||
    comportamiento.length > 0

  const medicionDesde =
    (medicionRes.data as { desde?: string } | null)?.desde ?? null

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
    registro,
    sesiones,
    comportamiento,
    generadoEn: new Date().toISOString(),
  }

  return NextResponse.json(resumen)
}
