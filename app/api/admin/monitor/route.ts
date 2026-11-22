import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { requireAdminClient } from '@/lib/service-role'

/**
 * GET /api/admin/monitor — el último chequeo del monitor contra robots y
 * gastos de más (Edge Function `monitor-glynbox`, supabase-monitor-2026-11.sql).
 * Cartel "Monitor" del Resumen.
 *
 * `monitor_chequeos` es sólo de la service role.
 */

export const runtime = 'nodejs'

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

export interface MonitorUltimo {
  /** `null` si el monitor todavía no corrió nunca. */
  chequeo: {
    creadoEn: string
    estado: 'normal' | 'alerta' | 'error'
    alertas: { clave: string; texto: string }[]
    errores: { fuente: string; error: string }[]
    /** Claves que salieron por push en ese chequeo. */
    avisadas: string[]
  } | null
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { admin, failure } = requireAdminClient('admin/monitor')
  if (failure) return failure

  const { data, error } = await admin
    .from('monitor_chequeos')
    .select('creado_en, estado, alertas, errores, avisadas')
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[admin/monitor]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const respuesta: MonitorUltimo = {
    chequeo: data
      ? {
          creadoEn: data.creado_en,
          estado: data.estado,
          alertas: data.alertas ?? [],
          errores: data.errores ?? [],
          avisadas: data.avisadas ?? [],
        }
      : null,
  }
  return NextResponse.json(respuesta, { headers: { 'Cache-Control': 'no-store' } })
}
