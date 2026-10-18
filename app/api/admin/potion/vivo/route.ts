import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPotionClient } from '@/lib/potion-supabase'
import { LANZAMIENTO } from '@/lib/potion-panel'

/**
 * GET /api/admin/potion/vivo
 *
 * Las cuatro tarjetas de arriba de `/admin/potion`. No recibe parámetros: no
 * dependen del rango ni de la casilla del lanzamiento, siempre cuentan desde
 * el lanzamiento. La página la pide cada 60 segundos.
 *
 * ── Por qué se agrupa acá y no en SQL ─────────────────────────────────────
 *
 * El resto del panel vive en la RPC `potion_panel`, que hay que correr a mano
 * en el proyecto del juego. Esto se resolvió sin tocar esa base: se bajan
 * sólo tres columnas de los eventos desde el lanzamiento, paginando. Con unos
 * pocos miles de eventos es un pedido; si la tabla crece a cientos de miles,
 * conviene pasarlo a una función SQL como `potion_panel`.
 *
 * Igual que `potion-panel.sql`: las fechas son `recibido` (llegada al
 * servidor) y los eventos de `version = 'prueba'` no cuentan.
 */

export const runtime = 'nodejs'

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

export interface PotionVivo {
  disponible: boolean
  /** Instalaciones con algún evento recibido en los últimos 15 minutos. */
  jugandoAhora: number
  /** Instalaciones con algún evento recibido desde las 0 de hoy en Argentina. */
  jugaronHoy: number
  /** Instalaciones cuyo primer `app_abre` desde el lanzamiento fue en el nivel 1. */
  reales: number
  /** Todas las instalaciones con algún evento desde el lanzamiento. */
  total: number
  generadoEn: string
}

const AHORA_MS = 15 * 60_000
const PAGINA = 1000

/**
 * Las 0 de hoy en Buenos Aires. Argentina no tiene horario de verano, así que
 * el `-03:00` fijo es exacto.
 */
function inicioDeHoyAR(ahora: Date): Date {
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(ahora)
  return new Date(`${dia}T00:00:00-03:00`)
}

type Fila = { instalacion: string | null; nombre: string; recibido: string; props: Record<string, unknown> | null }

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const vacio: PotionVivo = {
    disponible: false, jugandoAhora: 0, jugaronHoy: 0, reales: 0, total: 0, generadoEn: new Date().toISOString(),
  }

  const potion = getPotionClient()
  if (!potion) return NextResponse.json(vacio)

  // Ordenados por llegada: el primer `app_abre` de cada instalación es el
  // primero que aparece. `id` desempata para que la paginación no saltee filas.
  const filas: Fila[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await potion
      .from('potion_eventos')
      .select('instalacion, nombre, recibido, props')
      .gte('recibido', LANZAMIENTO)
      .or('version.is.null,version.neq.prueba')
      .order('recibido', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA - 1)
    if (error) {
      console.error('[admin/potion/vivo] la consulta falló:', error.message)
      return NextResponse.json(vacio)
    }
    filas.push(...((data ?? []) as Fila[]))
    if (!data || data.length < PAGINA) break
  }

  const ahora = new Date()
  const corteAhora = ahora.getTime() - AHORA_MS
  const corteHoy = inicioDeHoyAR(ahora).getTime()

  const total = new Set<string>()
  const hoy = new Set<string>()
  const enJuego = new Set<string>()
  /** Instalación → si su primer `app_abre` fue en el nivel 1. */
  const primerAbre = new Map<string, boolean>()

  for (const f of filas) {
    if (!f.instalacion) continue
    total.add(f.instalacion)
    const t = new Date(f.recibido).getTime()
    if (t >= corteHoy) hoy.add(f.instalacion)
    if (t >= corteAhora) enJuego.add(f.instalacion)
    if (f.nombre === 'app_abre' && !primerAbre.has(f.instalacion)) {
      primerAbre.set(f.instalacion, Number(f.props?.nivel) === 1)
    }
  }

  let reales = 0
  for (const esReal of primerAbre.values()) if (esReal) reales++

  const vivo: PotionVivo = {
    disponible: true,
    jugandoAhora: enJuego.size,
    jugaronHoy: hoy.size,
    reales,
    total: total.size,
    generadoEn: ahora.toISOString(),
  }
  return NextResponse.json(vivo, { headers: { 'Cache-Control': 'no-store' } })
}
