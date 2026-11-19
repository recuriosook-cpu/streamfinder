import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { requireAdminClient } from '@/lib/service-role'

/**
 * GET /api/admin/mail-prueba — bloque "Prueba mail-1" de `/admin/metricas`.
 *
 * Una fila por grupo (mail y control) de `mail_prueba_resultado`
 * (supabase-mail-prueba-2026-11.sql): cuántos volvieron a entrar en los 7 días
 * siguientes a su `enviado_at`, y cuántos llegaron por un link del mail.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const PRUEBA = 'mail-1'

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

export interface GrupoMailPrueba {
  grupo: 'mail' | 'control'
  asignados: number
  /** Con `enviado_at`: mail que salió, o control cuya tanda ya corrió. */
  conFecha: number
  /** De ésos, a los que ya les pasaron los 7 días. */
  ventanaCerrada: number
  volvieron: number
  /** Personas que entraron por un link del mail (sólo web). */
  desdeMail: number
  /** Visitas sin bots que entraron por un link del mail. */
  visitasMail: number
  bajas: number
  errores: number
  primerEnvio: string | null
  ultimoEnvio: string | null
}

export interface MailPruebaResumen {
  prueba: string
  estado: 'ok' | 'sin_migracion' | 'sin_asignar' | 'error'
  grupos: GrupoMailPrueba[]
}

function faltaLaMigracion(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (['42883', 'PGRST202', '42P01', 'PGRST205'].includes(error.code ?? '')) return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('could not find the function') || msg.includes('does not exist')
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/mail-prueba')
  if (failure) return failure

  const salida: MailPruebaResumen = { prueba: PRUEBA, estado: 'ok', grupos: [] }
  const { data, error } = await admin.rpc('mail_prueba_resultado', { p_prueba: PRUEBA })
  if (faltaLaMigracion(error)) return NextResponse.json({ ...salida, estado: 'sin_migracion' })
  if (error) {
    console.error('[admin/mail-prueba]', error.message)
    return NextResponse.json({ ...salida, estado: 'error' })
  }

  const n = (v: unknown) => Number(v) || 0
  salida.grupos = ((data ?? []) as Record<string, unknown>[]).map(r => ({
    grupo: r.grupo === 'mail' ? 'mail' : 'control',
    asignados: n(r.asignados),
    conFecha: n(r.con_fecha),
    ventanaCerrada: n(r.ventana_cerrada),
    volvieron: n(r.volvieron),
    desdeMail: n(r.desde_mail),
    visitasMail: n(r.visitas_mail),
    bajas: n(r.bajas),
    errores: n(r.errores),
    primerEnvio: (r.primer_envio as string | null) ?? null,
    ultimoEnvio: (r.ultimo_envio as string | null) ?? null,
  }))
  if (salida.grupos.length === 0) salida.estado = 'sin_asignar'

  return NextResponse.json(salida, { headers: { 'Cache-Control': 'private, no-store' } })
}
