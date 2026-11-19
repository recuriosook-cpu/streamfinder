import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'
import { contarDescargarPotion } from '@/lib/potion-descargar'

/**
 * GET /api/admin/potion/descargar
 *
 * Cuántas personas tocaron Potion en glynbox.com/descargar, por día y por
 * aparato. El cálculo y el criterio de "persona" están en
 * `lib/potion-descargar.ts`.
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

  const { admin, failure } = requireAdminClient('admin/potion/descargar')
  if (failure) return failure

  return NextResponse.json(await contarDescargarPotion(admin), { headers: { 'Cache-Control': 'no-store' } })
}
