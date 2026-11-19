// SERVER-ONLY: usa la service role.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * La baja de los mails de Glynbox. Se guarda en `profiles.mail_baja_at`
 * (supabase-mail-prueba-2026-11.sql) y la respeta cualquier envío: quien la
 * tiene no vuelve a recibir nada.
 *
 * Cada mail lleva un token al azar de 32 caracteres que sólo sirve para dar de
 * baja a esa persona. Hoy los tokens viven en `mail_prueba.baja_token`; un
 * envío nuevo con su propia tabla tiene que sumarla en `usuarioDelToken`.
 *
 * El token "prueba" es el del mail de prueba: se ve todo, no se guarda nada.
 */

export const TOKEN_DE_PRUEBA = 'prueba'

export function tokenValido(t: unknown): t is string {
  return typeof t === 'string' && (t === TOKEN_DE_PRUEBA || /^[0-9a-f]{32}$/.test(t))
}

async function usuarioDelToken(admin: SupabaseClient, token: string): Promise<string | null> {
  const { data, error } = await admin.from('mail_prueba').select('user_id').eq('baja_token', token).maybeSingle()
  if (error) throw new Error(`mail_prueba: ${error.message}`)
  return (data as { user_id: string } | null)?.user_id ?? null
}

/** `true` si el token es de alguien (y quedó de baja, si no lo estaba). */
export async function darDeBaja(admin: SupabaseClient, token: string): Promise<boolean> {
  if (token === TOKEN_DE_PRUEBA) return true
  const userId = await usuarioDelToken(admin, token)
  if (!userId) return false
  const { error } = await admin
    .from('profiles')
    .update({ mail_baja_at: new Date().toISOString() })
    .eq('id', userId)
    .is('mail_baja_at', null)
  if (error) throw new Error(`profiles: ${error.message}`)
  return true
}
