import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'

// ── Auth helper ────────────────────────────────────────────────────────────

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
  const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  return profile?.username === 'Ferlageok' ? user : null
}

// ── Module-level cache (survives warm invocations, resets on cold start) ──

/**
 * Datos que sólo viven en `auth.users`: el email y la fecha de alta real.
 *
 * `profiles` no tiene `created_at`. La columna "Registro" de la tabla mostraba
 * `profiles.updated_at`, que es cuándo se tocó la fila por última vez — hoy
 * coincide con el alta porque nada escribe esa columna, pero es una coincidencia
 * frágil: alcanza con que alguien agregue un trigger de updated_at (lo normal)
 * para que todas las fechas históricas se pisen. La fecha buena es ésta.
 */
interface AuthInfo { email: string | null; createdAt: string | null }
interface AuthCache { map: Record<string, AuthInfo>; ts: number }
let authCache: AuthCache | null = null
const EMAIL_TTL = 90_000 // 90 seconds

async function getAuthMap(admin: SupabaseClient): Promise<Record<string, AuthInfo>> {
  if (authCache && Date.now() - authCache.ts < EMAIL_TTL) return authCache.map

  const map: Record<string, AuthInfo> = {}
  let page = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data?.users?.length) break
    for (const u of data.users) {
      map[u.id] = { email: u.email ?? null, createdAt: u.created_at ?? null }
    }
    if (data.users.length < 1000) break
    page++
  }

  authCache = { map, ts: Date.now() }
  return map
}



// ── GET /api/admin/users ───────────────────────────────────────────────────

export async function GET(req: Request) {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/users')
  if (failure) return failure

  const { searchParams } = new URL(req.url)
  const page    = Math.max(0, parseInt(searchParams.get('page') ?? '0'))
  const limit   = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '50')), 100)
  const search  = (searchParams.get('search') ?? '').trim()
  const country = searchParams.get('country') ?? ''
  const blocked = searchParams.get('blocked') ?? 'all'   // all | yes | no
  const sortBy  = searchParams.get('sort_by') ?? 'auth_created_at'
  const sortDir = searchParams.get('sort_dir') ?? 'desc'

  // Column sorts supported natively by PostgREST.
  // `auth_created_at` no está acá a propósito: vive en auth.users, no en
  // profiles, así que PostgREST no lo puede ordenar y cae en el sort en JS.
  const DB_SORT_COLS = ['username', 'display_name', 'updated_at', 'last_active', 'points', 'level']
  const useDbSort = DB_SORT_COLS.includes(sortBy)

  // 1. Get auth map (cached): email + fecha de alta real
  const authMap = await getAuthMap(admin)

  // 2. Resolve email-search user IDs
  let emailMatchIds: string[] | null = null
  if (search) {
    const q = search.toLowerCase()
    emailMatchIds = Object.entries(authMap)
      .filter(([, info]) => (info.email ?? '').toLowerCase().includes(q))
      .map(([id]) => id)
  }

  // 3. Build base profile query (no range yet — need count first or sort-in-js)
  type FilteredQuery = ReturnType<ReturnType<typeof admin.from>['select']>

  function applyFilters(q: FilteredQuery): FilteredQuery {
    if (country) q = q.eq('country', country)
    if (blocked === 'yes') q = q.eq('blocked', true)
    if (blocked === 'no')  q = q.or('blocked.is.null,blocked.eq.false')
    if (search) {
      const escaped = search.replace(/[%_]/g, '\\$&')
      const nameFilter = `username.ilike.%${escaped}%,display_name.ilike.%${escaped}%`
      if (emailMatchIds && emailMatchIds.length > 0) {
        q = q.or(`${nameFilter},id.in.(${emailMatchIds.join(',')})`)
      } else if (emailMatchIds && emailMatchIds.length === 0 && search.includes('@')) {
        // Search looks like an email, no email matches → force empty
        q = q.eq('id', '00000000-0000-0000-0000-000000000000')
      } else {
        q = q.or(nameFilter)
      }
    }
    return q
  }

  // ── Case A: sort by DB column → use server-side sort + pagination ──────
  if (useDbSort) {
    const countQ = applyFilters(admin.from('profiles').select('*', { count: 'exact', head: true }))
    const { count, error: cErr } = await countQ
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

    const from = page * limit
    const to   = from + limit - 1
    const dataQ = applyFilters(
      admin.from('profiles').select('*')
    )
      .order(sortBy, { ascending: sortDir === 'asc' })
      .range(from, to)

    const { data: profiles, error: dErr } = await dataQ
    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })

    const result = await enrichProfiles(admin, authMap, (profiles ?? []) as ProfileRow[])
    return jsonResponse(result, count ?? 0, page, limit)
  }

  // ── Case B: sort by computed count → fetch all matching profiles ────────
  // (review_count, list_count, follow_count) — we sort in JS then slice
  // Fetch in batches of 1000
  const allProfiles: ProfileRow[] = []
  {
    let from = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await applyFilters(
        admin.from('profiles').select('*')
      ).order('updated_at', { ascending: false }).range(from, from + 999)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data?.length) break
      allProfiles.push(...(data as ProfileRow[]))
      if (data.length < 1000) break
      from += 1000
    }
  }

  const enriched = await enrichProfiles(admin, authMap, allProfiles)

  // Sort by computed field.
  // `auth_created_at` es un ISO string y el resto son contadores, así que hay
  // que comparar distinto según el tipo o las fechas salen todas en 0.
  enriched.sort((a, b) => {
    const av = a[sortBy as keyof typeof a]
    const bv = b[sortBy as keyof typeof b]
    if (typeof av === 'string' || typeof bv === 'string') {
      const as = (av as string) ?? ''
      const bs = (bv as string) ?? ''
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
    }
    const an = (av as number) ?? 0
    const bn = (bv as number) ?? 0
    return sortDir === 'asc' ? an - bn : bn - an
  })

  const total  = enriched.length
  const sliced = enriched.slice(page * limit, (page + 1) * limit)

  return jsonResponse(sliced, total, page, limit)
}

// ── Helpers ───────────────────────────────────────────────────────────────

type ProfileRow = Record<string, unknown> & { id: string }

async function enrichProfiles(
  admin: SupabaseClient,
  authMap: Record<string, AuthInfo>,
  profiles: ProfileRow[]
) {
  if (!profiles.length) return []

  const ids = profiles.map(p => p.id)

  const [reviewRows, listRows, followRows] = await Promise.all([
    admin.from('reviews').select('user_id').in('user_id', ids),
    admin.from('lists').select('user_id').in('user_id', ids),
    admin.from('follows').select('following_id').in('following_id', ids),
  ])

  const revCounts: Record<string, number> = {}
  for (const r of (reviewRows.data ?? []) as { user_id: string }[]) {
    revCounts[r.user_id] = (revCounts[r.user_id] ?? 0) + 1
  }
  const lstCounts: Record<string, number> = {}
  for (const l of (listRows.data ?? []) as { user_id: string }[]) {
    lstCounts[l.user_id] = (lstCounts[l.user_id] ?? 0) + 1
  }
  const flwCounts: Record<string, number> = {}
  for (const f of (followRows.data ?? []) as { following_id: string }[]) {
    flwCounts[f.following_id] = (flwCounts[f.following_id] ?? 0) + 1
  }

  return profiles.map(p => ({
    ...p,
    email:           authMap[p.id]?.email ?? null,
    // Fecha de alta real. La UI muestra ésta en la columna "Registro".
    auth_created_at: authMap[p.id]?.createdAt ?? null,
    review_count:    revCounts[p.id] ?? 0,
    list_count:      lstCounts[p.id] ?? 0,
    follow_count:    flwCounts[p.id] ?? 0,
  }))
}

function jsonResponse(
  users: unknown[],
  total: number,
  page: number,
  limit: number
) {
  return NextResponse.json(
    { users, total, page, limit },
    {
      headers: {
        'Cache-Control': 'private, max-age=60',
      },
    }
  )
}
