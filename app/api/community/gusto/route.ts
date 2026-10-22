import { NextRequest, NextResponse } from 'next/server'
import {
  CORS_HEADERS,
  corsPreflight,
  getFollowingIds,
  getSupabaseAsUser,
  jsonError,
  privateCache,
  readBearer,
} from '@/lib/community-api'
import { getRequestUserId } from '@/lib/request-user'
import { requireAdminClient } from '@/lib/service-role'
import { enforceRateLimit } from '@/lib/rate-limit'
import { coincidenciaCon, coincidenciasCon, genteConTuGusto } from '@/lib/gusto'

/**
 * /api/community/gusto — "Gente con tu gusto". La lógica está en `lib/gusto.ts`.
 *
 *   GET                  el carrusel de quien pide
 *   GET ?con=<id>        "Coinciden en X%" con esa persona, para su perfil
 *   GET ?con=<id>,<id>…  con varias (hasta 100): la pestaña "Compatibilidad"
 *                        de la web, con la gente que sigue
 *
 * Con la sesión: Bearer desde la app, cookie desde la web.
 */

export const OPTIONS = corsPreflight
export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, CORS_HEADERS)
  if (limited) return limited

  const userId = await getRequestUserId(req)
  if (!userId) return jsonError('Sin sesión', 401)

  const { admin, failure } = requireAdminClient('community/gusto')
  if (failure) return failure

  try {
    const con = req.nextUrl.searchParams.get('con')
    if (con?.includes(',')) {
      const ids = con.split(',').filter(id => UUID.test(id)).slice(0, 100)
      const coincidencias = await coincidenciasCon(admin, userId, ids)
      return NextResponse.json({ coincidencias }, { headers: { ...CORS_HEADERS, ...privateCache(600) } })
    }
    if (con) {
      if (!UUID.test(con)) return jsonError('Usuario inválido', 400)
      const c = await coincidenciaCon(admin, userId, con)
      return NextResponse.json({ coincidencia: c }, { headers: { ...CORS_HEADERS, ...privateCache(600) } })
    }

    // A quién ya sigue y los bloqueos, en las dos direcciones. Los bloqueos
    // sólo los lee su dueño: con el token de la app, como él; desde la web,
    // con la service role (es el mismo usuario, verificado por la cookie).
    const token = readBearer(req)
    const lector = (token && getSupabaseAsUser(token)) || admin
    const [siguiendo, bloqueados, meBloquearon] = await Promise.all([
      getFollowingIds(admin, userId),
      lector.from('blocked_users').select('blocked_id').eq('blocker_id', userId),
      admin.from('blocked_users').select('blocker_id').eq('blocked_id', userId),
    ])
    const excluir = new Set<string>(siguiendo)
    for (const r of (bloqueados.data ?? []) as { blocked_id: string }[]) excluir.add(r.blocked_id)
    for (const r of (meBloquearon.data ?? []) as { blocker_id: string }[]) excluir.add(r.blocker_id)

    const resultado = await genteConTuGusto(admin, userId, excluir)
    return NextResponse.json(resultado, { headers: { ...CORS_HEADERS, ...privateCache(300) } })
  } catch (err) {
    console.error('[community/gusto]', (err as Error).message)
    return jsonError('No se pudo calcular', 500)
  }
}
