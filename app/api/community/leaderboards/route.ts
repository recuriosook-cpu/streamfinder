import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CORS_HEADERS,
  corsPreflight,
  getProfilesById,
  getSupabase,
  jsonError,
  periodStart,
  privateCache,
  requireUserId,
  type CommunityProfile,
} from '@/lib/community-api'

/**
 * Rankings de la comunidad: top 20 por categoría y período.
 *
 * La web no tiene rankings —su pestaña "Logros" son 15 logros personales, sin
 * comparación con nadie—, así que esto es nuevo.
 *
 * El conteo se hace en memoria y no con un `GROUP BY`: PostgREST no agrupa sin
 * una función en la base, y las tablas son chicas (`reviews` 171 filas,
 * `watched` 1336, `lists` 11). Si algún día `watched` crece un orden de
 * magnitud, esto pasa a ser una RPC `community_leaderboard(period, category)`
 * y la app no se entera.
 */

export const OPTIONS = corsPreflight

/** Cuántos puestos devuelve. */
const TOP_N = 20

/**
 * Techo de filas que se escanean para contar.
 *
 * PostgREST corta en 1000 por request, así que se pagina hasta este tope. Con
 * `watched` en 1336 filas hacen falta 2 tandas; el margen deja crecer sin
 * quedarse corto en silencio.
 */
const SCAN_CHUNK = 1000
const SCAN_MAX = 20_000

/**
 * Quince minutos, como pide el brief, pero PRIVADA.
 *
 * El ranking en sí es igual para todos y daría para cachearlo en el CDN, pero
 * la respuesta marca la fila del que pregunta (`isCurrentUser`) y agrega su
 * puesto cuando queda fuera del top (`currentUserEntry`). Con `s-maxage`, el
 * CDN cachea por URL y le serviría a un usuario el ranking marcado con el
 * puesto de otro.
 *
 * Si algún día molesta la carga, la salida es partir en dos: el top compartido
 * con `s-maxage` y el puesto propio en otra request privada.
 */
const CACHE_SECONDS = 900

type Period = 'week' | 'month' | 'all'
type Category = 'reviewers' | 'watchers' | 'listmakers'

const PERIODS: Period[] = ['week', 'month', 'all']
const CATEGORIES: Category[] = ['reviewers', 'watchers', 'listmakers']

/**
 * De qué tabla y con qué columna de fecha se cuenta cada categoría.
 *
 * `as const` y no anotado con `string`: supabase-js valida el string del
 * `select` a nivel de tipos, y con `string` el template literal se le vuelve
 * opaco y tipa la respuesta como error de parseo en vez de como filas.
 */
const SOURCE = {
  reviewers: { table: 'reviews', dateColumn: 'created_at' },
  watchers: { table: 'watched', dateColumn: 'watched_at' },
  listmakers: { table: 'lists', dateColumn: 'created_at' },
} as const satisfies Record<Category, { table: string; dateColumn: string }>

export interface LeaderboardEntry {
  /** 1 = primero. */
  rank: number
  profile: CommunityProfile
  count: number
  /** `true` en la fila del usuario que pregunta, para resaltarla. */
  isCurrentUser: boolean
}

export interface CommunityLeaderboardResponse {
  period: Period
  category: Category
  entries: LeaderboardEntry[]
  /**
   * Puesto del usuario aunque no entre en el top 20, o `null` si no participó.
   * Sin esto, alguien fuera del top no tiene forma de saber cómo va.
   */
  currentUserEntry: LeaderboardEntry | null
}

/**
 * Cuenta filas por usuario, paginando.
 *
 * `lists` además filtra por públicas: rankear a alguien por listas privadas
 * expondría cuántas tiene, que es justamente lo que decidió no mostrar.
 */
async function countByUser(
  supabase: SupabaseClient,
  category: Category,
  since: string | null
): Promise<Map<string, number>> {
  const { table, dateColumn } = SOURCE[category]
  const counts = new Map<string, number>()

  for (let offset = 0; offset < SCAN_MAX; offset += SCAN_CHUNK) {
    let query = supabase
      .from(table)
      .select(`user_id, ${dateColumn}`)
      .order(dateColumn, { ascending: false })
      .range(offset, offset + SCAN_CHUNK - 1)

    if (since) query = query.gte(dateColumn, since)
    if (category === 'listmakers') query = query.eq('is_public', true)

    const { data, error } = await query

    // 416 = el offset se pasó del total. No es un fallo, es el final.
    if (error) break

    const rows = (data ?? []) as { user_id: string }[]
    for (const row of rows) {
      counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1)
    }

    if (rows.length < SCAN_CHUNK) break
  }

  return counts
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase()
  if (!supabase) return jsonError('Server misconfigured', 500)

  const userId = await requireUserId(req, supabase)
  if (!userId) return jsonError('Unauthorized', 401)

  const rawPeriod = req.nextUrl.searchParams.get('period') ?? 'all'
  const period: Period = (PERIODS as string[]).includes(rawPeriod)
    ? (rawPeriod as Period)
    : 'all'

  const rawCategory = req.nextUrl.searchParams.get('category') ?? 'reviewers'
  const category: Category = (CATEGORIES as string[]).includes(rawCategory)
    ? (rawCategory as Category)
    : 'reviewers'

  const counts = await countByUser(supabase, category, periodStart(period))

  const ranked = [...counts.entries()]
    // Desempate por id para que dos usuarios con la misma cuenta no se
    // intercambien de puesto entre dos cargas.
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))

  const top = ranked.slice(0, TOP_N)

  // El usuario puede no estar en el top: se pide su perfil igual para poder
  // devolver su puesto real.
  const currentUserIndex = ranked.findIndex(([id]) => id === userId)
  const idsToFetch = top.map(([id]) => id)
  if (currentUserIndex >= TOP_N) idsToFetch.push(userId)

  const profiles = await getProfilesById(supabase, idsToFetch)

  const entries: LeaderboardEntry[] = top
    .map(([id, count], index) => {
      const profile = profiles.get(id)
      if (!profile) return null
      return {
        rank: index + 1,
        profile,
        count,
        isCurrentUser: id === userId,
      }
    })
    .filter((entry): entry is LeaderboardEntry => entry !== null)

  let currentUserEntry: LeaderboardEntry | null = null
  if (currentUserIndex >= TOP_N) {
    const profile = profiles.get(userId)
    if (profile) {
      currentUserEntry = {
        rank: currentUserIndex + 1,
        profile,
        count: ranked[currentUserIndex][1],
        isCurrentUser: true,
      }
    }
  }

  const body: CommunityLeaderboardResponse = {
    period,
    category,
    entries,
    currentUserEntry,
  }

  return NextResponse.json(body, {
    headers: { ...CORS_HEADERS, ...privateCache(CACHE_SECONDS) },
  })
}
