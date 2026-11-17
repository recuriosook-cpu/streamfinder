import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { requireAdminClient } from '@/lib/service-role'
import { VENTANA_POR_DEFECTO, esVentana, type Ventana } from '@/lib/metricas-ventanas'
import { ORIGENES, ORIGEN_DESDE, type Origen } from '@/lib/origen-visitas'

/**
 * GET /api/admin/origen-visitas?dias=7|30 — bloque "De dónde vienen las
 * visitas web" de `/admin/metricas`.
 *
 * Una fila por origen: visitas, cuántas entraron a `/descargar` y cuántas
 * tocaron el botón de la tienda (en `/descargar` o en el aviso de la app).
 * Lo calcula `analytics_origen_visitas` (`supabase-origen-visitas-2026-11.sql`)
 * con las props de entrada del primer `page_view` de cada visita
 * (`lib/referencia.ts`), que existen desde el 17/11/2026. Las visitas sin ese
 * dato salen aparte como `sin_dato`.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

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

export interface FilaOrigen {
  origen: Origen
  visitas: number
  /** De esas visitas, cuántas fueron desde el celular (tablets incluidas). */
  celular: number
  /** Cuántas cargaron `/descargar` (entrando por ahí o pasando después). */
  aDescargar: number
  /** Cuántas tocaron Play Store o App Store en `/descargar`. */
  tiendaDescargar: number
  /** Cuántas tocaron "Descargar la app" en el aviso de pantalla completa. */
  tiendaAviso: number
}

export interface OrigenVisitasResumen {
  dias: Ventana
  estado: 'ok' | 'sin_migracion' | 'error'
  /** Desde qué día hay origen: las visitas de antes van en `sin_dato`. */
  desde: string
  /** En el orden de `ORIGENES`, siempre todas (en cero si no hubo). */
  filas: FilaOrigen[]
}

interface FilaSql {
  origen: string
  aparato: string
  visitas: number
  a_descargar: number
  tienda_descargar: number
  tienda_aviso: number
}

function faltaLaMigracion(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42883' || error.code === 'PGRST202') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('could not find the function') || msg.includes('does not exist')
}

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/origen-visitas')
  if (failure) return failure

  const pedido = Number(req.nextUrl.searchParams.get('dias'))
  const dias: Ventana = esVentana(pedido) ? pedido : VENTANA_POR_DEFECTO

  const filas: FilaOrigen[] = ORIGENES.map(origen => ({
    origen, visitas: 0, celular: 0, aDescargar: 0, tiendaDescargar: 0, tiendaAviso: 0,
  }))
  const salida: OrigenVisitasResumen = { dias, estado: 'ok', desde: ORIGEN_DESDE, filas }

  const { data, error } = await admin.rpc('analytics_origen_visitas', { p_dias: dias })
  if (faltaLaMigracion(error)) {
    console.warn('[admin/origen-visitas] falta correr supabase-origen-visitas-2026-11.sql')
    return NextResponse.json({ ...salida, estado: 'sin_migracion' })
  }
  if (error) {
    console.error('[admin/origen-visitas]', error.message)
    return NextResponse.json({ ...salida, estado: 'error' })
  }

  const porOrigen = new Map(filas.map(f => [f.origen, f]))
  for (const r of (data ?? []) as FilaSql[]) {
    const f = porOrigen.get(r.origen as Origen) ?? porOrigen.get('otros')!
    const n = Number(r.visitas) || 0
    f.visitas += n
    if (r.aparato === 'celular') f.celular += n
    f.aDescargar += Number(r.a_descargar) || 0
    f.tiendaDescargar += Number(r.tienda_descargar) || 0
    f.tiendaAviso += Number(r.tienda_aviso) || 0
  }

  return NextResponse.json(salida, { headers: { 'Cache-Control': 'private, no-store' } })
}
