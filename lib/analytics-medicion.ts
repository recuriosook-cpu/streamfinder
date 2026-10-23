import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Desde cuándo se mide: el primer evento de una persona real en
 * `analytics_events`.
 *
 * Reemplaza a la vista `analytics_medicion` en el resumen y en retención, que
 * sólo necesitan esta fecha. Esa vista recorre la tabla entera con dos
 * `count(DISTINCT)` en cada pedido; con el tráfico de octubre se cortaba por
 * tiempo, y como el error no se distinguía de "no hay datos", el resumen decía
 * "Falta correr supabase-analytics-resumen.sql" con la vista creada (23/10).
 *
 * Esto es un solo registro, y la fecha no cambia una vez que hay eventos: se
 * guarda en memoria y deja de consultarse. Con el índice de
 * `supabase-rendimiento-2026-10.sql` la consulta es instantánea; sin él
 * funciona igual, más lenta.
 */
export type MedicionDesde =
  /** `desde: null` es un dato: todavía no entró ningún evento humano. */
  | { desde: string | null; error: null }
  /** No se pudo leer. No quiere decir que falte nada. */
  | { desde: null; error: string }

let desdeGuardado: string | null = null

export async function leerMedicionDesde(admin: SupabaseClient): Promise<MedicionDesde> {
  if (desdeGuardado) return { desde: desdeGuardado, error: null }

  const { data, error } = await admin
    .from('analytics_events')
    .select('created_at')
    .eq('is_bot', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return { desde: null, error: error.message }
  const desde = (data?.created_at as string | undefined) ?? null
  if (desde) desdeGuardado = desde
  return { desde, error: null }
}
