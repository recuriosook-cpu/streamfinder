import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'hola@ferlage.com.ar'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(request: Request) {
  // Verify caller is the admin via their session token
  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = adminClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || user?.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // List all auth users
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

  // Merge with profiles for username / avatar
  const ids = users.map(u => u.id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', ids)
  const pMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  const enriched = users
    .map(u => ({
      id:           u.id,
      email:        u.email ?? null,
      created_at:   u.created_at,
      avatar_url:   pMap[u.id]?.avatar_url ?? u.user_metadata?.avatar_url ?? u.user_metadata?.picture ?? null,
      username:     pMap[u.id]?.username   ?? null,
      display_name: pMap[u.id]?.display_name ?? u.user_metadata?.full_name ?? u.user_metadata?.name ?? null,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  // Derived stats
  const now      = Date.now()
  const weekAgo  = new Date(now - 7  * 86400000)
  const monthAgo = new Date(now - 30 * 86400000)

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

  return NextResponse.json({
    users:        enriched.slice(0, 20),
    totalUsers,
    newUsersWeek,
    regMap,
  })
}
