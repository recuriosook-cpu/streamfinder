import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPotionClient } from '@/lib/potion-supabase'
import { calcularCompras, comprasVacias } from '@/lib/potion-compras'
import { esRango, RANGO_POR_DEFECTO, type Rango } from '@/lib/potion-panel'

/**
 * GET /api/admin/potion/compras?rango=hoy|7d|todo&lanzamiento=1
 *
 * La sección "Compras" de `/admin/potion`: lee `potion_compras` del Supabase
 * DEL JUEGO con su clave secreta y devuelve los números ya calculados. Mismos
 * filtros que la ruta principal. El criterio y la estimación en dólares están
 * en `lib/potion-compras.ts`.
 *
 * Va aparte de `/api/admin/potion` para que la sección se vea aunque falte la
 * RPC `potion_panel` en el proyecto del juego.
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

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const params = req.nextUrl.searchParams
  const pedido = params.get('rango')
  const rango: Rango = esRango(pedido) ? pedido : RANGO_POR_DEFECTO
  const desdeLanzamiento = params.get('lanzamiento') === '1'

  const potion = getPotionClient()
  if (!potion) {
    console.error('[admin/potion/compras] faltan POTION_SUPABASE_URL o POTION_SUPABASE_SECRET')
    return NextResponse.json(comprasVacias('sin_configurar'))
  }

  const compras = await calcularCompras(potion, rango, desdeLanzamiento, 'admin/potion/compras')
  return NextResponse.json(compras ?? comprasVacias('error'))
}
