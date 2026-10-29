import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'

/**
 * POST /api/admin/borrar-comentario  { tipo, id }
 *
 * Borra un comentario reportado desde `/admin/reportes`. Va por acá y no desde
 * el navegador porque la RLS de `review_comments`, `list_comments` y
 * `guide_comments` sólo deja borrar al autor: desde el panel el DELETE no
 * borraba nada y no daba error. Sus respuestas se van en cascada y sus me
 * gusta, con el trigger de `comment_likes`.
 *
 * `tipo` es el `content_type` de `content_reports`.
 */

export const runtime = 'nodejs'

const TABLAS = {
  comment: 'review_comments',
  list_comment: 'list_comments',
  guide_comment: 'guide_comments',
} as const

/** Mismo criterio que el resto de `/api/admin`. */
async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options) } catch { /**/ } }) },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  return profile?.username === 'Ferlageok' ? user : null
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let tipo: keyof typeof TABLAS
  let id: string
  try {
    const body = (await req.json()) as { tipo?: string; id?: string }
    if (!body.id || !body.tipo || !Object.hasOwn(TABLAS, body.tipo)) throw new Error('datos')
    tipo = body.tipo as keyof typeof TABLAS
    id = body.id
  } catch {
    return NextResponse.json({ error: 'tipo e id requeridos' }, { status: 400 })
  }

  const { admin, failure } = requireAdminClient('admin/borrar-comentario')
  if (failure) return failure

  const { error } = await admin.from(TABLAS[tipo]).delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
