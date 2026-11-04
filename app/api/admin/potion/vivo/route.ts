import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPotionClient } from '@/lib/potion-supabase'
import { contarUsuarios, type PotionUsuarios } from '@/lib/potion-usuarios'
import { getAdminClient } from '@/lib/service-role'
import { iosDesdeMs } from '@/lib/potion-tiendas'

/**
 * GET /api/admin/potion/vivo
 *
 * Las tarjetas de jugadores de arriba de `/admin/potion`, con lo de ayer a
 * esta misma hora para comparar y los aparatos iOS activos en 30 días (lo que
 * se muestra como "tienen la app" en iPhone: Apple no lo informa). No recibe parámetros: no
 * dependen del rango ni de la casilla del lanzamiento, siempre cuentan desde
 * el lanzamiento. La página la pide cada 60 segundos.
 *
 * El criterio de usuario y el cálculo están en `lib/potion-usuarios.ts`.
 */

export const runtime = 'nodejs'

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

export interface PotionVivo {
  disponible: boolean
  /** Usuarios desde el lanzamiento. */
  total: number
  /** Usuarios cuyo primer evento llegó hoy (días de Argentina). */
  nuevosHoy: number
  /** Usuarios con algún evento desde las 0 de hoy en Argentina. */
  jugaronHoy: number
  /** Usuarios con algún evento en los últimos 15 minutos. */
  jugandoAhora: number
  /** Ayer hasta esta misma hora. */
  ayer: PotionUsuarios['ayer']
  ios: PotionUsuarios['ios'] & {
    /** Desde cuándo está en la App Store. `null`: todavía no salió. */
    desde: string | null
  }
  generadoEn: string
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const vacio: PotionVivo = {
    disponible: false, total: 0, nuevosHoy: 0, jugaronHoy: 0, jugandoAhora: 0,
    ayer: { nuevos: 0, jugaron: 0, jugandoAhora: 0 },
    ios: { activos30: 0, activos30Hace7: 0, dePrueba: 0, desde: null },
    generadoEn: new Date().toISOString(),
  }

  const potion = getPotionClient()
  if (!potion) return NextResponse.json(vacio)

  // La fecha de salida en la App Store vive en el Supabase de Glynbox. Si no
  // se puede leer, se toma como "todavía no salió": iOS en 0, nunca un error.
  let iosDesde: number | null = null
  try {
    iosDesde = await iosDesdeMs(getAdminClient())
  } catch {
    iosDesde = null
  }

  const r = await contarUsuarios(potion, 'todo', 'admin/potion/vivo', iosDesde)
  if (!r) return NextResponse.json(vacio)

  const vivo: PotionVivo = {
    disponible: true,
    total: r.total,
    nuevosHoy: r.nuevosHoy,
    jugaronHoy: r.jugaronHoy,
    jugandoAhora: r.jugandoAhora,
    ayer: r.ayer,
    ios: { ...r.ios, desde: iosDesde === null ? null : new Date(iosDesde).toISOString() },
    generadoEn: new Date().toISOString(),
  }
  return NextResponse.json(vivo, { headers: { 'Cache-Control': 'no-store' } })
}
