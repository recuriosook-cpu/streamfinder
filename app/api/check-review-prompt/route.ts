import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * GET /api/check-review-prompt — ¿corresponde pedirle una calificación a esta persona?
 *
 * ── Sin llamador desde la web, a propósito ─────────────────────────────────
 *
 * Hasta agosto de 2026 esto lo consumía un modal en el home
 * (`components/ReviewPromptDialog.tsx`, disparado desde `HomeClient`) que
 * invitaba a calificar la app en Play Store. Venía de cuando la web se
 * empaquetaba como TWA: adentro de ese envoltorio, quien lo veía sí tenía la
 * app instalada y podía calificarla.
 *
 * Con la app nativa andando, en el navegador dejó de tener sentido: a alguien
 * que entra desde Chrome se le pedía reseñar una app que no tiene. Y desde que
 * existe la barra de descarga (`components/AppDownloadBarGate.tsx`), además
 * competía con ella — un modal pidiendo reseña encima de una barra pidiendo
 * instalación, a la misma persona, en la misma pantalla.
 *
 * Así que se sacó el modal, no el endpoint. La ruta y las columnas
 * (`profiles.review_prompt_status`, `profiles.review_prompt_last_shown`) quedan
 * intactas porque guardan a quién ya se le preguntó y qué contestó. Borrarlas
 * perdería eso para siempre; dejarlas no cuesta nada.
 *
 * ── Si alguna vez la app nativa tiene que usar esto ────────────────────────
 *
 * Hoy no puede, y conviene ser explícito sobre por qué: esta ruta autentica
 * solamente con la cookie de sesión, vía `createServerClient()` + `cookies()`.
 * La app guarda el JWT de Supabase en el keystore del teléfono y no maneja
 * cookies, así que lo único que obtendría de acá es `{ shouldShow: false, reason: 'not_logged_in' }`.
 *
 * Para abrirla haría falta lo mismo que ya tienen las rutas que sí sirven a la
 * app —`/api/delete-account`, `/api/user-stats/[userId]`—: un handler `OPTIONS`,
 * los headers de CORS, y un camino que lea `Authorization: Bearer <token>`
 * además de la cookie. No se agregó porque nadie lo pidió, y agregar superficie
 * pública que nadie usa es peor que no tenerla.
 *
 * (Vale igual la aclaración: para pedir calificación desde una app nativa de
 * Android, Google pide usar la In-App Review API, no un link a la ficha de
 * Play Store. Este endpoint sirve para llevar el registro de a quién se le
 * preguntó, no para reemplazar aquello.)
 */

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
