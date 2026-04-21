import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'hola@ferlage.com.ar'

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    console.error('[admin/users] Missing Authorization header')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Service-role client — full admin access
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Verify the calling user is the admin
  const { data: { user: caller }, error: callerErr } = await supabase.auth.getUser(token)
  if (callerErr || !caller) {
    console.error('[admin/users] getUser error:', callerErr?.message)
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
  }
  if (caller.email !== ADMIN_EMAIL) {
    console.error('[admin/users] Forbidden — email:', caller.email)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // List all users from auth schema
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (error) {
    console.error('[admin/users] listUsers error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = data.users
  console.log(`[admin/users] fetched ${users.length} users`)

  // Enrich with profile data (username, display_name, avatar_url)
  const ids = users.map(u => u.id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', ids)
  const pMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  const enriched = users
    .map(u => ({
      id:             u.id,
      email:          u.email          ?? null,
      created_at:     u.created_at,
      last_sign_in_at: (u as unknown as { last_sign_in_at?: string }).last_sign_in_at ?? null,
      avatar_url:     pMap[u.id]?.avatar_url    ?? (u.user_metadata?.avatar_url as string | null) ?? (u.user_metadata?.picture as string | null) ?? null,
      username:       pMap[u.id]?.username      ?? null,
      display_name:   pMap[u.id]?.display_name  ?? (u.user_metadata?.full_name as string | null) ?? (u.user_metadata?.name as string | null) ?? null,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Derived stats
  const weekAgo  = new Date(Date.now() - 7  * 86400000)
  const monthAgo = new Date(Date.now() - 30 * 86400000)

  const totalUsers   = users.length
  const newUsersWeek = users.filter(u => new Date(u.created_at) > weekAgo).length

  const regMap: Record<string, number> = {}
  for (const u of users) {
    const d = new Date(u.created_at)
    if (d > monthAgo) {
      const key = d.toISOString().slice(0, 10)
      regMap[key] = (regMap[key] ?? 0) + 1
    }
  }

  return NextResponse.json({ users: enriched.slice(0, 20), totalUsers, newUsersWeek, regMap })
}
