import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Las consultas pesadas del panel, leídas de lo que dejó calculado la base.
 *
 * Con el salto de tráfico de octubre (1.090 usuarios en una semana contra 69)
 * `analytics_events` pasó las 220.000 filas, y cada vista del panel la recorre.
 * Abrir el panel lanzaba diez de esas consultas juntas, y en los picos se
 * cortaban por tiempo (23/10, de 9:05 a 9:10: resumen, uso de la app, actividad
 * por hora, retención).
 *
 * `supabase-rendimiento-2026-10.sql` las corre con pg_cron (horarios abajo) y
 * guarda el resultado en
 * `admin_panel_precalculado`. Acá se lee eso: una fila por clave, sin recorrer
 * los eventos.
 *
 * Si no hay fila, o es más vieja que `maxMinutos` (el cron no corrió, o el SQL
 * todavía no está), se hace la consulta en vivo como antes. Devuelve la misma
 * forma `{ data, error }` que la consulta, así quien llama no cambia.
 */

type Respuesta = { data: unknown; error: { message: string; code?: string } | null }

export interface Precalculado {
  data: unknown
  error: { message: string; code?: string } | null
  /** Cuándo se calculó, si salió de la tabla. `null` si fue en vivo. */
  calculadoEn: string | null
}

/**
 * Desde el 29/10 los crons corren cada hora (las de hoy a las :10, usuarios a
 * las :30) y retención cinco veces al día fuera del pico (7:45 a 19:45 UTC):
 * cada 10 minutos saturaban la base del plan Free (supabase-crons-escalonados-2026-10.sql).
 * Los márgenes toleran que falte una corrida; si no, ir en vivo en cada vista
 * del panel cargaría la base justo cuando el cron no pudo.
 */
export const FRESCO_RAPIDO = 150
/** Retención: de 19:45 a 7:45 UTC pasan 12 horas sin correr. */
export const FRESCO_LENTO = 16 * 60

export async function precalculado(
  admin: SupabaseClient,
  clave: string,
  maxMinutos: number,
  enVivo: () => PromiseLike<Respuesta>,
): Promise<Precalculado> {
  const { data: fila, error } = await admin
    .from('admin_panel_precalculado')
    .select('datos, calculado_en')
    .eq('clave', clave)
    .maybeSingle()

  if (!error && fila && Date.now() - new Date(fila.calculado_en as string).getTime() < maxMinutos * 60_000) {
    return { data: fila.datos, error: null, calculadoEn: fila.calculado_en as string }
  }

  const res = await enVivo()
  return { data: res.data, error: res.error, calculadoEn: null }
}
