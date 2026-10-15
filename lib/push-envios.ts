// SERVER-ONLY — lee y escribe `push_envios` con la service role.

import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteDeadTokens, getExpoReceipts, type ExpoTicketRef } from './expo-push'

/**
 * Lo que comparten los envíos masivos de push: "Ferlage te recomienda ver"
 * (`/api/admin/recomendaciones/notificar`) y "Tu resumen semanal"
 * (`lib/resumen-semanal.ts`). Los dos dejan una fila en `push_envios`, y el
 * panel revisa los recibos y cuenta las aperturas igual para los dos.
 */

export type TipoEnvio = 'recomendacion' | 'semanal'

/**
 * Las claves de `profiles.notification_preferences` que apagan cada envío.
 * Una clave que falta cuenta como prendida, igual que en la app.
 */
export const PREFERENCIA_DE: Record<TipoEnvio, string> = {
  recomendacion: 'recomendaciones_ferlage',
  semanal: 'resumen_semanal',
}

/** Antes de esto Expo puede no tener los recibos. Después de 24 h los borra. */
const RECIBOS_DESDE_MS = 15 * 60 * 1000
const RECIBOS_HASTA_MS = 24 * 60 * 60 * 1000

export interface FilaEnvio {
  id: number
  prueba: boolean
  cuerpo: string
  media_type: 'movie' | 'tv' | null
  tmdb_id: number | null
  creado_en: string
  destinatarios: number
  enviados: number | null
  fallidos: number | null
  tokens_borrados: number
  tickets: ExpoTicketRef[] | null
  recibos_revisados_en: string | null
}

export const COLUMNAS_FILA =
  'id, prueba, cuerpo, media_type, tmdb_id, creado_en, destinatarios, enviados, fallidos, tokens_borrados, tickets, recibos_revisados_en'

export function faltaLaTabla(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('could not find the table')
}

/**
 * Los usuarios que apagaron un envío, para sacarlos antes de mandar.
 *
 * Se piden los apagados y no los prendidos porque la clave que falta vale
 * "prendida": son pocos y la consulta es exacta.
 */
export async function usuariosConEnvioApagado(
  admin: SupabaseClient,
  tipo: TipoEnvio
): Promise<Set<string>> {
  const apagados = new Set<string>()
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq(`notification_preferences->>${PREFERENCIA_DE[tipo]}`, 'false')
      .range(desde, desde + 999)
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as { id: string }[]) apagados.add(row.id)
    if (!data || data.length < 1000) break
  }
  return apagados
}

export function envioApagado(prefs: unknown, tipo: TipoEnvio): boolean {
  if (!prefs || typeof prefs !== 'object') return false
  return (prefs as Record<string, unknown>)[PREFERENCIA_DE[tipo]] === false
}

/**
 * Revisa los recibos de los envíos que ya los tienen listos. Nunca tira: si
 * Expo no contesta, se reintenta en la próxima carga del panel.
 */
export async function revisarRecibos(admin: SupabaseClient, filas: FilaEnvio[]): Promise<void> {
  const ahora = Date.now()
  for (const fila of filas) {
    if (fila.recibos_revisados_en || !fila.tickets) continue
    const edad = ahora - new Date(fila.creado_en).getTime()
    if (edad < RECIBOS_DESDE_MS) continue

    const recibos = edad < RECIBOS_HASTA_MS ? await getExpoReceipts(fila.tickets) : null
    // Pasadas las 24 h Expo ya no los tiene: se cierra con lo que había.
    if (!recibos && edad < RECIBOS_HASTA_MS) continue

    const borrados = recibos ? await deleteDeadTokens(admin, recibos.muertos) : 0
    const fallidosRecibo = recibos?.fallidos ?? 0
    const cambios = {
      enviados: Math.max(0, (fila.enviados ?? 0) - fallidosRecibo),
      fallidos: (fila.fallidos ?? 0) + fallidosRecibo,
      tokens_borrados: fila.tokens_borrados + borrados,
      recibos_revisados_en: new Date().toISOString(),
      // Los tokens ya no hacen falta: no se guardan más de lo necesario.
      tickets: null,
    }
    const { error } = await admin.from('push_envios').update(cambios).eq('id', fila.id)
    if (error) {
      console.error('[push-envios] no se pudo guardar la revisión de recibos:', error.message)
      continue
    }
    Object.assign(fila, cambios)
  }
}

/** Instalaciones distintas que abrieron cada envío de un tipo. */
export async function aperturas(
  admin: SupabaseClient,
  tipo: TipoEnvio,
  filas: FilaEnvio[]
): Promise<Map<number, number>> {
  const porEnvio = new Map<number, Set<string>>()
  if (filas.length === 0) return new Map()
  const desde = filas.reduce((min, f) => (f.creado_en < min ? f.creado_en : min), filas[0].creado_en)

  const { data, error } = await admin
    .from('analytics_events')
    .select('anon_id, props')
    .eq('name', 'push_abierta')
    .eq('props->>tipo', tipo)
    .gte('created_at', desde)
    .limit(10000)
  if (error) {
    console.error('[push-envios] aperturas:', error.message)
    return new Map()
  }
  for (const row of (data ?? []) as { anon_id: string; props: Record<string, unknown> | null }[]) {
    const envio = Number(row.props?.envio)
    if (!Number.isFinite(envio)) continue
    const set = porEnvio.get(envio) ?? new Set<string>()
    set.add(row.anon_id)
    porEnvio.set(envio, set)
  }
  return new Map([...porEnvio].map(([id, set]) => [id, set.size]))
}
