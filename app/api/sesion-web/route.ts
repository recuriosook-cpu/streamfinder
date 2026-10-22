import { NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/request-user'
import { requireAdminClient } from '@/lib/service-role'

/**
 * La app abre una página de la web con la sesión ya iniciada.
 *
 * Hoy sólo `/importar` (Letterboxd): la app no importa sola, y sin esto la
 * persona caía en la web sin sesión y tenía que volver a entrar, muchas veces
 * con Apple o Google desde un navegador donde nunca lo había hecho.
 *
 * Cómo: la app manda su `access_token` (Bearer). Con la cuenta verificada, se
 * genera un link de un solo uso de Supabase (el mismo de los mails de "entrar
 * con un link", pero sin mandar ningún mail) y se devuelve la URL de
 * `/auth/entrar` con su `token_hash`. Esa página lo canjea por la sesión de la
 * web y sigue a la página pedida. El token sirve una sola vez y vence solo.
 *
 * Responde `{ url }`. Si algo falla, 4xx/5xx y la app abre la página sin
 * sesión, que igual pide entrar.
 */

/** Las páginas a las que se puede llegar así. Una lista cerrada a propósito. */
const DESTINOS = new Set(['/importar'])

export async function POST(req: Request) {
  const userId = await getRequestUserId(req)
  if (!userId) return NextResponse.json({ error: 'Sin sesión' }, { status: 401 })

  let destino = '/importar'
  try {
    const body = (await req.json()) as { destino?: unknown }
    if (typeof body.destino === 'string') destino = body.destino
  } catch { /* sin body: el destino de siempre */ }
  if (!DESTINOS.has(destino)) return NextResponse.json({ error: 'Destino no permitido' }, { status: 400 })

  const { admin, failure } = requireAdminClient('sesion-web')
  if (failure) return failure

  const { data: usuario, error: userError } = await admin.auth.admin.getUserById(userId)
  const email = usuario?.user?.email
  if (userError || !email) {
    console.error('[sesion-web] usuario:', { userId, error: userError?.message })
    return NextResponse.json({ error: 'Cuenta sin email' }, { status: 422 })
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    console.error('[sesion-web] link:', { userId, error: linkError?.message })
    return NextResponse.json({ error: 'No se pudo generar el acceso' }, { status: 500 })
  }

  const origin = new URL(req.url).origin
  const url = `${origin}/auth/entrar?token_hash=${encodeURIComponent(tokenHash)}&next=${encodeURIComponent(destino)}`
  return NextResponse.json({ url })
}
