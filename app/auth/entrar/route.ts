import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Canjea el link de un solo uso que arma `/api/sesion-web` (la app abriendo la
 * web con la sesión iniciada) y sigue a la página pedida.
 *
 * `next` tiene que ser una ruta propia ("/algo", nunca "//otro.sitio"): esto
 * deja una sesión iniciada, y no puede servir para mandar a nadie afuera.
 * Si el link ya se usó o venció, la página pedida igual se abre y pide entrar.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  const pedido = url.searchParams.get('next') ?? '/'
  const next = pedido.startsWith('/') && !pedido.startsWith('//') ? pedido : '/'

  if (tokenHash) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(toSet) {
            try {
              toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch {}
          },
        },
      }
    )
    const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
    if (error) console.error('[auth/entrar]', error.message)
  }

  return NextResponse.redirect(`${url.origin}${next}`)
}
