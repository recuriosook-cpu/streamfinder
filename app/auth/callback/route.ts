import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * Con qué se registró: 'email' | 'google' | 'facebook'.
 *
 * Supabase lo deja en app_metadata.provider. Si viniera algo raro, se manda
 * como 'desconocido' antes que perder el evento entero.
 */
function providerOf(user: { app_metadata?: { provider?: string } }): string {
  const p = user.app_metadata?.provider
  return p === 'email' || p === 'google' || p === 'facebook' ? p : 'desconocido'
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

    await supabase.auth.exchangeCodeForSession(code)
    const { data: { user } } = await supabase.auth.getUser()

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
