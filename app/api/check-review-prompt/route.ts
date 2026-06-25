import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const CACHE = { headers: { 'Cache-Control': 'private, max-age=300' } }

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) {
          cs.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options) } catch { /* read-only ctx */ }
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ shouldShow: false, reason: 'not_logged_in' }, CACHE)

  const { data: profile } = await supabase
    .from('profiles')
    .select('review_prompt_status, review_prompt_last_shown')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) return NextResponse.json({ shouldShow: false, reason: 'no_profile' }, CACHE)

  if (profile.review_prompt_status === 'reviewed') {
    return NextResponse.json({ shouldShow: false, reason: 'already_reviewed' }, CACHE)
  }

  if (profile.review_prompt_status === 'declined') {
    return NextResponse.json({ shouldShow: false, reason: 'declined' }, CACHE)
  }

  if (profile.review_prompt_status === 'later' && profile.review_prompt_last_shown) {
    const daysSince = (Date.now() - new Date(profile.review_prompt_last_shown).getTime()) / 86_400_000
    if (daysSince < 7) {
      return NextResponse.json({ shouldShow: false, reason: 'cooldown' }, CACHE)
    }
  }

  const daysSinceSignup = (Date.now() - new Date(user.created_at).getTime()) / 86_400_000
  if (daysSinceSignup < 3) {
    return NextResponse.json({ shouldShow: false, reason: 'too_new' }, CACHE)
  }

  const [watchedRes, ratingsRes, reviewsRes, listsRes] = await Promise.all([
    supabase.from('watched').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('ratings').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('lists').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const hasEnoughActivity =
    (watchedRes.count ?? 0) >= 5 ||
    (ratingsRes.count ?? 0) >= 3 ||
    (reviewsRes.count ?? 0) >= 1 ||
    (listsRes.count ?? 0) >= 1

  if (!hasEnoughActivity) {
    return NextResponse.json({ shouldShow: false, reason: 'not_enough_activity' }, CACHE)
  }

  return NextResponse.json({ shouldShow: true, reason: 'all_conditions_met' }, CACHE)
}
