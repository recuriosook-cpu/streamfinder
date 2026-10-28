import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Actividad por usuario para /api/admin/users, de los resúmenes de eventos
 * (supabase-eventos-resumen-2026-10.sql). Ver `actividadDesdeEventos`.
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

/** Una fila de `analytics_sesion`. */
interface SesionRow {
  user_id: string
  eventos: number
  inicio: string
  fin: string
}

/** Una fila de `analytics_dia_instalacion` de la app. */
interface DiaAppRow {
  usuarios: string[]
  os: string | null
  ultimo_evento: string
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
 * Tiempo, sesiones y uso de la app de una página de usuarios.
 *
 * Por qué no se leen `user_activity_time` y `user_app_usage`: son de todos los
 * usuarios y acá se piden 50. Antes esto se calculaba de los eventos crudos,
 * pero los masivos ahora duran 7 días (supabase-eventos-limpieza-2026-10.sql);
 * las sesiones y los días por instalación quedan resumidos para siempre.
 *
 * Las reglas son las de `analytics_sessions`, para que el número no cambie
 * según de dónde salga:
 *   - la sesión es de su ÚLTIMO `user_id` no nulo, y cuenta también la parte
 *     de antes del login (así se arma `analytics_sesion`);
 *   - un solo evento vale 30 s; si no, fin − inicio; nunca más de 1800 s;
 *   - nada de bots.
 */
export async function actividadDesdeEventos(
  admin: SupabaseClient,
  ids: string[]
): Promise<{ activity: ActivityRow[]; app: AppUsageRow[] }> {
  const ms = (iso: string) => new Date(iso).getTime()
  const deLaPagina = new Set(ids)

  const [sesiones, diasApp] = await Promise.all([
    Promise.all(lotes(ids, IDS_POR_CONSULTA).map(lote =>
      todasLasFilas<SesionRow>((d, h) =>
        admin.from('analytics_sesion')
          .select('user_id, eventos, inicio, fin')
          .in('user_id', lote)
          .order('session_id')
          .range(d, h)
      )
    )).then(xs => xs.flat()),
    Promise.all(lotes(ids, IDS_POR_CONSULTA).map(lote =>
      todasLasFilas<DiaAppRow>((d, h) =>
        admin.from('analytics_dia_instalacion')
          .select('usuarios, os, ultimo_evento')
          .eq('platform', 'mobile')
          .overlaps('usuarios', lote)
          .order('dia')
          .order('anon_id')
          .range(d, h)
      )
    )).then(xs => xs.flat()),
  ])

  // ── Sesiones ──
  const porUsuario = new Map<string, { segundos: number; sesiones: number; fin: number }>()
  for (const s of sesiones) {
    const inicio = ms(s.inicio)
    const fin = ms(s.fin)
    const segundos = Math.min(s.eventos === 1 ? 30 : (fin - inicio) / 1000, 1800)
    const a = porUsuario.get(s.user_id) ?? { segundos: 0, sesiones: 0, fin: -Infinity }
    a.segundos += segundos
    a.sesiones++
    if (fin > a.fin) a.fin = fin
    porUsuario.set(s.user_id, a)
  }

  // ── App ── (lo mismo que `user_app_usage`)
  const app = new Map<string, { sistemas: Set<string>; ultima: number }>()
  for (const dia of diasApp) {
    const t = ms(dia.ultimo_evento)
    for (const userId of dia.usuarios) {
      if (!deLaPagina.has(userId)) continue
      const a = app.get(userId) ?? { sistemas: new Set<string>(), ultima: t }
      if (dia.os === 'ios' || dia.os === 'android') a.sistemas.add(dia.os)
      if (t > a.ultima) a.ultima = t
      app.set(userId, a)
    }
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
