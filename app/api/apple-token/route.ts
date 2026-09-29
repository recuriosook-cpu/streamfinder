import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminClient } from '@/lib/service-role'
import {
  APPLE_APP_CLIENT_ID,
  exchangeAppleCode,
  isAppleConfigured,
  saveAppleToken,
} from '@/lib/apple-signin'

/**
 * La app de iPhone manda acá el `authorizationCode` justo después de iniciar
 * sesión con Apple. Se canjea por un refresh token y se guarda en
 * `apple_tokens`, que es lo que /api/delete-account usa para revocar el acceso
 * cuando la persona borra la cuenta.
 *
 * La app llama con `Authorization: Bearer <access_token>` de Supabase, como en
 * /api/delete-account. Si esto falla, el login ya salió bien igual: la app lo
 * registra en client_errors y sigue.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
} as const

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function reply(body: object, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return reply({ error: 'No autorizado' }, 401)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: { user } } = await supabase.auth.getUser(authHeader.slice('Bearer '.length))
  if (!user) return reply({ error: 'No autorizado' }, 401)

  const { authorizationCode } = (await req.json().catch(() => ({}))) as {
    authorizationCode?: unknown
  }
  if (typeof authorizationCode !== 'string' || !authorizationCode) {
    return reply({ error: 'Falta authorizationCode' }, 400)
  }

  if (!isAppleConfigured()) {
    console.error('[apple-token] faltan APPLE_KEY_ID / APPLE_PRIVATE_KEY')
    return reply({ error: 'server_misconfigured' }, 503)
  }

  const { admin, failure } = requireAdminClient('apple-token')
  if (failure) return failure

  try {
    const { refreshToken, appleUserId } = await exchangeAppleCode(
      authorizationCode,
      APPLE_APP_CLIENT_ID
    )

    // El código tiene que ser de la misma cuenta de Apple con la que está
    // logueado quien llama; si no, no se guarda nada.
    const appleIdentity = user.identities?.find(i => i.provider === 'apple')
    const identitySub = appleIdentity?.identity_data?.sub ?? appleIdentity?.id
    if (!identitySub || identitySub !== appleUserId) {
      return reply({ error: 'El código no corresponde a esta cuenta' }, 403)
    }

    await saveAppleToken(admin, user.id, APPLE_APP_CLIENT_ID, refreshToken)
    return reply({ success: true }, 200)
  } catch (err) {
    console.error('[apple-token]', { userId: user.id, err })
    return reply({ error: 'apple_exchange_failed' }, 502)
  }
}
