import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CORS_HEADERS,
  corsPreflight,
  getFollowingIds,
  getProfilesById,
  getSupabase,
  getSupabaseAsUser,
  jsonError,
  privateCache,
  requireUserId,
  type CommunityProfile,
} from '@/lib/community-api'
import { enforceRateLimit } from '@/lib/rate-limit'
import { POCOS_SEGUIDOS, cuentasDestacadas } from '@/lib/feed-extras'

/**
 * GET /api/community/amigos — los dos carruseles de amigos del inicio de la
 * app (1.0.16), a la Letterboxd:
 *
 *   · `novedades`: lo último que calificaron los que seguís, con quién y
 *     cuántas estrellas. Un título una sola vez (la calificación más nueva).
 *   · `populares`: lo más calificado, visto o guardado por los que seguís en
 *     los últimos 30 días, ordenado por cuántas personas distintas lo marcaron.
 *
 * Si sigue a menos de 5 personas, se completa con las cuentas verificadas y
 * populares (`lib/feed-extras.ts`), igual que el feed; lo de ellas viene con
 * `sugerido: true`.
 *
 * Lee como quien mira: la RLS saca a quien tiene "Ocultar actividad".
 */

export const OPTIONS = corsPreflight

const CANTIDAD = 15
const NOVEDADES_DIAS = 60
const POPULARES_DIAS = 30
/** Cinco minutos: lo de los amigos no cambia segundo a segundo, y es privado. */
const CACHE_SECONDS = 300

type MediaType = 'movie' | 'tv'

export interface NovedadAmigo {
  key: string
  mediaType: MediaType
  mediaId: number
  title: string
  posterPath: string | null
  userId: string
  rating: number
  ratedAt: string
  sugerido: boolean
}

export interface PopularAmigos {
  key: string
  mediaType: MediaType
  mediaId: number
  title: string
  posterPath: string | null
  /** Personas distintas que lo marcaron. */
  amigos: number
  /** Hasta 3, para las fotitos. */
  userIds: string[]
  sugerido: boolean
}

export interface AmigosResponse {
  novedades: NovedadAmigo[]
  populares: PopularAmigos[]
  profiles: CommunityProfile[]
  /** Se completó con cuentas destacadas porque sigue a poca gente. */
  completado: boolean
}

type Fila = {
  user_id: string
  media_type: MediaType
  media_id: number
  title: string | null
  poster_path: string | null
}

async function filas<T>(
  db: SupabaseClient,
  tabla: string,
  columnas: string,
  ids: string[],
  campoFecha: string,
  desde: string
): Promise<T[]> {
  if (ids.length === 0) return []
  const { data, error } = await db
    .from(tabla)
    .select(columnas)
    .in('user_id', ids)
    .gte(campoFecha, desde)
    .order(campoFecha, { ascending: false })
    .limit(300)
  if (error) return []
  return (data ?? []) as T[]
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, CORS_HEADERS)
  if (limited) return limited

  const supabase = getSupabase()
  if (!supabase) return jsonError('Server misconfigured', 500)
  const userId = await requireUserId(req, supabase)
  if (!userId) return jsonError('Unauthorized', 401)
  const token = req.headers.get('authorization')!.slice('Bearer '.length)
  const db = getSupabaseAsUser(token) ?? supabase

  const seguidos = await getFollowingIds(db, userId)
  const completado = seguidos.length < POCOS_SEGUIDOS
  const destacadas = completado ? await cuentasDestacadas(db, userId, seguidos) : []
  const sugerida = new Set(destacadas)
  const ids = [...seguidos, ...destacadas]

  const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

  const [notas, vistas, guardadas] = await Promise.all([
    filas<Fila & { rating: number; rated_at: string }>(
      db, 'ratings', 'user_id, media_type, media_id, title, poster_path, rating, rated_at', ids, 'rated_at', dias(NOVEDADES_DIAS)),
    filas<Fila & { watched_at: string }>(
      db, 'watched', 'user_id, media_type, media_id, title, poster_path, watched_at', ids, 'watched_at', dias(POPULARES_DIAS)),
    filas<Fila & { added_at: string }>(
      db, 'watchlist', 'user_id, media_type, media_id, title, poster_path, added_at', ids, 'added_at', dias(POPULARES_DIAS)),
  ])

  // Novedades: la calificación más nueva de cada título. Lo de quien sigue va
  // antes que lo sugerido.
  const novedades: NovedadAmigo[] = []
  const vistos = new Set<string>()
  const ordenNotas = [...notas].sort((a, b) =>
    Number(sugerida.has(a.user_id)) - Number(sugerida.has(b.user_id)) || b.rated_at.localeCompare(a.rated_at))
  for (const n of ordenNotas) {
    const clave = `${n.media_type}:${n.media_id}`
    if (vistos.has(clave) || !n.poster_path) continue
    vistos.add(clave)
    novedades.push({
      key: `${clave}:${n.user_id}`,
      mediaType: n.media_type,
      mediaId: n.media_id,
      title: n.title ?? '',
      posterPath: n.poster_path,
      userId: n.user_id,
      rating: n.rating,
      ratedAt: n.rated_at,
      sugerido: sugerida.has(n.user_id),
    })
    if (novedades.length >= CANTIDAD) break
  }

  // Populares: cuántas personas distintas lo marcaron en 30 días.
  const desde30 = dias(POPULARES_DIAS)
  const porTitulo = new Map<string, { fila: Fila; quienes: Set<string>; ultima: string }>()
  const sumar = (f: Fila, cuando: string) => {
    if (cuando < desde30 || !f.poster_path) return
    const clave = `${f.media_type}:${f.media_id}`
    const t = porTitulo.get(clave) ?? { fila: f, quienes: new Set<string>(), ultima: cuando }
    t.quienes.add(f.user_id)
    if (cuando > t.ultima) t.ultima = cuando
    porTitulo.set(clave, t)
  }
  for (const n of notas) sumar(n, n.rated_at)
  for (const v of vistas) sumar(v, v.watched_at)
  for (const g of guardadas) sumar(g, g.added_at)

  const populares: PopularAmigos[] = [...porTitulo.entries()]
    .sort(([, a], [, b]) => b.quienes.size - a.quienes.size || b.ultima.localeCompare(a.ultima))
    .slice(0, CANTIDAD)
    .map(([clave, t]) => {
      const quienes = [...t.quienes]
      return {
        key: clave,
        mediaType: t.fila.media_type,
        mediaId: t.fila.media_id,
        title: t.fila.title ?? '',
        posterPath: t.fila.poster_path,
        amigos: quienes.length,
        userIds: quienes.slice(0, 3),
        sugerido: quienes.every(q => sugerida.has(q)),
      }
    })

  const profiles = await getProfilesById(db, [
    ...novedades.map(n => n.userId),
    ...populares.flatMap(p => p.userIds),
  ])

  const body: AmigosResponse = { novedades, populares, profiles: [...profiles.values()], completado }
  return NextResponse.json(body, { headers: { ...CORS_HEADERS, ...privateCache(CACHE_SECONDS) } })
}
