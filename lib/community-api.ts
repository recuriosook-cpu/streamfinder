import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Piezas compartidas por los proxies de `/api/community/*`.
 *
 * Estas rutas existen para la app nativa, que no maneja cookies: se identifica
 * con el JWT de Supabase en `Authorization: Bearer`. La web no las usa —sigue
 * consultando Supabase directo desde `app/comunidad/page.tsx`—, así que tocar
 * esto no puede romperla.
 *
 * Todas leen con la anon key, no con la service role. Eso significa que
 * respetan las policies tal como están: si una tabla es de lectura sólo para
 * su dueño, el proxy tampoco la ve. Es a propósito — un proxy que saltea RLS
 * sería una forma silenciosa de publicar datos que la base declara privados.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
} as const

/** Respuesta al preflight. Las tres rutas exportan `OPTIONS = corsPreflight`. */
export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS })
}

/**
 * Cache privada, por usuario.
 *
 * `private` es obligatorio en las respuestas que dependen de quién pregunta:
 * el CDN cachea por URL, así que un `s-maxage` en el feed le serviría a un
 * usuario el feed de otro. Sólo cachea el dispositivo.
 */
export function privateCache(seconds: number): Record<string, string> {
  return { 'Cache-Control': `private, max-age=${seconds}` }
}

// No hay helper de cache compartida a propósito: las tres rutas devuelven algo
// que depende de quién pregunta (a quién seguís, a quién ya seguís, cuál fila
// del ranking sos vos), y el CDN cachea por URL. Un `s-maxage` acá le serviría
// a un usuario la respuesta de otro.

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

/**
 * Exige un Bearer válido y devuelve el id del usuario.
 *
 * Las tres rutas son personales —el feed depende de a quién seguís, descubrir
 * excluye a los que ya seguís, y los rankings marcan cuál sos vos—, así que
 * acá el token no es opcional como en `/api/user-stats/[userId]`.
 */
export async function requireUserId(
  req: NextRequest,
  supabase: SupabaseClient
): Promise<string | null> {
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null

  const token = header.slice('Bearer '.length)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null

  return data.user.id
}

/** Perfil mínimo que devuelven los tres endpoints. */
export interface CommunityProfile {
  id: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
}

export const PROFILE_COLUMNS = 'id, username, display_name, avatar_url'

export interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export function toCommunityProfile(row: ProfileRow): CommunityProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  }
}

/** Los ids que sigue el usuario. Vacío si no sigue a nadie. */
export async function getFollowingIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)

  if (error) return []
  return ((data ?? []) as { following_id: string }[]).map((r) => r.following_id)
}

/**
 * Trae perfiles por id y los devuelve indexados.
 *
 * `in()` no respeta el orden de los ids, así que quien llama reordena; acá sólo
 * interesa poder resolver el autor de cada item sin una consulta por fila.
 */
export async function getProfilesById(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, CommunityProfile>> {
  const map = new Map<string, CommunityProfile>()
  if (ids.length === 0) return map

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .in('id', [...new Set(ids)])

  if (error) return map

  for (const row of (data ?? []) as ProfileRow[]) {
    map.set(row.id, toCommunityProfile(row))
  }
  return map
}

/** `?page=` y `?limit=`, saneados. */
export function readPaging(
  req: NextRequest,
  defaultLimit: number,
  maxLimit: number
): { page: number; limit: number } {
  const rawPage = Number.parseInt(req.nextUrl.searchParams.get('page') ?? '0', 10)
  const rawLimit = Number.parseInt(
    req.nextUrl.searchParams.get('limit') ?? String(defaultLimit),
    10
  )

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 0
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, maxLimit)
      : defaultLimit

  return { page, limit }
}

/** ISO del inicio de la ventana de un ranking. `all` no tiene corte. */
export function periodStart(period: string): string | null {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  if (period === 'week') return new Date(now - 7 * day).toISOString()
  if (period === 'month') return new Date(now - 30 * day).toISOString()
  return null
}
