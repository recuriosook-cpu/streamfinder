import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente admin de Supabase, con la service role key.
 *
 * Existe por un bug concreto: el código pedía `SUPABASE_SERVICE_ROLE_KEY` y el
 * entorno define `SUPABASE_SERVICE_ROLE`. Con el `!` de TypeScript eso pasaba
 * `undefined` a `createClient`, que no se queja al construirse: devuelve un
 * cliente que falla con 401 en cada request. `/api/delete-account` juntaba esos
 * errores y contestaba `success: true` igual, así que una cuenta "borrada"
 * seguía existiendo.
 *
 * Acá se aceptan los dos nombres y, si no hay ninguno, se avisa fuerte en vez
 * de devolver un cliente roto que falla más tarde y más lejos.
 */

export class MissingServiceRoleError extends Error {
  constructor() {
    super(
      'Falta la service role key. Definí SUPABASE_SERVICE_ROLE_KEY (o ' +
        'SUPABASE_SERVICE_ROLE) en las variables de entorno del proyecto.'
    )
    this.name = 'MissingServiceRoleError'
  }
}

/** La key, mirando los dos nombres. `null` si no hay ninguna usable. */
export function readServiceRoleKey(): string | null {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE

  // Un placeholder tipo "your-key-here" es peor que no tener nada: construye un
  // cliente que parece válido y falla en cada llamada.
  if (!key || key.length < 40) return null
  return key
}

/**
 * Cliente con permisos de admin.
 *
 * Tira `MissingServiceRoleError` en vez de devolver algo roto: quien llama
 * tiene que poder distinguir "no está configurado" de "la operación falló".
 */
export function getAdminClient(): SupabaseClient {
  const key = readServiceRoleKey()
  if (!key) throw new MissingServiceRoleError()

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
