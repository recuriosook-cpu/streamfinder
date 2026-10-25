import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminClient } from '@/lib/service-role'

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
 * Son pocas filas (unos 3.600 `app_open` de la app en 30 días, en octubre),
 * así que se cuenta acá y no hace falta una función en la base.
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

type Idioma = 'es' | 'en'

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

// ── Lectura ────────────────────────────────────────────────────────────────

const VENTANA_MS = 30 * 24 * 60 * 60 * 1000

interface Evento {
  name: string
  anon_id: string
  user_id: string | null
  props: Record<string, unknown> | null
  created_at: string
}

async function eventos(admin: SupabaseClient, desde: string): Promise<Evento[]> {
  const filas: Evento[] = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await admin
      .from('analytics_events')
      .select('name, anon_id, user_id, props, created_at')
      .in('name', ['app_open', 'idioma_cambiado'])
      .eq('platform', 'mobile')
      .eq('is_bot', false)
      .gte('created_at', desde)
      .order('created_at', { ascending: true })
      .range(d, d + 999)
    if (error) throw new Error(error.message)
    filas.push(...((data ?? []) as Evento[]))
    if (!data || data.length < 1000) break
  }
  return filas
}

/** `profiles.idioma` de esas cuentas, sólo las que lo tienen. */
async function idiomaDeCuentas(admin: SupabaseClient, ids: string[]): Promise<Map<string, Idioma>> {
  const salida = new Map<string, Idioma>()
  // De a tandas: la lista va en la URL de PostgREST.
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, idioma')
      .in('id', ids.slice(i, i + 200))
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as { id: string; idioma: string | null }[]) {
      if (row.idioma === 'es' || row.idioma === 'en') salida.set(row.id, row.idioma)
    }
  }
  return salida
}

const idiomaDe = (e: Evento): Idioma | null => {
  const v = e.props?.idioma
  return v === 'es' || v === 'en' ? v : null
}

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/idioma-app')
  if (failure) return failure

  try {
    const evs = await eventos(admin, new Date(Date.now() - VENTANA_MS).toISOString())

    // Vienen en orden: el último que se pisa es el más reciente.
    const porInstalacion = new Map<string, { idioma: Idioma | null; usuario: string | null }>()
    let desde: string | null = null
    const cambios = { aEs: 0, aEn: 0 }
    for (const e of evs) {
      const inst = porInstalacion.get(e.anon_id) ?? { idioma: null, usuario: null }
      const idioma = idiomaDe(e)
      if (idioma) {
        inst.idioma = idioma
        desde ??= e.created_at
      }
      if (e.user_id) inst.usuario = e.user_id
      porInstalacion.set(e.anon_id, inst)

      if (e.name === 'idioma_cambiado' && idioma) {
        if (idioma === 'es') cambios.aEs++
        else cambios.aEn++
      }
    }

    const sinIdioma = [...porInstalacion.values()].filter(i => !i.idioma && i.usuario)
    const cuentas = await idiomaDeCuentas(admin, [...new Set(sinIdioma.map(i => i.usuario!))])

    const conteo = (): ConteoIdioma => ({ total: 0, evento: 0, cuenta: 0 })
    const salida: IdiomaApp = {
      instalaciones: porInstalacion.size,
      es: conteo(),
      en: conteo(),
      sinDato: 0,
      desde,
      cambios,
    }
    for (const inst of porInstalacion.values()) {
      if (inst.idioma) {
        salida[inst.idioma].evento++
        salida[inst.idioma].total++
        continue
      }
      const deCuenta = inst.usuario ? cuentas.get(inst.usuario) : undefined
      if (deCuenta) {
        salida[deCuenta].cuenta++
        salida[deCuenta].total++
      } else {
        salida.sinDato++
      }
    }

    return NextResponse.json(salida)
  } catch (err) {
    console.error('[admin/idioma-app]', (err as Error).message)
    return NextResponse.json({ message: (err as Error).message }, { status: 500 })
  }
}
