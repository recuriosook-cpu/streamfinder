import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPotionClient } from '@/lib/potion-supabase'
import { contarReales } from '@/lib/potion-reales'

/**
 * GET /api/admin/potion/vivo
 *
 * Las cuatro tarjetas de arriba de `/admin/potion`. No recibe parámetros: no
 * dependen del rango ni de la casilla del lanzamiento, siempre cuentan desde
 * el lanzamiento. La página la pide cada 60 segundos.
 *
 * Todas cuentan sólo usuarios reales; el criterio y el cálculo están en
 * `lib/potion-reales.ts`.
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
  /** Usuarios reales desde el lanzamiento. */
  total: number
  /** Usuarios reales cuyo primer evento llegó hoy (días de Argentina). */
  nuevosHoy: number
  /** Usuarios reales con algún evento desde las 0 de hoy en Argentina. */
  jugaronHoy: number
  /** Usuarios reales con algún evento en los últimos 15 minutos. */
  jugandoAhora: number
  generadoEn: string
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const vacio: PotionVivo = {
    disponible: false, total: 0, nuevosHoy: 0, jugaronHoy: 0, jugandoAhora: 0, generadoEn: new Date().toISOString(),
  }

  const potion = getPotionClient()
  if (!potion) return NextResponse.json(vacio)

  const r = await contarReales(potion, 'todo', 'admin/potion/vivo')
  if (!r) return NextResponse.json(vacio)

  const vivo: PotionVivo = {
    disponible: true,
    total: r.total,
    nuevosHoy: r.nuevosHoy,
    jugaronHoy: r.jugaronHoy,
    jugandoAhora: r.jugandoAhora,
    generadoEn: new Date().toISOString(),
  }
  return NextResponse.json(vivo, { headers: { 'Cache-Control': 'no-store' } })
}
