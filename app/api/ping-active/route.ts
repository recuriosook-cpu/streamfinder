import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

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

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  await adminClient
    .from('profiles')
    .update({ last_active: new Date().toISOString() })
    .eq('id', user.id)

  return NextResponse.json({ ok: true })
}
