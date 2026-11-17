import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPotionClient } from '@/lib/potion-supabase'
import { getAdminClient } from '@/lib/service-role'
import { armarTablero } from '@/lib/potion-tablero'

/**
 * GET /api/admin/potion/tablero
 *
 * La pestaña "Jugadores" de `/admin/potion`: tarjetas con la fecha de su
 * último dato, avisos, alertas y el listado de jugadores reales y de prueba.
 * El cálculo y las reglas están en `lib/potion-tablero.ts`.
 *
 * Lee dos proyectos de Supabase: el del juego (eventos, marcas y versiones de
 * la App Store) y el de Glynbox (lo que copian los crons de Play y de Apple).
 * Si uno no anda, su parte dice "sin dato" y el resto se ve igual.
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

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let admin = null
  try {
    admin = getAdminClient()
  } catch (e) {
    console.error('[admin/potion/tablero] sin cliente de Glynbox:', e instanceof Error ? e.message : e)
  }

  const tablero = await armarTablero(getPotionClient(), admin)
  return NextResponse.json(tablero, { headers: { 'Cache-Control': 'no-store' } })
}
