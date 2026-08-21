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



/**
 * Desde cuándo existe la medición de actividad.
 *
 * Es un dato de toda la base, no por usuario, y cambia una vez en la vida (o
 * nunca). Se cachea igual que el mapa de auth para no pagar la consulta en cada
 * página de la tabla.
 */
interface Medicion {
  desde: string | null
  eventos_humanos: number
  usuarios_con_datos: number
  /** `false` cuando la vista todavía no existe en la base. Ver abajo. */
  disponible: boolean
}
interface MedicionCache { data: Medicion; ts: number }
let medicionCache: MedicionCache | null = null
const MEDICION_TTL = 300_000 // 5 minutos

const MEDICION_VACIA: Medicion = {
  desde: null, eventos_humanos: 0, usuarios_con_datos: 0, disponible: false,
}

async function getMedicion(admin: SupabaseClient): Promise<Medicion> {
  if (medicionCache && Date.now() - medicionCache.ts < MEDICION_TTL) {
    return medicionCache.data
  }

  const { data, error } = await admin
    .from('analytics_medicion')
    .select('desde, eventos_humanos, usuarios_con_datos')
    .maybeSingle()

  // Si la vista no está creada todavía, el panel tiene que seguir funcionando:
  // las columnas de tiempo muestran "sin datos" y el resto de la tabla anda
  // igual. Un panel de admin roto entero porque falta una vista de métricas
  // sería un mal negocio.
  const result: Medicion = error || !data
    ? MEDICION_VACIA
    : {
        desde: (data.desde as string | null) ?? null,
        eventos_humanos: Number(data.eventos_humanos ?? 0),
        usuarios_con_datos: Number(data.usuarios_con_datos ?? 0),
        disponible: true,
      }

  medicionCache = { data: result, ts: Date.now() }
  return result
}

/**
 * Trae filas de una tabla o vista para un conjunto de usuarios.
 *
 * Existe para no repetir el patrón que ya tiene `enrichProfiles` con `reviews`,
 * `lists` y `follows`, que se rompe de dos formas distintas cuando la base
 * crece y ninguna de las dos avisa:
 *
 *   1. **El tope de filas.** PostgREST devuelve 1000 filas por defecto y no
 *      dice que cortó. Con 116 usuarios no se nota; con 5000, los conteos
 *      empiezan a mentir para abajo en silencio.
 *
 *   2. **El largo de la URL.** Un `.in()` con 5000 UUIDs son ~185KB de
 *      querystring. Eso revienta contra el límite del servidor bastante antes
 *      de llegar a los 5000.
 *
 * Por eso hay dos caminos. Con pocos ids —el caso normal: una página de 50— va
 * un `.in()` y listo, UNA sola consulta. Con muchos, filtrar por id sale más
 * caro que traer la tabla entera, así que se trae completa y se filtra en JS.
 *
 * Las dos ramas paginan con `.range()`, que es lo que resuelve el punto 1.
 */
const MAX_IDS_EN_URL = 300
const LOTE = 1000

async function fetchForUsers<T extends { user_id: string }>(
  admin: SupabaseClient,
  table: string,
  columns: string,
  ids: string[]
): Promise<T[]> {
  if (!ids.length) return []

  const usarFiltro = ids.length <= MAX_IDS_EN_URL
  const wanted = usarFiltro ? null : new Set(ids)
  const out: T[] = []

  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = admin.from(table).select(columns)
    if (usarFiltro) q = q.in('user_id', ids)

    const { data, error } = await q.range(from, from + LOTE - 1)

    // Un error acá no puede tumbar el panel entero: si la vista o la tabla no
    // existen todavía, se devuelve lo que haya y las columnas quedan vacías.
    if (error) {
      console.error(`[admin/users] ${table}:`, error.message)
      break
    }
    if (!data?.length) break

    // `select()` con un string armado en runtime no le deja inferir la forma a
    // PostgREST, así que devuelve un tipo genérico. El doble casteo es el
    // precio de tener UN solo helper para dos tablas distintas.
    for (const row of data as unknown as T[]) {
      if (!wanted || wanted.has(row.user_id)) out.push(row)
    }

    if (data.length < LOTE) break
    from += LOTE
  }

  return out
}

/**
 * Cronómetro por tramos, para el header `Server-Timing`.
 *
 * Existe porque la pregunta "¿cuánto tarda este endpoint?" no se puede
 * contestar desde afuera: la ruta necesita cookie de admin y service role, así
 * que no hay forma de cronometrarla con un curl. Con esto, el número real —con
 * la base real y la latencia real— se lee en la pestaña Network del navegador,
 * abierto el panel, sin instrumentar nada a mano cada vez.
 *
 * Es barato: cuatro `Date.now()` y un header. Se deja puesto.
 */
function crono() {
  const t0 = Date.now()
  let last = t0
  const marks: string[] = []

  return {
    /** Cierra un tramo y abre el siguiente. */
    mark(nombre: string) {
      const ahora = Date.now()
      marks.push(`${nombre};dur=${ahora - last}`)
      last = ahora
    },
    header(): string {
      return [...marks, `total;dur=${Date.now() - t0}`].join(', ')
    },
  }
}

// ── GET /api/admin/users ───────────────────────────────────────────────────

export async function GET(req: Request) {
  const t = crono()
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  t.mark('auth')

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
  //    y desde cuándo existe la medición de actividad (también cacheado).
  const [authMap, medicion] = await Promise.all([
    getAuthMap(admin),
    getMedicion(admin),
  ])
  t.mark('authmap')

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
    t.mark('profiles')

    const result = await enrichProfiles(admin, authMap, (profiles ?? []) as ProfileRow[])
    t.mark('enrich')

    return jsonResponse(result, count ?? 0, page, limit, medicion, t.header())
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

  t.mark('profiles')

  const enriched = await enrichProfiles(admin, authMap, allProfiles)
  t.mark('enrich')

  // Sort by computed field.
  // `auth_created_at` es un ISO string y el resto son contadores, así que hay
  // que comparar distinto según el tipo o las fechas salen todas en 0.
  enriched.sort((a, b) => {
    const av = a[sortBy as keyof typeof a]
    const bv = b[sortBy as keyof typeof b]

    // `tiene_app` es booleano. Sin este caso caía en la rama numérica, donde
    // `true - false` es NaN y el sort queda en el orden que estaba.
    if (typeof av === 'boolean' || typeof bv === 'boolean') {
      const ab = av ? 1 : 0
      const bb = bv ? 1 : 0
      return sortDir === 'asc' ? ab - bb : bb - ab
    }

    if (typeof av === 'string' || typeof bv === 'string') {
      const as = (av as string) ?? ''
      const bs = (bv as string) ?? ''
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
    }

    // `segundos_totales` y `sesiones` son `null` cuando no hay datos, no 0.
    // Los nulos van siempre al final, ordene como ordene: son "sin datos", y
    // "sin datos" no es ni el máximo ni el mínimo. Mezclarlos con los ceros
    // sería volver a la mentira que la columna trata de no contar.
    const aNull = av === null || av === undefined
    const bNull = bv === null || bv === undefined
    if (aNull && bNull) return 0
    if (aNull) return 1
    if (bNull) return -1

    const an = av as number
    const bn = bv as number
    return sortDir === 'asc' ? an - bn : bn - an
  })

  const total  = enriched.length
  const sliced = enriched.slice(page * limit, (page + 1) * limit)

  t.mark('sort')

  return jsonResponse(sliced, total, page, limit, medicion, t.header())
}

// ── Helpers ───────────────────────────────────────────────────────────────

type ProfileRow = Record<string, unknown> & { id: string }

/** Una fila de `user_devices`. El schema real, confirmado contra la base. */
interface DeviceRow {
  user_id: string
  platform: string | null
  last_seen_at: string | null
}

/** Una fila de la vista `user_activity_time`. Ya viene agregada por usuario. */
interface ActivityRow {
  user_id: string
  segundos_totales: number
  sesiones: number
  ultima_actividad: string | null
}

async function enrichProfiles(
  admin: SupabaseClient,
  authMap: Record<string, AuthInfo>,
  profiles: ProfileRow[]
) {
  if (!profiles.length) return []

  const ids = profiles.map(p => p.id)

  const [reviewRows, listRows, followRows, deviceRows, activityRows] = await Promise.all([
    admin.from('reviews').select('user_id').in('user_id', ids),
    admin.from('lists').select('user_id').in('user_id', ids),
    admin.from('follows').select('following_id').in('following_id', ids),

    // UNA consulta para todos los usuarios de la página, no una por usuario.
    // Devuelve una fila por dispositivo y se agrupa acá abajo.
    fetchForUsers<DeviceRow>(
      admin, 'user_devices', 'user_id, platform, last_seen_at', ids
    ),

    // Idem: una consulta a la vista, que ya viene agregada por usuario (una
    // fila por usuario, o ninguna si nunca generó un evento).
    fetchForUsers<ActivityRow>(
      admin, 'user_activity_time', 'user_id, segundos_totales, sesiones, ultima_actividad', ids
    ),
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

  // ── Dispositivos ────────────────────────────────────────────────────────
  // Una entrada por usuario, armada a partir de sus filas de `user_devices`.
  const devices: Record<string, { plataformas: string[]; ultimo: string | null }> = {}
  for (const d of deviceRows) {
    const entry = devices[d.user_id] ?? { plataformas: [], ultimo: null }

    // Alguien puede tener el mismo sistema en dos teléfonos: la columna muestra
    // qué plataformas usa, no cuántos aparatos tiene.
    if (d.platform && !entry.plataformas.includes(d.platform)) {
      entry.plataformas.push(d.platform)
    }
    if (d.last_seen_at && (!entry.ultimo || d.last_seen_at > entry.ultimo)) {
      entry.ultimo = d.last_seen_at
    }

    devices[d.user_id] = entry
  }

  // ── Actividad ───────────────────────────────────────────────────────────
  const activity: Record<string, ActivityRow> = {}
  for (const a of activityRows) activity[a.user_id] = a

  return profiles.map(p => {
    const dev = devices[p.id]
    const act = activity[p.id]

    return {
      ...p,
      email:           authMap[p.id]?.email ?? null,
      // Fecha de alta real. La UI muestra ésta en la columna "Registro".
      auth_created_at: authMap[p.id]?.createdAt ?? null,
      review_count:    revCounts[p.id] ?? 0,
      list_count:      lstCounts[p.id] ?? 0,
      follow_count:    flwCounts[p.id] ?? 0,

      // App móvil
      tiene_app:          !!dev,
      plataformas:        dev?.plataformas ?? [],
      ultimo_dispositivo: dev?.ultimo ?? null,

      // Actividad. `null` y no `0` a propósito: son cosas distintas y la UI las
      // muestra distinto. `null` es "de esta persona no tenemos ni un evento",
      // que con la medición arrancada ayer es el caso de casi todos. Un 0 diría
      // "entró y no hizo nada", que es una afirmación que no podemos sostener.
      segundos_totales:  act ? Number(act.segundos_totales) : null,
      sesiones:          act ? Number(act.sesiones) : null,
      ultima_actividad:  act?.ultima_actividad ?? null,
    }
  })
}

function jsonResponse(
  users: unknown[],
  total: number,
  page: number,
  limit: number,
  medicion: Medicion,
  timing: string
) {
  return NextResponse.json(
    // `medicion` viaja en cada respuesta para que la UI pueda escribir la fecha
    // de inicio al lado de las columnas de tiempo. Sin ese cartel, la columna
    // miente por omisión: parece el histórico del usuario y es el histórico de
    // la medición, que arrancó mucho después.
    { users, total, page, limit, medicion },
    {
      headers: {
        'Cache-Control': 'private, max-age=60',
        // Se lee en la pestaña Network del navegador, tramo por tramo.
        'Server-Timing': timing,
      },
    }
  )
}
