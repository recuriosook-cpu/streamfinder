import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST() {
  // Verify auth via session cookie
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options) } catch { /* read-only in some contexts */ }
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const userId = user.id

  // Admin client with service role — never exposed to the browser
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const errors: string[] = []

  async function tryDelete(label: string, promise: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await promise
    if (error) errors.push(`${label}: ${error.message}`)
  }

  // 1. review_likes
  await tryDelete('review_likes', admin.from('review_likes').delete().eq('user_id', userId))
  // 2. review_comments
  await tryDelete('review_comments', admin.from('review_comments').delete().eq('user_id', userId))
  // 3. reviews
  await tryDelete('reviews', admin.from('reviews').delete().eq('user_id', userId))
  // 4. ratings
  await tryDelete('ratings', admin.from('ratings').delete().eq('user_id', userId))
  // 5. watched
  await tryDelete('watched', admin.from('watched').delete().eq('user_id', userId))
  // 6. watchlist
  await tryDelete('watchlist', admin.from('watchlist').delete().eq('user_id', userId))
  // 7. favorites
  await tryDelete('favorites', admin.from('favorites').delete().eq('user_id', userId))
  // 8. follows (follower)
  await tryDelete('follows_follower', admin.from('follows').delete().eq('follower_id', userId))
  // 9. follows (following)
  await tryDelete('follows_following', admin.from('follows').delete().eq('following_id', userId))
  // 10. followed_actors
  await tryDelete('followed_actors', admin.from('followed_actors').delete().eq('user_id', userId))
  // 11. pinned_favorites
  await tryDelete('pinned_favorites', admin.from('pinned_favorites').delete().eq('user_id', userId))

  // 12. list_items (needs list IDs first)
  const { data: userLists } = await admin.from('lists').select('id').eq('user_id', userId)
  if (userLists?.length) {
    const listIds = userLists.map((l: { id: string }) => l.id)
    await tryDelete('list_items', admin.from('list_items').delete().in('list_id', listIds))
    // 13a. list_likes for user's lists
    await tryDelete('list_likes_lists', admin.from('list_likes').delete().in('list_id', listIds))
  }
  // 13b. list_likes made by the user
  await tryDelete('list_likes_user', admin.from('list_likes').delete().eq('user_id', userId))
  // 14. lists
  await tryDelete('lists', admin.from('lists').delete().eq('user_id', userId))
  // 15. notifications (user)
  await tryDelete('notifications_user', admin.from('notifications').delete().eq('user_id', userId))
  // 16. notifications (actor)
  await tryDelete('notifications_actor', admin.from('notifications').delete().eq('actor_id', userId))
  // 17. shared_stats
  await tryDelete('shared_stats', admin.from('shared_stats').delete().eq('user_id', userId))

  // 18. Delete avatar from storage (try common extensions)
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    try {
      await admin.storage.from('avatars').remove([`${userId}.${ext}`])
    } catch { /* ignore — file may not exist */ }
  }

  // 19. Delete profile row
  await tryDelete('profiles', admin.from('profiles').delete().eq('id', userId))

  // 20. Delete auth user
  const { error: authError } = await admin.auth.admin.deleteUser(userId)
  if (authError) errors.push(`auth.deleteUser: ${authError.message}`)

  if (errors.length > 0) {
    console.error('[delete-account] partial errors:', errors)
  }

  return NextResponse.json({ success: true })
}
