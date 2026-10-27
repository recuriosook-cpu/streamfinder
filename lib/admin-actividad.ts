import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Actividad por usuario para /api/admin/users, sacada directo de los eventos.
 * Ver `actividadDesdeEventos`.
 */

/** Una fila de la vista `user_activity_time`. Ya viene agregada por usuario. */
export interface ActivityRow {
  user_id: string
  segundos_totales: number
  sesiones: number
  ultima_actividad: string | null
}

/**
 * Una fila de la vista `user_app_usage` (supabase-uso-app-2026-10.sql): quién
 * usa la app según sus eventos, haya aceptado las notificaciones o no.
 */
export interface AppUsageRow {
  user_id: string
  sistemas: string[] | null
  ultima_app: string | null
}

/** El tope de filas por respuesta de PostgREST. */
const LOTE = 1000

/** Una fila de `analytics_events`, con sólo lo que hace falta para la actividad. */
export interface EventoRow {
  user_id: string | null
  session_id: string
  created_at: string
  platform: string | null
  os: string | null
}

/** Tantos ids por `.in()` para que la URL quede corta. */
const IDS_POR_CONSULTA = 100

function lotes<T>(xs: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

/** Todas las filas de una consulta, de a 1000 (el tope de PostgREST). */
async function todasLasFilas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += LOTE) {
    const { data, error } = await consulta(from, from + LOTE - 1)
    if (error) throw new Error(error.message)
    const filas = (data ?? []) as T[]
    out.push(...filas)
    if (filas.length < LOTE) break
  }
  return out
}

/**
 * Tiempo, sesiones y uso de la app de una página de usuarios, calculados
 * directo de sus eventos.
 *
 * Por qué no se leen `user_activity_time` y `user_app_usage`: la primera sale
 * de `analytics_sessions`, que agrupa TODOS los eventos por sesión antes de que
 * se pueda filtrar por usuario. Con 325.000 eventos, aun pidiendo 50 usuarios
 * recorre la tabla entera y en los picos se corta por tiempo (los logs del
 * 27/10 lo muestran). Acá se piden sólo los eventos de estos usuarios, que
 * van por índice, y después los eventos completos de esas sesiones.
 *
 * Las reglas son las mismas de `supabase-analytics-resumen.sql`, para que el
 * número no cambie según de dónde salga:
 *   - la sesión es de su ÚLTIMO `user_id` no nulo, y cuenta también la parte
 *     de antes del login;
 *   - un solo evento vale 30 s; si no, fin − inicio; nunca más de 1800 s;
 *   - nada de bots.
 */
export async function actividadDesdeEventos(
  admin: SupabaseClient,
  ids: string[]
): Promise<{ activity: ActivityRow[]; app: AppUsageRow[] }> {
  const ms = (iso: string) => new Date(iso).getTime()

  const deUsuarios = (await Promise.all(lotes(ids, IDS_POR_CONSULTA).map(lote =>
    todasLasFilas<EventoRow>((d, h) =>
      admin.from('analytics_events')
        .select('user_id, session_id, created_at, platform, os:props->>os')
        .eq('is_bot', false)
        .in('user_id', lote)
        .order('created_at')
        .range(d, h)
    )
  ))).flat()

  // Las sesiones enteras, no sólo la parte de estos usuarios: lo anónimo de
  // antes del login cuenta, y una sesión compartida por varias cuentas (alguien
  // que probó dos en el mismo navegador) es del último que la usó. Sin todos
  // sus eventos no se puede saber quién fue.
  const sesionIds = [...new Set(deUsuarios.map(e => e.session_id))]
  const deSesiones = (await Promise.all(lotes(sesionIds, IDS_POR_CONSULTA).map(lote =>
    todasLasFilas<Pick<EventoRow, 'user_id' | 'session_id' | 'created_at'>>((d, h) =>
      admin.from('analytics_events')
        .select('user_id, session_id, created_at')
        .eq('is_bot', false)
        .in('session_id', lote)
        .range(d, h)
    )
  ))).flat()

  // ── Sesiones ──
  interface Sesion { user: string | null; userEn: number; eventos: number; inicio: number; fin: number }
  const sesiones = new Map<string, Sesion>()
  for (const e of deSesiones) {
    const t = ms(e.created_at)
    const s = sesiones.get(e.session_id) ?? { user: null, userEn: -Infinity, eventos: 0, inicio: t, fin: t }
    s.eventos++
    if (t < s.inicio) s.inicio = t
    if (t > s.fin) s.fin = t
    if (e.user_id && t >= s.userEn) { s.user = e.user_id; s.userEn = t }
    sesiones.set(e.session_id, s)
  }

  const deLaPagina = new Set(ids)
  const porUsuario = new Map<string, { segundos: number; sesiones: number; fin: number }>()
  for (const s of sesiones.values()) {
    if (!s.user || !deLaPagina.has(s.user)) continue
    const segundos = Math.min(s.eventos === 1 ? 30 : (s.fin - s.inicio) / 1000, 1800)
    const a = porUsuario.get(s.user) ?? { segundos: 0, sesiones: 0, fin: -Infinity }
    a.segundos += segundos
    a.sesiones++
    if (s.fin > a.fin) a.fin = s.fin
    porUsuario.set(s.user, a)
  }

  // ── App ── (lo mismo que `user_app_usage`)
  const app = new Map<string, { sistemas: Set<string>; ultima: number }>()
  for (const e of deUsuarios) {
    if (e.platform !== 'mobile' || !e.user_id) continue
    const t = ms(e.created_at)
    const a = app.get(e.user_id) ?? { sistemas: new Set<string>(), ultima: t }
    if (e.os === 'ios' || e.os === 'android') a.sistemas.add(e.os)
    if (t > a.ultima) a.ultima = t
    app.set(e.user_id, a)
  }

  const iso = (t: number) => new Date(t).toISOString()

  return {
    activity: [...porUsuario.entries()].map(([user_id, a]) => ({
      user_id,
      segundos_totales: Math.round(a.segundos),
      sesiones: a.sesiones,
      ultima_actividad: iso(a.fin),
    })),
    app: [...app.entries()].map(([user_id, a]) => ({
      user_id,
      sistemas: a.sistemas.size ? [...a.sistemas].sort() : null,
      ultima_app: iso(a.ultima),
    })),
  }
}
