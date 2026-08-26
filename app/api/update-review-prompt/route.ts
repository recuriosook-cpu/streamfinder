import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * POST /api/update-review-prompt — guarda qué contestó al pedido de calificación.
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
 * cookies, así que lo único que obtendría de acá es un `401`.
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

type ReviewPromptStatus = 'pending' | 'later' | 'reviewed' | 'declined'

export async function POST(req: NextRequest) {
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const status = body.status as ReviewPromptStatus | undefined
  const valid: ReviewPromptStatus[] = ['pending', 'later', 'reviewed', 'declined']
  if (!status || !valid.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ review_prompt_status: status, review_prompt_last_shown: new Date().toISOString() })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
