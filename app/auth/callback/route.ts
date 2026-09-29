import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/service-role'
import { APPLE_WEB_CLIENT_ID, saveAppleToken } from '@/lib/apple-signin'

/**
 * Con qué se registró: 'email' | 'google' | 'facebook' | 'apple'.
 *
 * Supabase lo deja en app_metadata.provider. Si viniera algo raro, se manda
 * como 'desconocido' antes que perder el evento entero.
 */
function providerOf(user: { app_metadata?: { provider?: string } }): string {
  const p = user.app_metadata?.provider
  return p === 'email' || p === 'google' || p === 'facebook' || p === 'apple' ? p : 'desconocido'
}

/** El proveedor de la identidad que inició sesión más recientemente. */
function lastSignInProvider(user: {
  identities?: { provider: string; last_sign_in_at?: string }[]
}): string | null {
  let latest: { provider: string; at: string } | null = null
  for (const i of user.identities ?? []) {
    const at = i.last_sign_in_at ?? ''
    if (!latest || at > latest.at) latest = { provider: i.provider, at }
  }
  return latest?.provider ?? null
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
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

    const { data: exchanged } = await supabase.auth.exchangeCodeForSession(code)
    const { data: { user } } = await supabase.auth.getUser()

    // Login con Apple: el refresh token de Apple llega sólo en esta respuesta
    // y hace falta para revocar el acceso si la persona borra la cuenta (ver
    // lib/apple-signin.ts). Con qué entró ahora lo dice la identidad con el
    // último login, no app_metadata.provider, que es con qué se registró. Si
    // falla, el login sigue igual.
    const appleRefreshToken = exchanged.session?.provider_refresh_token
    if (user && lastSignInProvider(user) === 'apple' && appleRefreshToken) {
      try {
        await saveAppleToken(getAdminClient(), user.id, APPLE_WEB_CLIENT_ID, appleRefreshToken)
      } catch (err) {
        console.error('[auth/callback] apple token:', { userId: user.id, err })
      }
    }

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed, onboarding_skipped, username')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile) {
        const base = user.email?.split('@')[0].replace(/[^a-zA-Z0-9]/g, '') ?? 'user'
        const username = base + Math.floor(Math.random() * 999)
        await supabase.from('profiles').insert({
          id: user.id,
          username,
          display_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? username,
          avatar_url: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
          points: 0,
          level: 1,
          onboarding_completed: false,
        })

        // Acá es donde el registro se concreta: es la primera vez que este
        // usuario tiene fila en profiles. El evento `signup_completed` no se
        // puede mandar desde este handler —track() es del navegador, y meter un
        // segundo camino de ingesta del lado del servidor saltearía la lista
        // blanca y el sanitizado—, así que el método viaja en la URL y lo
        // dispara /onboarding al montar.
        const metodo = providerOf(user)
        const res = NextResponse.redirect(
          `https://glynbox.com/onboarding?nuevo=1&metodo=${encodeURIComponent(metodo)}`
        )
        res.cookies.set('new_user', 'true', { maxAge: 300, path: '/', sameSite: 'lax', httpOnly: false })
        return res
      }

      if (profile.onboarding_completed !== true && profile.onboarding_skipped !== true) {
        return NextResponse.redirect('https://glynbox.com/onboarding')
      }

      return NextResponse.redirect('https://glynbox.com/')
    }
  }

  return NextResponse.redirect('https://glynbox.com/')
}
