import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getAdminClient, MissingServiceRoleError } from '@/lib/service-role'
import { cookies } from 'next/headers'

/**
 * CORS para la app nativa, que llama desde otro origen.
 *
 * `Authorization` tiene que estar permitido: la app no manda cookies, se
 * identifica con el token de sesión de Supabase en ese header.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
} as const

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * Resuelve quién está llamando.
 *
 * Dos caminos, en este orden:
 *
 *  1. La cookie de sesión, que es como llama la web. Sin cambios respecto de
 *     antes.
 *  2. Un `Authorization: Bearer <access_token>`, que es la única forma que
 *     tiene la app nativa: guarda el JWT de Supabase en el keystore del
 *     teléfono y no maneja cookies.
 *
 * En los dos casos el token lo valida Supabase contra su propia firma, así que
 * el segundo camino no afloja la autorización: sigue haciendo falta una sesión
 * real del dueño de la cuenta para borrarla.
 */
async function resolveUserId(req: NextRequest): Promise<string | null> {
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
  if (user) return user.id

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice('Bearer '.length)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null

  return data.user.id
}

export async function POST(req: NextRequest) {
  const userId = await resolveUserId(req)
  if (!userId) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  // Admin client with service role — never exposed to the browser.
  // Si falta la key se corta acá. Antes se construía un cliente con la key en
  // `undefined`, que fallaba con 401 en cada borrado mientras la respuesta
  // seguía diciendo que había salido bien.
  let admin
  try {
    admin = getAdminClient()
  } catch (err: unknown) {
    if (err instanceof MissingServiceRoleError) {
      console.error('[delete-account]', err.message)
      return NextResponse.json(
        {
          error: 'delete_failed',
          message:
            'La cuenta no se pudo borrar por un problema de configuración del servidor. Escribinos y lo resolvemos.',
        },
        { status: 500, headers: CORS_HEADERS }
      )
    }
    throw err
  }

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

  // La prueba de que se borró: si el usuario todavía existe en auth, no se
  // borró, por más que las tablas hayan salido bien.
  const { data: stillThere } = await admin.auth.admin.getUserById(userId)

  if (errors.length > 0 || stillThere?.user) {
    console.error('[delete-account] failed:', {
      userId,
      errors,
      authUserStillExists: Boolean(stillThere?.user),
    })

    return NextResponse.json(
      {
        error: 'delete_failed',
        message:
          'No pudimos borrar la cuenta por completo. No se borró nada a medias sin avisar: escribinos y lo resolvemos a mano.',
        // Los detalles sólo fuera de producción: nombran tablas internas.
        ...(process.env.NODE_ENV === 'production' ? {} : { details: errors }),
      },
      { status: 500, headers: CORS_HEADERS }
    )
  }

  return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
}
