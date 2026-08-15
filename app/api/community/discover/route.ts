import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CORS_HEADERS,
  corsPreflight,
  getFollowingIds,
  getSupabase,
  jsonError,
  privateCache,
  PROFILE_COLUMNS,
  requireUserId,
  toCommunityProfile,
  type CommunityProfile,
  type ProfileRow,
} from '@/lib/community-api'

/**
 * Usuarios sugeridos para seguir.
 *
 * Esto la web no lo tiene: en `app/comunidad` el botón "Descubrir usuarios"
 * sólo cambia a la pestaña de compatibilidad, que puntúa gente que YA seguís.
 * Acá se resuelve de verdad, con tres criterios.
 *
 * Los tres excluyen siempre al propio usuario y a quienes ya sigue: sugerir a
 * alguien que ya está en tu lista es la forma más rápida de que la pestaña se
 * sienta rota.
 */

export const OPTIONS = corsPreflight

/** Cuántos sugeridos devuelve. */
const RESULT_LIMIT = 20

/**
 * Cuántos perfiles/filas se miran antes de filtrar.
 *
 * Hay que pedir de más porque después se descartan los ya seguidos: si se
 * pidieran 20 justos y seguís a 15 de ellos, la pestaña quedaría con 5.
 */
const SCAN_LIMIT = 200

/** Cinco minutos, como pide el brief. Privada: excluye a quienes ya seguís. */
const CACHE_SECONDS = 300

type DiscoverTab = 'recent' | 'top' | 'followed'

const TABS: DiscoverTab[] = ['recent', 'top', 'followed']

export interface DiscoverUser extends CommunityProfile {
  points: number
  level: number
  /** Seguidores que tiene. Es lo que ordena la pestaña `followed`. */
  followerCount: number
}

export interface CommunityDiscoverResponse {
  tab: DiscoverTab
  users: DiscoverUser[]
}

/**
 * Cuántos seguidores tiene cada uno de estos ids.
 *
 * Una sola consulta con `in` y el conteo se hace acá: PostgREST no agrupa sin
 * una función en la base, y `follows` tiene 72 filas — agrupar en memoria es
 * más simple que agregar una RPC para esto.
 */
async function countFollowers(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (ids.length === 0) return counts

  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .in('following_id', ids)

  if (error) return counts

  for (const row of (data ?? []) as { following_id: string }[]) {
    counts.set(row.following_id, (counts.get(row.following_id) ?? 0) + 1)
  }
  return counts
}

/**
 * Los usuarios con actividad más reciente.
 *
 * `profiles` NO tiene `created_at` —lo verificamos contra PostgREST—, así que
 * "recientes" no puede significar "los que se registraron último". Se usa la
 * última vez que marcaron algo como visto, que además es mejor señal: alguien
 * que entró hace un año pero mira películas todas las semanas es más
 * interesante de seguir que uno que se registró ayer y no hizo nada.
 */
async function loadRecent(
  supabase: SupabaseClient,
  excluded: Set<string>
): Promise<string[]> {
  const { data, error } = await supabase
    .from('watched')
    .select('user_id, watched_at')
    .order('watched_at', { ascending: false })
    .limit(1000)

  if (error) return []

  const seen: string[] = []
  const added = new Set<string>()

  for (const row of (data ?? []) as { user_id: string }[]) {
    if (excluded.has(row.user_id) || added.has(row.user_id)) continue
    added.add(row.user_id)
    seen.push(row.user_id)
    if (seen.length >= RESULT_LIMIT) break
  }

  return seen
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase()
  if (!supabase) return jsonError('Server misconfigured', 500)

  const userId = await requireUserId(req, supabase)
  if (!userId) return jsonError('Unauthorized', 401)

  const rawTab = req.nextUrl.searchParams.get('tab') ?? 'top'
  const tab: DiscoverTab = (TABS as string[]).includes(rawTab)
    ? (rawTab as DiscoverTab)
    : 'top'

  const followIds = await getFollowingIds(supabase, userId)
  const excluded = new Set<string>([userId, ...followIds])

  let candidateIds: string[] = []

  if (tab === 'recent') {
    candidateIds = await loadRecent(supabase, excluded)
  } else if (tab === 'followed') {
    const { data } = await supabase
      .from('follows')
      .select('following_id')
      .limit(2000)

    const counts = new Map<string, number>()
    for (const row of (data ?? []) as { following_id: string }[]) {
      if (excluded.has(row.following_id)) continue
      counts.set(row.following_id, (counts.get(row.following_id) ?? 0) + 1)
    }

    candidateIds = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, RESULT_LIMIT)
      .map(([id]) => id)
  }

  // `top` (y el fallback de las otras dos si quedaron cortas) ordena por puntos.
  let profiles: ProfileRow[] = []

  if (candidateIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select(`${PROFILE_COLUMNS}, points, level`)
      .in('id', candidateIds)

    // `in()` pierde el orden, así que se reordena según los ids candidatos.
    const byId = new Map(
      ((data ?? []) as ProfileRow[]).map((row) => [row.id, row])
    )
    profiles = candidateIds
      .map((id) => byId.get(id))
      .filter((row): row is ProfileRow => row !== undefined)
  } else {
    const { data } = await supabase
      .from('profiles')
      .select(`${PROFILE_COLUMNS}, points, level`)
      .order('points', { ascending: false, nullsFirst: false })
      .limit(SCAN_LIMIT)

    profiles = ((data ?? []) as ProfileRow[])
      .filter((row) => !excluded.has(row.id))
      .slice(0, RESULT_LIMIT)
  }

  // Sin username no hay a dónde navegar ni qué mostrar: son perfiles a medio
  // crear, no gente para sugerir.
  profiles = profiles.filter((row) => row.username)

  const followerCounts = await countFollowers(
    supabase,
    profiles.map((row) => row.id)
  )

  const users: DiscoverUser[] = profiles.map((row) => {
    const withPoints = row as ProfileRow & {
      points: number | null
      level: number | null
    }
    return {
      ...toCommunityProfile(row),
      points: withPoints.points ?? 0,
      level: withPoints.level ?? 1,
      followerCount: followerCounts.get(row.id) ?? 0,
    }
  })

  const body: CommunityDiscoverResponse = { tab, users }

  return NextResponse.json(body, {
    headers: { ...CORS_HEADERS, ...privateCache(CACHE_SECONDS) },
  })
}
