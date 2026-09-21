import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'
import { VENTANA_POR_DEFECTO, esVentana, type Ventana } from '@/lib/metricas-ventanas'

/**
 * GET /api/admin/play?dias=7|30
 *
 * Lo que el panel de Google Play muestra: la serie diaria de instalaciones,
 * desinstalaciones, base instalada y visitantes de la ficha, más los totales
 * de la ventana.
 *
 * Lee de `play_install_stats`, que llena `/api/cron/play-stats` una vez por
 * día. Acá no se toca Google: si el cron no corrió, esto devuelve lo último
 * que haya y el panel dice de cuándo es.
 *
 * ── El único porcentaje ───────────────────────────────────────────────────
 *
 * La conversión de la ficha: de la gente que vio la ficha en Play sin tener la
 * app, qué parte la instaló. Se calcula sobre los TOTALES de la ventana y no
 * promediando las conversiones diarias, que son cosas distintas: el promedio
 * de porcentajes le da el mismo peso a un martes con tres visitantes que a un
 * sábado con trescientos.
 *
 * Es el único derivado que devuelve este endpoint. El resto son los números
 * tal como los publica Play.
 *
 * ── Por qué la base instalada no se suma ──────────────────────────────────
 *
 * Es un stock, no un flujo: "dispositivos que tienen la app y la usaron en los
 * últimos 30 días". Sumar los 30 valores diarios daría un número treinta veces
 * más grande que la realidad. Del período se toma el último día con dato, y la
 * variación contra el primero.
 */

export const runtime = 'nodejs'

// ── Auth ───────────────────────────────────────────────────────────────────

/** Mismo criterio que `app/admin/layout.tsx` y el resto de `/api/admin`. */
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

export interface DiaPlayPanel {
  fecha: string
  instalaciones: number | null
  desinstalaciones: number | null
  baseInstalada: number | null
  visitantes: number | null
  /** Instalaciones menos desinstalaciones. `null` si falta alguno de los dos. */
  neto: number | null
}

export interface PlayResumen {
  /** `false` si falta la tabla o si no hay ninguna fila todavía. */
  disponible: boolean
  motivo: 'sin_migracion' | 'sin_datos' | null
  dias: Ventana
  /** Cuándo corrió el cron por última vez. El panel avisa si quedó viejo. */
  actualizadoEn: string | null

  serie: DiaPlayPanel[]

  totales: {
    instalaciones: number
    desinstalaciones: number
    /** La suma de las dos de arriba, con signo. */
    neto: number
    visitantes: number
    /** Último valor conocido de la ventana. No se suma: es un stock. */
    baseInstalada: number | null
    /** Contra el primer día de la ventana. `null` si no hay con qué comparar. */
    baseInstaladaVariacion: number | null
    /** El único porcentaje: instalaciones sobre visitantes de la ficha. */
    conversionFichaPct: number | null
  }

  generadoEn: string
}

interface FilaSql {
  fecha: string
  instalaciones: number | null
  desinstalaciones: number | null
  base_instalada: number | null
  visitantes_ficha: number | null
  actualizado_en: string | null
}

// ── Ayudas ─────────────────────────────────────────────────────────────────

function porcentaje(parte: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((parte / total) * 1000) / 10
}

function vacio(dias: Ventana, motivo: 'sin_migracion' | 'sin_datos'): PlayResumen {
  return {
    disponible: false,
    motivo,
    dias,
    actualizadoEn: null,
    serie: [],
    totales: {
      instalaciones: 0, desinstalaciones: 0, neto: 0, visitantes: 0,
      baseInstalada: null, baseInstaladaVariacion: null, conversionFichaPct: null,
    },
    generadoEn: new Date().toISOString(),
  }
}

/** La tabla todavía no existe: falta correr `supabase-play-stats.sql`. */
function faltaLaTabla(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  // 42P01 = undefined_table. PostgREST lo devuelve como PGRST205 cuando no la
  // encuentra en su cache de esquema.
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('could not find the table')
}

/** `YYYY-MM-DD` de hace N días, en UTC, que es como guarda las fechas Play. */
function desdeHace(dias: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - (dias - 1))
  return d.toISOString().slice(0, 10)
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/play')
  if (failure) return failure

  const crudo = Number(req.nextUrl.searchParams.get('dias'))
  const dias: Ventana = esVentana(crudo) ? crudo : VENTANA_POR_DEFECTO

  const paquete = process.env.PLAY_PACKAGE_NAME?.trim() || 'com.glynbox.app'

  const { data, error } = await admin
    .from('play_install_stats')
    .select('fecha, instalaciones, desinstalaciones, base_instalada, visitantes_ficha, actualizado_en')
    .eq('package_name', paquete)
    .gte('fecha', desdeHace(dias))
    .order('fecha', { ascending: true })

  if (faltaLaTabla(error)) {
    console.warn('[admin/play] falta correr supabase-play-stats.sql')
    return NextResponse.json(vacio(dias, 'sin_migracion'))
  }

  if (error) {
    console.error('[admin/play] consulta falló:', error.message)
    return NextResponse.json(vacio(dias, 'sin_datos'))
  }

  const filas = (data ?? []) as FilaSql[]
  if (filas.length === 0) return NextResponse.json(vacio(dias, 'sin_datos'))

  const serie: DiaPlayPanel[] = filas.map(f => ({
    fecha: f.fecha,
    instalaciones: f.instalaciones,
    desinstalaciones: f.desinstalaciones,
    baseInstalada: f.base_instalada,
    visitantes: f.visitantes_ficha,
    neto:
      f.instalaciones === null || f.desinstalaciones === null
        ? null
        : f.instalaciones - f.desinstalaciones,
  }))

  const sumar = (campo: 'instalaciones' | 'desinstalaciones' | 'visitantes') =>
    serie.reduce((acc, d) => acc + (d[campo] ?? 0), 0)

  const instalaciones = sumar('instalaciones')
  const desinstalaciones = sumar('desinstalaciones')
  const visitantes = sumar('visitantes')

  // Stock, no flujo: el último día con dato y la variación contra el primero.
  const conBase = serie.filter(d => d.baseInstalada !== null)
  const baseInstalada = conBase.length > 0 ? conBase[conBase.length - 1].baseInstalada : null
  const baseInstaladaVariacion =
    conBase.length >= 2
      ? (conBase[conBase.length - 1].baseInstalada as number) - (conBase[0].baseInstalada as number)
      : null

  const actualizadoEn = filas.reduce<string | null>(
    (max, f) => (f.actualizado_en && (!max || f.actualizado_en > max) ? f.actualizado_en : max),
    null
  )

  const resumen: PlayResumen = {
    disponible: true,
    motivo: null,
    dias,
    actualizadoEn,
    serie,
    totales: {
      instalaciones,
      desinstalaciones,
      neto: instalaciones - desinstalaciones,
      visitantes,
      baseInstalada,
      baseInstaladaVariacion,
      conversionFichaPct: porcentaje(instalaciones, visitantes),
    },
    generadoEn: new Date().toISOString(),
  }

  return NextResponse.json(resumen)
}
