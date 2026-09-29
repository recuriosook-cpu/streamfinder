import { createSign } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lado servidor de "Iniciar sesión con Apple": canjear el código que manda la
 * app por un refresh token, guardarlo, y revocarlo cuando la persona borra la
 * cuenta (Apple lo exige, guía 5.1.1(v)).
 *
 * El login en sí no pasa por acá: en la app lo hace `signInWithIdToken` de
 * Supabase y en la web `signInWithOAuth`. Esto es sólo lo que Supabase no
 * cubre, que es hablar con Apple después.
 *
 * Todo con Apple se firma con la misma clave `.p8` (Sign in with Apple), que
 * vive en las variables de entorno APPLE_KEY_ID y APPLE_PRIVATE_KEY. Sin ellas
 * nada de esto corre y el borrado de cuenta sigue igual, sin revocar.
 */

const TEAM_ID = 'NC56K84KJA'

/** El client_id de la app de iPhone: su bundle ID. */
export const APPLE_APP_CLIENT_ID = 'com.glynbox.app'

/** El client_id de la web: el Services ID creado en el portal de Apple. */
export const APPLE_WEB_CLIENT_ID = 'com.glynbox.web'

const APPLE_AUTH = 'https://appleid.apple.com'

type AppleKey = { keyId: string; privateKey: string }

/** La clave `.p8`. Acepta los saltos de línea reales o escritos como `\n`. */
function readAppleKey(): AppleKey | null {
  const keyId = process.env.APPLE_KEY_ID?.trim()
  const privateKey = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  if (!keyId || !privateKey?.includes('PRIVATE KEY')) return null
  return { keyId, privateKey }
}

export function isAppleConfigured(): boolean {
  return readAppleKey() !== null
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/**
 * El `client_secret` que pide Apple: un JWT ES256 firmado con la `.p8`. Se
 * arma en cada llamada con 5 minutos de vida; no hay nada que renovar.
 */
function clientSecret(key: AppleKey, clientId: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: key.keyId }))
  const payload = base64url(
    JSON.stringify({
      iss: TEAM_ID,
      iat: now,
      exp: now + 300,
      aud: APPLE_AUTH,
      sub: clientId,
    })
  )
  const signature = createSign('SHA256')
    .update(`${header}.${payload}`)
    .sign({ key: key.privateKey, dsaEncoding: 'ieee-p1363' })
  return `${header}.${payload}.${base64url(signature)}`
}

async function postToApple(
  path: '/auth/token' | '/auth/revoke',
  clientId: string,
  params: Record<string, string>
): Promise<Response> {
  const key = readAppleKey()
  if (!key) throw new Error('Faltan APPLE_KEY_ID / APPLE_PRIVATE_KEY')

  return fetch(`${APPLE_AUTH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret(key, clientId),
      ...params,
    }),
  })
}

/**
 * Canjea el `authorizationCode` de un login nativo (vale 5 minutos y una sola
 * vez). Devuelve el refresh token y el `sub` de Apple que dice el id_token,
 * para que quien llama confirme que el código es de la misma persona.
 */
export async function exchangeAppleCode(
  code: string,
  clientId: string
): Promise<{ refreshToken: string; appleUserId: string }> {
  const res = await postToApple('/auth/token', clientId, {
    code,
    grant_type: 'authorization_code',
  })
  const body = (await res.json().catch(() => ({}))) as {
    refresh_token?: string
    id_token?: string
    error?: string
  }
  if (!res.ok || !body.refresh_token || !body.id_token) {
    throw new Error(`Apple no canjeó el código: ${body.error ?? res.status}`)
  }

  // El id_token viene de Apple por TLS en esta misma respuesta: no hace falta
  // verificar la firma para leerle el `sub`.
  const claims = JSON.parse(
    Buffer.from(body.id_token.split('.')[1] ?? '', 'base64url').toString('utf8')
  ) as { sub?: string }
  if (!claims.sub) throw new Error('El id_token de Apple no trae `sub`')

  return { refreshToken: body.refresh_token, appleUserId: claims.sub }
}

export async function saveAppleToken(
  admin: SupabaseClient,
  userId: string,
  clientId: string,
  refreshToken: string
): Promise<void> {
  const { error } = await admin.from('apple_tokens').upsert(
    {
      user_id: userId,
      client_id: clientId,
      refresh_token: refreshToken,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,client_id' }
  )
  if (error) throw new Error(`apple_tokens: ${error.message}`)
}

/**
 * Revoca todos los tokens de Apple guardados para el usuario. Va antes de
 * borrar el usuario de auth, porque la tabla se borra en cascada con él.
 *
 * Devuelve los problemas en vez de tirar: que Apple no conteste no puede
 * frenar un borrado de cuenta. Quien llama los registra.
 */
export async function revokeAppleTokens(
  admin: SupabaseClient,
  userId: string
): Promise<string[]> {
  const problems: string[] = []

  const { data: rows, error } = await admin
    .from('apple_tokens')
    .select('client_id, refresh_token')
    .eq('user_id', userId)
  if (error) return [`apple_tokens: ${error.message}`]
  if (!rows?.length) return problems

  if (!isAppleConfigured()) {
    return ['hay tokens de Apple pero faltan APPLE_KEY_ID / APPLE_PRIVATE_KEY']
  }

  for (const row of rows as { client_id: string; refresh_token: string }[]) {
    try {
      const res = await postToApple('/auth/revoke', row.client_id, {
        token: row.refresh_token,
        token_type_hint: 'refresh_token',
      })
      if (!res.ok) {
        problems.push(`revoke ${row.client_id}: Apple respondió ${res.status}`)
      }
    } catch (err) {
      problems.push(
        `revoke ${row.client_id}: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  return problems
}
