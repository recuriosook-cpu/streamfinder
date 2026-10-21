import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireAdminClient } from '@/lib/service-role'
import { fetchAllRows, diaAR, inicioDiaAR } from '@/lib/admin-filas'

/**
 * GET /api/admin/contenido
 *
 * Lo que el panel calculaba desde el navegador sobre reseñas, calificaciones,
 * listas, "Ver después" y favoritos: los totales, la actividad de los últimos
 * 7 días, los títulos más calificados y agregados, los usuarios más activos y
 * la actividad por hora.
 *
 * Se mudó acá por dos problemas que daban números falsos sin avisar:
 *
 *   1. Desde el navegador las consultas van con la anon key y pasan por RLS:
 *      la actividad de quien tiene el perfil o la actividad ocultos no se
 *      veía. Una métrica cuenta a todos; acá va con la service role.
 *   2. PostgREST devuelve como mucho 1000 filas por pedido. Un `.limit(10000)`
 *      sobre `ratings` (más de 6000) traía 1000 cualquiera y el top salía de
 *      esa muestra. Acá todo se lee entero, en tandas (`lib/admin-filas.ts`).
 *
 * Los días son de Argentina.
 */

export const runtime = 'nodejs'

// ── Auth ───────────────────────────────────────────────────────────────────

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

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface TopMedia {
  media_id: number
  media_type: string
  title: string
  poster_path: string | null
  count: number
}

export interface UsuarioActivo {
  id: string
  username: string | null
  avatar_url: string | null
  resenas: number
  listas: number
  calificaciones: number
  verDespues: number
  favoritos: number
  total: number
}

export interface AdminContenido {
  totales: { resenas: number; listas: number }
  /** Los últimos 7 días de Argentina, hoy incluido, del más viejo al de hoy. */
  porDia: { dia: string; resenas: number; calificaciones: number; listas: number }[]
  /** Los 5 más calificados y los 5 más agregados a "Ver después" en esos 7 días. */
  semana: { calificadas: TopMedia[]; agregadas: TopMedia[] }
  /** De siempre: los 20 con más gente que los agregó o calificó. */
  topVerDespues: TopMedia[]
  topCalificadas: TopMedia[]
  topUsuarios: UsuarioActivo[]
  /**
   * Eventos de personas (web y app) por hora de Argentina, últimos 30 días.
   * `null` si falta la función `admin_actividad_por_hora`
   * (supabase-metricas-2026-10.sql).
   */
  porHora: { hora: number; eventos: number; personas: number }[] | null
  generadoEn: string
}

// ── Caché de módulo (60s, igual que /api/admin/overview) ──────────────────

let cache: { data: AdminContenido; ts: number } | null = null
const TTL = 60_000

// ── Cálculo ────────────────────────────────────────────────────────────────

type FilaMedia = { media_id: number; media_type: string; title: string; poster_path: string | null }

/** Cuenta por título y devuelve los `n` con más filas. */
function top<T extends FilaMedia>(filas: T[], n: number): TopMedia[] {
  const conteo = new Map<string, TopMedia>()
  for (const f of filas) {
    const k = `${f.media_id}-${f.media_type}`
    const t = conteo.get(k) ?? {
      media_id: f.media_id, media_type: f.media_type, title: f.title, poster_path: f.poster_path, count: 0,
    }
    t.count++
    conteo.set(k, t)
  }
  return [...conteo.values()].sort((a, b) => b.count - a.count).slice(0, n)
}

function contarPor<T extends { user_id: string }>(filas: T[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const f of filas) m.set(f.user_id, (m.get(f.user_id) ?? 0) + 1)
  return m
}

async function porHoraDe(admin: SupabaseClient): Promise<AdminContenido['porHora']> {
  const { data, error } = await admin.rpc('admin_actividad_por_hora', { p_dias: 30 })
  if (error) {
    console.warn('[admin/contenido] admin_actividad_por_hora:', error.message)
    return null
  }
  return ((data ?? []) as { hora: number; eventos: number; personas: number }[]).map(f => ({
    hora: Number(f.hora), eventos: Number(f.eventos), personas: Number(f.personas),
  }))
}

async function buildContenido(admin: SupabaseClient): Promise<AdminContenido> {
  const semanaDesde = inicioDiaAR(6)

  const [ratings, watchlist, reviews, lists, favorites, profiles, porHora] = await Promise.all([
    fetchAllRows<FilaMedia & { user_id: string; rated_at: string }>(
      admin, 'ratings', 'user_id, media_id, media_type, title, poster_path, rated_at'),
    fetchAllRows<FilaMedia & { user_id: string; added_at: string }>(
      admin, 'watchlist', 'user_id, media_id, media_type, title, poster_path, added_at'),
    fetchAllRows<{ user_id: string; created_at: string }>(admin, 'reviews', 'user_id, created_at'),
    fetchAllRows<{ user_id: string; created_at: string }>(admin, 'lists', 'user_id, created_at'),
    fetchAllRows<{ user_id: string }>(admin, 'favorites', 'user_id'),
    fetchAllRows<{ id: string; username: string | null; avatar_url: string | null }>(
      admin, 'profiles', 'id, username, avatar_url'),
    porHoraDe(admin),
  ])

  // ── Últimos 7 días, por día de Argentina ────────────────────────────────
  const dias = Array.from({ length: 7 }, (_, i) => diaAR(Date.now() - (6 - i) * 86_400_000))
  const porDia = dias.map(dia => ({ dia, resenas: 0, calificaciones: 0, listas: 0 }))
  const indice = new Map(dias.map((d, i) => [d, i]))
  const sumar = (fecha: string, campo: 'resenas' | 'calificaciones' | 'listas') => {
    const i = indice.get(diaAR(fecha))
    if (i !== undefined) porDia[i][campo]++
  }
  for (const r of reviews) sumar(r.created_at, 'resenas')
  for (const r of ratings) sumar(r.rated_at, 'calificaciones')
  for (const l of lists) sumar(l.created_at, 'listas')

  // ── Usuarios más activos ────────────────────────────────────────────────
  const resenas = contarPor(reviews)
  const listas = contarPor(lists)
  const calificaciones = contarPor(ratings)
  const verDespues = contarPor(watchlist)
  const favoritos = contarPor(favorites)
  const topUsuarios = profiles
    .map(p => {
      const u = {
        id: p.id, username: p.username, avatar_url: p.avatar_url,
        resenas: resenas.get(p.id) ?? 0,
        listas: listas.get(p.id) ?? 0,
        calificaciones: calificaciones.get(p.id) ?? 0,
        verDespues: verDespues.get(p.id) ?? 0,
        favoritos: favoritos.get(p.id) ?? 0,
      }
      return { ...u, total: u.resenas + u.listas + u.calificaciones + u.verDespues + u.favoritos }
    })
    .filter(u => u.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)

  return {
    totales: { resenas: reviews.length, listas: lists.length },
    porDia,
    semana: {
      calificadas: top(ratings.filter(r => r.rated_at >= semanaDesde), 5),
      agregadas: top(watchlist.filter(w => w.added_at >= semanaDesde), 5),
    },
    topVerDespues: top(watchlist, 20),
    topCalificadas: top(ratings, 20),
    topUsuarios,
    porHora,
    generadoEn: new Date().toISOString(),
  }
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function GET() {
  const adminUser = await requireAdmin()
  if (!adminUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  if (cache && Date.now() - cache.ts < TTL) {
    return NextResponse.json(cache.data, { headers: { 'Cache-Control': 'private, max-age=60', 'X-Cache': 'HIT' } })
  }

  const { admin, failure } = requireAdminClient('admin/contenido')
  if (failure) return failure

  let data: AdminContenido
  try {
    data = await buildContenido(admin)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[admin/contenido]', message)
    return NextResponse.json({ error: 'contenido_failed', message }, { status: 500 })
  }

  cache = { data, ts: Date.now() }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, max-age=60', 'X-Cache': 'MISS' } })
}
