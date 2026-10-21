import type { SupabaseClient } from '@supabase/supabase-js'

// SERVER-ONLY — lo usan las rutas de `/api/admin` que leen tablas enteras.

/**
 * Lee una tabla entera en tandas de 1000, el máximo de filas que devuelve
 * PostgREST por pedido. Sin esto, un `.limit(10000)` devuelve 1000 sin avisar
 * y el panel calcula sobre una muestra cortada.
 *
 * `desde` deja sólo las filas con `columna >= valor` (una fecha mínima).
 * Ordena por `id` (todas las tablas que se leen así lo tienen): sin un orden
 * fijo, PostgREST puede devolver tandas que se pisan o se saltean filas.
 * Va con la service role: sin RLS, así que cuenta también a los usuarios con
 * el perfil o la actividad ocultos, que es lo que tiene que hacer una métrica.
 */
export async function fetchAllRows<T>(
  admin: SupabaseClient,
  table: string,
  columns: string,
  desde?: { columna: string; valor: string },
): Promise<T[]> {
  const out: T[] = []
  let from = 0
  while (true) {
    const base = admin.from(table).select(columns)
    const q = desde ? base.gte(desde.columna, desde.valor) : base
    const { data, error } = await q.order('id').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    out.push(...(data as T[]))
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

/**
 * Argentina no tiene horario de verano: el corrimiento es fijo. Los días y
 * meses del panel son de Argentina, no UTC; si no, lo de las 21 a las 24 cae
 * en el día (o el mes) siguiente.
 */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000

/** `YYYY-MM-DD` de Argentina de un instante. */
export function diaAR(fecha: string | number | Date): string {
  return new Date(new Date(fecha).getTime() - AR_OFFSET_MS).toISOString().slice(0, 10)
}

/** `YYYY-MM` de Argentina de un instante. */
export function mesAR(fecha: string | number | Date): string {
  return diaAR(fecha).slice(0, 7)
}

/** Las 00:00 de Argentina de hace `dias` días (0 = hoy), como ISO. */
export function inicioDiaAR(dias = 0, ahora = Date.now()): string {
  return new Date(`${diaAR(ahora - dias * 86_400_000)}T00:00:00-03:00`).toISOString()
}
