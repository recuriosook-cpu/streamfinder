import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Required by @supabase/ssr — refreshes the access token on every request
 * and writes updated cookies into the response so the browser keeps a valid
 * session without ever seeing a stale/expired token.
 *
 * This does NOT protect routes — pages do their own auth checks.
 * The only job here is cookie refresh.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // Bail out early if env vars are not configured (prevents noisy errors in CI)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: keep no logic between createServerClient and getUser().
  // getUser() performs the token refresh if the access token is expired.
  // Wrap in try/catch so a network error on Edge doesn't break the page.
  try {
    await supabase.auth.getUser()
  } catch {
    // Auth service unavailable — let the page render and handle auth itself
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
