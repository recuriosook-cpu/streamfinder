import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CORS_HEADERS,
  corsPreflight,
  getFollowingIds,
  getSupabase,
  getSupabaseAsUser,
  jsonError,
  privateCache,
  PROFILE_COLUMNS,
  readBearer,
  readPaging,
  requireUserId,
  type ProfileRow,
} from '@/lib/community-api'
import { enforceRateLimit } from '@/lib/rate-limit'

/**
 * Usuarios sugeridos para seguir.
 *
 * Esto la web no lo tiene: en `app/comunidad` el botón "Descubrir usuarios"
 * sólo cambia a la pestaña de compatibilidad, que puntúa gente que YA seguís.
 *
 * Los tres criterios salen de las tablas de actividad y no de columnas de
 * `profiles`, porque ahí no hay con qué rankear (verificado contra la base):
 *
 *   - `profiles.created_at` NO EXISTE, así que no se puede saber quién se
 *     registró hace poco. "Recientes" es entonces "vio algo hace poco", que
 *     además es mejor señal para decidir a quién seguir.
 *   - `profiles.verified` NO EXISTE.
 *   - `profiles.level` está en 1 para 112 de 113 perfiles y `points` en 0 para
 *     112 de 113 (el RPC `add_points` todavía no está instalado), así que
 *     ordenar por nivel o por puntos devuelve una lista de una persona.
 *
 * Los tres criterios excluyen siempre al propio usuario y a quienes ya sigue:
 * sugerir a alguien que ya está en tu lista es la forma más rápida de que la
 * pestaña se sienta rota.
 */

export const OPTIONS = corsPreflight

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

/** Cinco minutos, como pide el brief. Privada: excluye a quienes ya seguís. */
const CACHE_SECONDS = 300

/** PostgREST corta en 1000 filas por request; las tablas se leen en tandas. */
const SCAN_CHUNK = 1000
const SCAN_MAX = 20_000

type DiscoverTab = 'recent' | 'top' | 'cinefilos' | 'suggestions'

const TABS: DiscoverTab[] = ['recent', 'top', 'cinefilos', 'suggestions']

export interface DiscoverUser {
  id: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  bio: string | null
  level: number
  points: number
  watchedCount: number
  reviewCount: number
  listCount: number
  followerCount: number
}

export interface CommunityDiscoverResponse {
  tab: DiscoverTab
  users: DiscoverUser[]
  page: number
  limit: number
  hasMore: boolean
}

/**
 * Cuenta filas por usuario en una tabla, paginando.
 *
 * Se cuenta en memoria y no con un `GROUP BY` porque PostgREST no agrupa sin
 * una función en la base, y las tablas son chicas (`watched` 1336 filas,
 * `reviews` 171, `follows` 73, `lists` 11). Son 5 requests de una sola columna
 * y la respuesta se cachea 5 minutos.
 */
async function countByUser(
  supabase: SupabaseClient,
  table: string,
  column: 'user_id' | 'following_id',
  publicOnly = false
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()

  for (let offset = 0; offset < SCAN_MAX; offset += SCAN_CHUNK) {
    let query = supabase
      .from(table)
      .select(column)
      .range(offset, offset + SCAN_CHUNK - 1)

    if (publicOnly) query = query.eq('is_public', true)

    const { data, error } = await query
    if (error) break

    const rows = (data ?? []) as Record<string, string>[]
    for (const row of rows) {
      const id = row[column]
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }

    if (rows.length < SCAN_CHUNK) break
  }

  return counts
}

/**
 * Usuarios ordenados por qué tan recientemente vieron algo.
 *
 * Se recorre `watched` de más nuevo a más viejo y se toma el primer registro de
 * cada usuario: ese es el orden de "última actividad" sin necesitar un
 * `DISTINCT ON` que PostgREST no expone.
 */
async function rankByRecency(supabase: SupabaseClient): Promise<string[]> {
  const seen = new Set<string>()
  const ordered: string[] = []

  for (let offset = 0; offset < SCAN_MAX; offset += SCAN_CHUNK) {
    const { data, error } = await supabase
      .from('watched')
      .select('user_id, watched_at')
      .order('watched_at', { ascending: false })
      .order('media_id', { ascending: false })
      .range(offset, offset + SCAN_CHUNK - 1)

    if (error) break

    const rows = (data ?? []) as { user_id: string }[]
    for (const row of rows) {
      if (seen.has(row.user_id)) continue
      seen.add(row.user_id)
      ordered.push(row.user_id)
    }

    if (rows.length < SCAN_CHUNK) break
  }

  return ordered
}

/**
 * Ids que el usuario no debería ver sugeridos por un bloqueo.
 *
 * Se lee con el cliente del usuario y no con el anónimo: `blocked_users` tiene
 * policy de dueño, así que con la anon key devuelve cero filas y el filtro
 * quedaría de adorno.
 *
 * Se preguntan las dos direcciones. La de "yo lo bloqueé" seguro es legible; la
 * de "me bloqueó" depende de que exista una policy para el bloqueado, y si no
 * la hay vuelve vacía y se filtra sólo en un sentido. Degrada bien: en el peor
 * caso se sugiere a alguien que te bloqueó, no al revés.
 */
async function getBlockedIds(
  userClient: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const blocked = new Set<string>()

  const [iBlocked, blockedMe] = await Promise.all([
    userClient.from('blocked_users').select('blocked_id').eq('blocker_id', userId),
    userClient.from('blocked_users').select('blocker_id').eq('blocked_id', userId),
  ])

  for (const row of (iBlocked.data ?? []) as { blocked_id: string }[]) {
    blocked.add(row.blocked_id)
  }
  for (const row of (blockedMe.data ?? []) as { blocker_id: string }[]) {
    blocked.add(row.blocker_id)
  }

  return blocked
}

/**
 * Sugerencias de segundo grado: a quién sigue la gente que seguís.
 *
 * El puntaje es cuántos de tus seguidos siguen a cada candidato. No hace falta
 * nada más elaborado: con `follows` en 73 filas, "lo siguen 3 de los tuyos"
 * ordena mejor que cualquier heurística inventada.
 *
 * Devuelve `[]` cuando no seguís a nadie —no hay segundo grado que calcular— y
 * el cliente cae a otra pestaña.
 */
async function rankBySecondDegree(
  supabase: SupabaseClient,
  followIds: string[],
  excluded: Set<string>
): Promise<string[]> {
  if (followIds.length === 0) return []

  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .in('follower_id', followIds)

  if (error) return []

  const tally = new Map<string, number>()
  for (const row of (data ?? []) as { following_id: string }[]) {
    if (excluded.has(row.following_id)) continue
    tally.set(row.following_id, (tally.get(row.following_id) ?? 0) + 1)
  }

  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id)
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, CORS_HEADERS)
  if (limited) return limited

  const supabase = getSupabase()
  if (!supabase) return jsonError('Server misconfigured', 500)

  const userId = await requireUserId(req, supabase)
  if (!userId) return jsonError('Unauthorized', 401)

  const rawTab = req.nextUrl.searchParams.get('tab') ?? 'recent'
  const tab: DiscoverTab = (TABS as string[]).includes(rawTab)
    ? (rawTab as DiscoverTab)
    : 'recent'

  const { page, limit } = readPaging(req, DEFAULT_LIMIT, MAX_LIMIT)

  const token = readBearer(req)
  const userClient = token ? getSupabaseAsUser(token) : null

  const [followIds, blockedIds] = await Promise.all([
    getFollowingIds(supabase, userId),
    userClient ? getBlockedIds(userClient, userId) : Promise.resolve(new Set<string>()),
  ])

  // El bloqueo excluye en las cuatro pestañas, no sólo en las sugerencias:
  // alguien a quien bloqueaste no debería reaparecer como "cinéfilo destacado".
  const excluded = new Set<string>([userId, ...followIds, ...blockedIds])

  // Los cuatro mapas se usan para rankear Y para las stats de cada card, así
  // que se piden una sola vez sin importar la pestaña.
  const [watchedCounts, reviewCounts, listCounts, followerCounts, recency, secondDegree] =
    await Promise.all([
      countByUser(supabase, 'watched', 'user_id'),
      countByUser(supabase, 'reviews', 'user_id'),
      countByUser(supabase, 'lists', 'user_id', true),
      countByUser(supabase, 'follows', 'following_id'),
      tab === 'recent' ? rankByRecency(supabase) : Promise.resolve([]),
      tab === 'suggestions'
        ? rankBySecondDegree(supabase, followIds, new Set([userId, ...followIds, ...blockedIds]))
        : Promise.resolve([]),
    ])

  let rankedIds: string[]

  if (tab === 'suggestions') {
    rankedIds = secondDegree
  } else if (tab === 'recent') {
    rankedIds = recency.filter((id) => !excluded.has(id))
  } else if (tab === 'cinefilos') {
    // "Cinéfilo" = el que más vio. El brief pedía verificados o de nivel alto,
    // pero no hay columna de verificado y el nivel es 1 en 112 de 113 perfiles.
    rankedIds = [...watchedCounts.entries()]
      .filter(([id]) => !excluded.has(id))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id]) => id)
  } else {
    // "Top" = quien más aporta a la comunidad: reseñas y listas públicas. Es la
    // definición que da el propio brief ("más reseñas, más listas"), resuelta
    // con las tablas en vez de con `points`, que está en 0 para casi todos.
    const contributors = new Set([...reviewCounts.keys(), ...listCounts.keys()])
    rankedIds = [...contributors]
      .filter((id) => !excluded.has(id))
      .sort((a, b) => {
        const scoreA = (reviewCounts.get(a) ?? 0) + (listCounts.get(a) ?? 0)
        const scoreB = (reviewCounts.get(b) ?? 0) + (listCounts.get(b) ?? 0)
        return scoreB - scoreA || a.localeCompare(b)
      })
  }

  const from = page * limit
  // Se pide una de más para saber si hay página siguiente sin un COUNT aparte.
  const pageIds = rankedIds.slice(from, from + limit + 1)
  const hasMore = pageIds.length > limit
  const visibleIds = hasMore ? pageIds.slice(0, limit) : pageIds

  if (visibleIds.length === 0) {
    const empty: CommunityDiscoverResponse = {
      tab,
      users: [],
      page,
      limit,
      hasMore: false,
    }
    return NextResponse.json(empty, {
      headers: { ...CORS_HEADERS, ...privateCache(CACHE_SECONDS) },
    })
  }

  const { data } = await supabase
    .from('profiles')
    .select(`${PROFILE_COLUMNS}, bio, level, points`)
    .in('id', visibleIds)

  type Row = ProfileRow & {
    bio: string | null
    level: number | null
    points: number | null
  }

  // `in()` pierde el orden, así que se reordena según el ranking.
  const byId = new Map(((data ?? []) as Row[]).map((row) => [row.id, row]))

  const users: DiscoverUser[] = visibleIds
    .map((id) => byId.get(id))
    .filter((row): row is Row => row !== undefined)
    // Sin username no hay perfil que mostrar ni a dónde navegar: son perfiles a
    // medio crear, no gente para sugerir.
    .filter((row) => row.username)
    .map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      level: row.level ?? 1,
      points: row.points ?? 0,
      watchedCount: watchedCounts.get(row.id) ?? 0,
      reviewCount: reviewCounts.get(row.id) ?? 0,
      listCount: listCounts.get(row.id) ?? 0,
      followerCount: followerCounts.get(row.id) ?? 0,
    }))

  const body: CommunityDiscoverResponse = {
    tab,
    users,
    page,
    limit,
    hasMore,
  }

  return NextResponse.json(body, {
    headers: { ...CORS_HEADERS, ...privateCache(CACHE_SECONDS) },
  })
}
