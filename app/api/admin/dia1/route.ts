import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { requireAdminClient } from '@/lib/service-role'
import { COLUMNAS_FILA, aperturas, faltaLaTabla, revisarRecibos, type FilaEnvio } from '@/lib/push-envios'
import { probarDia1, type ResultadoPruebaDia1 } from '@/lib/push-dia1'

/**
 * /api/admin/dia1 — "Para esta noche", la push del día 1, en el panel.
 *
 *   GET    el historial de envíos y pruebas
 *   POST   arma la de quien está en el panel y se la manda sólo a él
 *
 * Los envíos reales los hace únicamente `/api/cron/push-dia1`.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const HISTORIAL = 20

/** Mismo criterio de admin que el resto de `/api/admin`. */
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

export interface EnvioDia1 {
  id: number
  prueba: boolean
  /** En un envío real, cuántas personas ("3 personas nuevas"); en una prueba, el texto que llegó. */
  cuerpo: string
  mediaType: 'movie' | 'tv' | null
  tmdbId: number | null
  creadoEn: string
  destinatarios: number
  enviados: number | null
  fallidos: number | null
  tokensBorrados: number
  abiertas: number
  recibosPendientes: boolean
}

export interface Dia1Estado {
  /** `false` si falta correr `supabase-push-dia1-2026-10.sql`. */
  disponible: boolean
  historial: EnvioDia1[]
  /** Totales de los envíos reales (sin pruebas) del historial. */
  totales: { personas: number; enviados: number; fallidos: number; abiertas: number }
}

export type { ResultadoPruebaDia1 }

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/dia1')
  if (failure) return failure

  const vacio: Dia1Estado = { disponible: false, historial: [], totales: { personas: 0, enviados: 0, fallidos: 0, abiertas: 0 } }
  const { count: personas, error: tablaError } = await admin
    .from('push_dia1_enviados')
    .select('user_id', { head: true, count: 'exact' })
  if (faltaLaTabla(tablaError)) return NextResponse.json(vacio)

  const { data, error } = await admin
    .from('push_envios')
    .select(COLUMNAS_FILA)
    .eq('tipo', 'dia1')
    .order('creado_en', { ascending: false })
    .limit(HISTORIAL)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  const filas = (data ?? []) as unknown as FilaEnvio[]
  await revisarRecibos(admin, filas)
  const abiertas = await aperturas(admin, 'dia1', filas)

  const historial: EnvioDia1[] = filas.map(f => ({
    id: f.id,
    prueba: f.prueba,
    cuerpo: f.cuerpo,
    mediaType: f.media_type,
    tmdbId: f.tmdb_id,
    creadoEn: f.creado_en,
    destinatarios: f.destinatarios,
    enviados: f.enviados,
    fallidos: f.fallidos,
    tokensBorrados: f.tokens_borrados,
    abiertas: abiertas.get(f.id) ?? 0,
    recibosPendientes: !f.recibos_revisados_en && !!f.tickets,
  }))
  const reales = historial.filter(h => !h.prueba)
  const estado: Dia1Estado = {
    disponible: true,
    historial,
    totales: {
      personas: personas ?? 0,
      enviados: reales.reduce((s, h) => s + (h.enviados ?? 0), 0),
      fallidos: reales.reduce((s, h) => s + (h.fallidos ?? 0), 0),
      abiertas: reales.reduce((s, h) => s + h.abiertas, 0),
    },
  }
  return NextResponse.json(estado)
}

export async function POST() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/dia1')
  if (failure) return failure

  try {
    const resultado = await probarDia1(admin, user.id)
    return NextResponse.json(resultado)
  } catch (err) {
    return NextResponse.json({ message: (err as Error).message }, { status: 500 })
  }
}
