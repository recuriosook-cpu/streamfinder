import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'
import { leerTiendas } from '@/lib/potion-tiendas'

/**
 * GET /api/admin/potion/tiendas
 *
 * Descargas, aparatos con la app y países de Potion Bottle según Google Play
 * y App Store, desde el lanzamiento. Para las tarjetas de arriba y "Dónde
 * está el juego" de `/admin/potion`. El cálculo está en `lib/potion-tiendas.ts`.
 *
 * Sale del Supabase de Glynbox, no del del juego: se ve aunque la conexión
 * con el juego falle.
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

  const { admin, failure } = requireAdminClient('admin/potion/tiendas')
  if (failure) return failure

  const tiendas = await leerTiendas(admin)
  return NextResponse.json(tiendas, { headers: { 'Cache-Control': 'no-store' } })
}
