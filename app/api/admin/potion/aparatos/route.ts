import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPotionClient } from '@/lib/potion-supabase'

/**
 * POST /api/admin/potion/aparatos
 *
 * Mueve un aparato entre "jugadores reales" y "prueba" en `/admin/potion`.
 * Cuerpo: `{ id, clase: 'prueba' | 'real' | null, motivo? }`.
 *
 *   - `prueba` / `real`: queda marcado a mano en `potion_aparatos_marca`
 *     (proyecto del juego). La marca manda sobre la regla automática.
 *   - `null`: se borra la marca y vuelve a decidir la regla.
 *
 * Nunca toca los eventos.
 */

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

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

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let cuerpo: { id?: unknown; clase?: unknown; motivo?: unknown }
  try {
    cuerpo = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  const id = typeof cuerpo.id === 'string' ? cuerpo.id.toLowerCase() : ''
  const clase = cuerpo.clase
  if (!UUID.test(id) || !(clase === 'prueba' || clase === 'real' || clase === null)) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  }
  const motivo = typeof cuerpo.motivo === 'string' ? cuerpo.motivo.trim().slice(0, 120) || null : null

  const potion = getPotionClient()
  if (!potion) return NextResponse.json({ error: 'Falta la conexión con la base del juego' }, { status: 500 })

  const { error } = clase === null
    ? await potion.from('potion_aparatos_marca').delete().eq('instalacion', id)
    : await potion.from('potion_aparatos_marca').upsert(
        { instalacion: id, clase, motivo: motivo ?? (clase === 'prueba' ? 'Marcado a mano como de prueba' : 'Marcado a mano como real'), actualizado_en: new Date().toISOString() },
        { onConflict: 'instalacion' },
      )
  if (error) {
    console.error('[admin/potion/aparatos] no se pudo guardar:', error.message)
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
