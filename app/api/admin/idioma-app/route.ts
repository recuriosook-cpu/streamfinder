import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { requireAdminClient } from '@/lib/service-role'
import { precalculado, FRESCO_RAPIDO } from '@/lib/admin-precalculado'

/**
 * GET /api/admin/idioma-app — en qué idioma usan la app las instalaciones que
 * la abrieron en los últimos 30 días. Bloque "Idioma de la app" de
 * `/admin/metricas`.
 *
 * Una instalación es un `anon_id` con `app_open` de la app en la ventana. Su
 * idioma es el último que mandó: `app_open.props.idioma` o
 * `idioma_cambiado.props.idioma` (los dos desde el 25/10).
 *
 * Las versiones de antes no lo mandan. Para esas, si la instalación tiene
 * sesión, se usa `profiles.idioma` de la cuenta (que la app guarda desde la
 * 1.0.16) y se cuenta aparte: es por cuenta y no por instalación, y no cubre
 * a quien no tiene cuenta. El resto queda "sin dato", y va bajando a medida
 * que la gente actualiza.
 *
 * Lo cuenta `admin_idioma_app()` en la base (`supabase-panel-app-2026-10.sql`)
 * y pg_cron lo deja calculado cada hora: con 29.000 `app_open` en 30
 * días, bajarlos de a 1000 filas se cortaba por tiempo desde el 26/10.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

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

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface ConteoIdioma {
  /** Las dos fuentes sumadas. */
  total: number
  /** Por lo que mandó la app en sus eventos. */
  evento: number
  /** Por `profiles.idioma` de la cuenta: versiones sin el dato. */
  cuenta: number
}

export interface IdiomaApp {
  /** Instalaciones que abrieron la app en los últimos 30 días. */
  instalaciones: number
  es: ConteoIdioma
  en: ConteoIdioma
  sinDato: number
  /** El primer evento con idioma: desde cuándo lo manda la app. */
  desde: string | null
  /** Elecciones en Ajustes en la ventana, por idioma elegido. */
  cambios: { aEs: number; aEn: number }
}

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/idioma-app')
  if (failure) return failure

  const { data, error } = await precalculado(admin, 'admin_idioma_app', FRESCO_RAPIDO,
    () => admin.rpc('admin_idioma_app'))
  if (error) {
    const falta = error.code === '42883' || error.code === 'PGRST202'
    console.error('[admin/idioma-app]', error.message)
    return NextResponse.json(
      { message: falta ? 'Falta correr supabase-panel-app-2026-10.sql.' : error.message },
      { status: 500 }
    )
  }
  return NextResponse.json(data as IdiomaApp)
}
