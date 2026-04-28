import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

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
        .select('onboarding_completed, username')
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
        return NextResponse.redirect('https://glynbox.com/onboarding')
      }

      if (profile.onboarding_completed !== true) {
        return NextResponse.redirect('https://glynbox.com/onboarding')
      }

      return NextResponse.redirect('https://glynbox.com/')
    }
  }

  return NextResponse.redirect('https://glynbox.com/')
}
