import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'

export async function POST() {
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
  if (!user) return NextResponse.json({ ok: false })

  const { data: profile } = await supabase
    .from('profiles')
    .select('last_active')
    .eq('id', user.id)
    .single()

  const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
  if (profile?.last_active && profile.last_active > oneHourAgo) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { admin: adminClient, failure } = requireAdminClient('ping-active')
  if (failure) return failure

  const { error } = await adminClient
    .from('profiles')
    .update({ last_active: new Date().toISOString() })
    .eq('id', user.id)

  // Antes esto se ignoraba: el update fallaba con 401 por la key rota y la ruta
  // contestaba ok igual, así que `last_active` quedó NULL en todos los perfiles
  // sin que nada lo dijera.
  if (error) {
    console.error('[ping-active] no se pudo actualizar last_active:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
