import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminClient } from '@/lib/service-role'
import { VENTANA_POR_DEFECTO, esVentana, type Ventana } from '@/lib/metricas-ventanas'
import { APP_ADMOB_POTION, MONEDA_ADMOB } from '@/lib/admob-reports'
import { getPotionClient } from '@/lib/potion-supabase'
import { contarUsuarios } from '@/lib/potion-usuarios'

/**
 * GET /api/admin/admob?dias=7|30&desde=YYYY-MM-DD
 *
 * La sección de AdMob de `/admin/potion`: la ganancia por día, los totales
 * por formato de anuncio y por país, y la ganancia por usuario por día.
 *
 * Lee de `admob_stats`, que llena `/api/cron/admob-stats` una vez por día. Acá
 * no se toca AdMob: si el cron no corrió, esto devuelve lo último que haya y
 * el panel dice de cuándo es.
 *
 * `desde` es opcional y recorta la ventana: lo pasa la página con la casilla
 * del lanzamiento, igual que al panel de Google Play.
 *
 * ── El eCPM ───────────────────────────────────────────────────────────────
 *
 * Ganancia sobre impresiones, por mil, calculado sobre los TOTALES de cada
 * grupo y no promediando eCPM diarios: un día con dos impresiones pesaría lo
 * mismo que uno con dos mil.
 *
 * ── La ganancia por usuario ───────────────────────────────────────────────
 *
 * Se cruza con los usuarios del panel (`lib/potion-usuarios.ts`): los que
 * jugaron ese día. Por día es la ganancia del día sobre los usuarios del día;
 * en el total, la ganancia de los días con usuarios sobre la suma de los
 * usuarios de esos días, por lo mismo que el eCPM.
 *
 * Los días de AdMob son los de la zona horaria de su cuenta y los de los
 * usuarios son de Argentina: el cruce día por día tiene unas horas de
 * diferencia en los bordes.
 */

export const runtime = 'nodejs'

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

export interface DiaAdMob {
  fecha: string
  /** En `moneda`. */
  ganancia: number
  impresiones: number
  /** Usuarios que jugaron ese día. `null` si no se pudo consultar el juego. */
  usuarios: number | null
  /** `null` sin usuarios ese día. */
  gananciaPorUsuario: number | null
}

export interface GrupoAdMob {
  /** El formato (`REWARDED`…) o el país (ISO, `ZZ` = desconocido). */
  clave: string
  ganancia: number
  impresiones: number
  /** Por mil impresiones. `null` sin impresiones. */
  ecpm: number | null
}

export interface AdMobResumen {
  disponible: boolean
  motivo: 'sin_migracion' | 'sin_datos' | null
  dias: Ventana
  moneda: string
  /** Cuándo corrió el cron por última vez. */
  actualizadoEn: string | null
  /** El primer y el último día copiados, sin mirar la ventana. */
  rango: { desde: string; hasta: string } | null
  serie: DiaAdMob[]
  totales: {
    ganancia: number
    impresiones: number
    ecpm: number | null
    /** Suma de los usuarios de cada día: un usuario que jugó tres días cuenta tres. */
    usuariosDia: number | null
    gananciaPorUsuarioDia: number | null
  }
  /** Recompensado, intersticial y banner siempre, aunque estén en cero; después, los que aparezcan. */
  formatos: GrupoAdMob[]
  /** De mayor a menor ganancia. */
  paises: GrupoAdMob[]
  generadoEn: string
}

interface FilaSql {
  fecha: string
  formato: string
  pais: string
  ganancia_micros: number | string
  impresiones: number
  actualizado_en: string | null
}

// ── Ayudas ─────────────────────────────────────────────────────────────────

const FORMATOS_FIJOS = ['REWARDED', 'INTERSTITIAL', 'BANNER']

/** Lo que PostgREST devuelve como mucho en un pedido, salvo que se pagine. */
const PAGINA = 1000

function faltaLaTabla(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('could not find the table')
}

/** `YYYY-MM-DD` de hace N días, contando hoy. */
function desdeHace(dias: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - (dias - 1))
  return d.toISOString().slice(0, 10)
}

function diaSiguiente(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const ecpm = (ganancia: number, impresiones: number) => (impresiones > 0 ? (ganancia / impresiones) * 1000 : null)

function agrupar(filas: FilaSql[], clave: (f: FilaSql) => string): Map<string, GrupoAdMob> {
  const grupos = new Map<string, GrupoAdMob>()
  for (const f of filas) {
    const k = clave(f)
    const g = grupos.get(k) ?? { clave: k, ganancia: 0, impresiones: 0, ecpm: null }
    g.ganancia += Number(f.ganancia_micros) / 1e6
    g.impresiones += f.impresiones
    grupos.set(k, g)
  }
  for (const g of grupos.values()) g.ecpm = ecpm(g.ganancia, g.impresiones)
  return grupos
}

function vacio(dias: Ventana, motivo: 'sin_migracion' | 'sin_datos', rango: AdMobResumen['rango'] = null): AdMobResumen {
  return {
    disponible: false, motivo, dias, moneda: MONEDA_ADMOB, actualizadoEn: null, rango,
    serie: [],
    totales: { ganancia: 0, impresiones: 0, ecpm: null, usuariosDia: null, gananciaPorUsuarioDia: null },
    formatos: [], paises: [],
    generadoEn: new Date().toISOString(),
  }
}

/** El primer y el último día de la tabla, por el índice (app_id, fecha DESC). */
async function rangoDe(admin: SupabaseClient): Promise<AdMobResumen['rango']> {
  const extremo = (ascending: boolean) =>
    admin.from('admob_stats').select('fecha').eq('app_id', APP_ADMOB_POTION)
      .order('fecha', { ascending }).limit(1).maybeSingle()
  const [primero, ultimo] = await Promise.all([extremo(true), extremo(false)])
  const desde = (primero.data as { fecha?: string } | null)?.fecha
  const hasta = (ultimo.data as { fecha?: string } | null)?.fecha
  return desde && hasta ? { desde, hasta } : null
}

/** Los usuarios por día del juego. `null` si no se pudo consultar. */
async function usuariosPorDia(): Promise<Record<string, number> | null> {
  const potion = getPotionClient()
  if (!potion) return null
  const r = await contarUsuarios(potion, 'todo', 'admin/admob')
  return r?.activosPorDia ?? null
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/admob')
  if (failure) return failure

  const crudo = Number(req.nextUrl.searchParams.get('dias'))
  const dias: Ventana = esVentana(crudo) ? crudo : VENTANA_POR_DEFECTO

  const desdeCrudo = req.nextUrl.searchParams.get('desde') ?? ''
  const piso = /^\d{4}-\d{2}-\d{2}$/.test(desdeCrudo) ? desdeCrudo : null
  const inicioVentana = desdeHace(dias)
  const desde = piso && piso > inicioVentana ? piso : inicioVentana

  const leerVentana = async (): Promise<{ filas: FilaSql[]; error: { code?: string; message: string } | null }> => {
    const filas: FilaSql[] = []
    for (let pagina = 0; ; pagina++) {
      const { data, error } = await admin
        .from('admob_stats')
        .select('fecha, formato, pais, ganancia_micros, impresiones, actualizado_en')
        .eq('app_id', APP_ADMOB_POTION)
        .gte('fecha', desde)
        .order('fecha', { ascending: true })
        .order('formato', { ascending: true })
        .order('pais', { ascending: true })
        .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1)
      if (error) return { filas, error }
      filas.push(...((data ?? []) as FilaSql[]))
      if (!data || data.length < PAGINA) break
    }
    return { filas, error: null }
  }

  const [ventana, rango, usuarios] = await Promise.all([leerVentana(), rangoDe(admin), usuariosPorDia()])

  if (faltaLaTabla(ventana.error)) {
    console.warn('[admin/admob] falta correr supabase-admob-stats.sql')
    return NextResponse.json(vacio(dias, 'sin_migracion'))
  }
  if (ventana.error) {
    console.error('[admin/admob] la consulta falló:', ventana.error.message)
    return NextResponse.json(vacio(dias, 'sin_datos', rango))
  }

  const filas = ventana.filas
  if (filas.length === 0) return NextResponse.json(vacio(dias, 'sin_datos', rango))

  // La serie va del primer día de la ventana al último copiado, sin huecos: un
  // día sin filas en el medio es un día sin impresiones, o sea cero. Los días
  // posteriores al último copiado no se muestran: todavía no se sabe.
  const porDia = agrupar(filas, f => f.fecha)
  const ultimo = filas[filas.length - 1].fecha
  const serie: DiaAdMob[] = []
  for (let dia = desde; dia <= ultimo; dia = diaSiguiente(dia)) {
    const g = porDia.get(dia)
    const ganancia = g?.ganancia ?? 0
    const u = usuarios ? (usuarios[dia] ?? 0) : null
    serie.push({
      fecha: dia,
      ganancia,
      impresiones: g?.impresiones ?? 0,
      usuarios: u,
      gananciaPorUsuario: u ? ganancia / u : null,
    })
  }

  const ganancia = serie.reduce((acc, d) => acc + d.ganancia, 0)
  const impresiones = serie.reduce((acc, d) => acc + d.impresiones, 0)
  const conUsuarios = serie.filter(d => d.usuarios)
  const usuariosDia = usuarios ? conUsuarios.reduce((acc, d) => acc + (d.usuarios ?? 0), 0) : null
  const gananciaConUsuarios = conUsuarios.reduce((acc, d) => acc + d.ganancia, 0)

  const formatos = agrupar(filas, f => f.formato)
  for (const fijo of FORMATOS_FIJOS) {
    if (!formatos.has(fijo)) formatos.set(fijo, { clave: fijo, ganancia: 0, impresiones: 0, ecpm: null })
  }
  const orden = (k: string) => (FORMATOS_FIJOS.includes(k) ? FORMATOS_FIJOS.indexOf(k) : FORMATOS_FIJOS.length)

  const resumen: AdMobResumen = {
    disponible: true,
    motivo: null,
    dias,
    moneda: MONEDA_ADMOB,
    actualizadoEn: filas.reduce<string | null>(
      (max, f) => (f.actualizado_en && (!max || f.actualizado_en > max) ? f.actualizado_en : max),
      null,
    ),
    rango,
    serie,
    totales: {
      ganancia,
      impresiones,
      ecpm: ecpm(ganancia, impresiones),
      usuariosDia,
      gananciaPorUsuarioDia: usuariosDia ? gananciaConUsuarios / usuariosDia : null,
    },
    formatos: [...formatos.values()].sort((a, b) => orden(a.clave) - orden(b.clave) || b.ganancia - a.ganancia),
    paises: [...agrupar(filas, f => f.pais).values()]
      .sort((a, b) => b.ganancia - a.ganancia || b.impresiones - a.impresiones || a.clave.localeCompare(b.clave)),
    generadoEn: new Date().toISOString(),
  }

  return NextResponse.json(resumen)
}
