import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Quién hace el pedido, o `null` si nadie logueado.
 *
 * La web manda la cookie de sesión; la app, `Authorization: Bearer
 * <access_token>` (no maneja cookies). En los dos casos el token lo valida
 * Supabase contra su firma, así que no alcanza con inventarse un id.
 */
export async function getRequestUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data } = await supabase.auth.getUser(authHeader.slice('Bearer '.length))
    return data.user?.id ?? null
  }

  const cookieStore = await cookies()
  if (cookieStore.getAll().length === 0) return null
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() { /* sólo lectura: acá no se renueva la sesión */ },
      },
    }
  )
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}
