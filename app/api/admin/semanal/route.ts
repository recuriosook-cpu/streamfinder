import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { requireAdminClient } from '@/lib/service-role'
import { COLUMNAS_FILA, aperturas, faltaLaTabla, revisarRecibos, type FilaEnvio } from '@/lib/push-envios'
import { probarSemanal, proximaCorrida, type ResultadoPrueba } from '@/lib/resumen-semanal'

/**
 * /api/admin/semanal — "Tu resumen semanal" en el panel.
 *
 *   GET    cuándo corre la próxima y el historial de corridas y pruebas
 *   POST   arma la semanal de quien está en el panel y se la manda sólo a él
 *
 * La corrida real la hace únicamente `/api/cron/resumen-semanal`: desde acá no
 * hay forma de mandarle la semanal a nadie más.
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

export interface CorridaSemanal {
  id: number
  prueba: boolean
  /** En una corrida real, el resumen ("12 personas: …"); en una prueba, el texto que llegó. */
  cuerpo: string
  /** Sólo en las pruebas: el título que tocó. */
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

export interface SemanalEstado {
  /** `false` si falta correr `supabase-push-semanal-2026-10.sql`. */
  disponible: boolean
  proximaCorrida: string
  historial: CorridaSemanal[]
}

export type { ResultadoPrueba }

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/semanal')
  if (failure) return failure

  const { data, error } = await admin
    .from('push_envios')
    .select(COLUMNAS_FILA)
    .eq('tipo', 'semanal')
    .order('creado_en', { ascending: false })
    .limit(HISTORIAL)

  // Sin el SQL nuevo, el CHECK de `tipo` no deja guardar 'semanal' y la tabla
  // de enviados no existe: se avisa con la segunda.
  const { error: tablaError } = await admin
    .from('push_semanal_enviados')
    .select('id', { head: true, count: 'exact' })
    .limit(1)
  if (faltaLaTabla(tablaError) || faltaLaTabla(error)) {
    const vacio: SemanalEstado = { disponible: false, proximaCorrida: proximaCorrida(), historial: [] }
    return NextResponse.json(vacio)
  }
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })

  const filas = (data ?? []) as unknown as FilaEnvio[]
  await revisarRecibos(admin, filas)
  const abiertas = await aperturas(admin, 'semanal', filas)

  const estado: SemanalEstado = {
    disponible: true,
    proximaCorrida: proximaCorrida(),
    historial: filas.map(f => ({
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
    })),
  }
  return NextResponse.json(estado)
}

export async function POST() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/semanal')
  if (failure) return failure

  try {
    const resultado = await probarSemanal(admin, user.id)
    return NextResponse.json(resultado)
  } catch (err) {
    return NextResponse.json({ message: (err as Error).message }, { status: 500 })
  }
}
