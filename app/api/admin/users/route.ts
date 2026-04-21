import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'hola@ferlage.com.ar'

export async function GET(request: Request) {
  // ── Debug: confirm env vars are present ───────────────────────
  const srvKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  console.log('[admin/users] SUPABASE_SERVICE_ROLE_KEY present:', !!srvKey, '| first 8 chars:', srvKey?.slice(0, 8) ?? 'MISSING')
  console.log('[admin/users] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30))

  const token = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) {
    console.error('[admin/users] No Authorization header')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!srvKey) {
    console.error('[admin/users] SUPABASE_SERVICE_ROLE_KEY is undefined — check Vercel env vars')
    return NextResponse.json({ error: 'Server misconfiguration: missing service role key' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    srvKey,
  )

  // ── Verify caller is the admin ────────────────────────────────
  const { data: { user: caller }, error: callerErr } = await supabase.auth.getUser(token)
  if (callerErr || !caller) {
    console.error('[admin/users] getUser failed:', callerErr?.message)
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
  }
  if (caller.email !== ADMIN_EMAIL) {
    console.error('[admin/users] Forbidden — email:', caller.email)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Strategy A: auth.admin.listUsers() ────────────────────────
  const { data: authData, error: authListErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })

  if (!authListErr && authData?.users?.length >= 0) {
    console.log('[admin/users] strategy A — auth.admin.listUsers() returned', authData.users.length, 'users')
    const users = authData.users

    // Merge with profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', users.map(u => u.id))
    const pMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

    const enriched = users
      .map(u => ({
        id:              u.id,
        email:           u.email ?? null,
        created_at:      u.created_at,
        last_sign_in_at: (u as unknown as { last_sign_in_at?: string }).last_sign_in_at ?? null,
        avatar_url:      pMap[u.id]?.avatar_url   ?? (u.user_metadata?.avatar_url as string | null) ?? (u.user_metadata?.picture as string | null) ?? null,
        username:        pMap[u.id]?.username      ?? null,
        display_name:    pMap[u.id]?.display_name  ?? (u.user_metadata?.full_name as string | null) ?? (u.user_metadata?.name as string | null) ?? null,
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json(buildResponse(enriched, users.map(u => u.created_at)))
  }

  // ── Strategy B: fall back to profiles table ───────────────────
  console.warn('[admin/users] strategy A failed:', authListErr?.message, '— falling back to profiles table')

  const { data: profiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, created_at')
    .order('created_at', { ascending: false })

  if (profilesErr) {
    console.error('[admin/users] profiles fallback also failed:', profilesErr.message)
    return NextResponse.json({ error: profilesErr.message }, { status: 500 })
  }

  console.log('[admin/users] strategy B — profiles returned', profiles?.length ?? 0, 'rows')

  const enriched = (profiles ?? []).map(p => ({
    id:              p.id,
    email:           null,          // not available from profiles
    created_at:      p.created_at,
    last_sign_in_at: null,
    avatar_url:      p.avatar_url   ?? null,
    username:        p.username     ?? null,
    display_name:    p.display_name ?? null,
  }))

  return NextResponse.json(buildResponse(enriched, (profiles ?? []).map(p => p.created_at)))
}

// ── Shared stats builder ───────────────────────────────────────────────────

function buildResponse(
  enriched: { created_at: string }[],
  allCreatedAt: string[],
) {
  const weekAgo  = new Date(Date.now() - 7  * 86400000)
  const monthAgo = new Date(Date.now() - 30 * 86400000)

  const totalUsers   = allCreatedAt.length
  const newUsersWeek = allCreatedAt.filter(d => new Date(d) > weekAgo).length

  const regMap: Record<string, number> = {}
  for (const d of allCreatedAt) {
    const date = new Date(d)
    if (date > monthAgo) {
      const key = date.toISOString().slice(0, 10)
      regMap[key] = (regMap[key] ?? 0) + 1
    }
  }

  return {
    users: enriched.slice(0, 20),
    totalUsers,
    newUsersWeek,
    regMap,
  }
}
