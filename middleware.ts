import { NextResponse, type NextRequest } from 'next/server'

/**
 * Minimal pass-through middleware.
 *
 * We intentionally do NOT call supabase.auth.getUser() here.
 *
 * Why: our app has no Server Components that require auth — all auth
 * checks are done client-side via createBrowserClient / onAuthStateChange.
 * Calling getUser() in middleware was causing Supabase's SDK to invoke
 * setAll() during token validation, which rebuilt NextResponse from scratch
 * and could write cookie-deletion headers (maxAge:0) into the response,
 * silently clearing the browser session right after login.
 *
 * Token refresh is handled automatically by createBrowserClient on the
 * client whenever an API call detects an expired access token.
 */
export function middleware(request: NextRequest) {
  return NextResponse.next({ request })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
