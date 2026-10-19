// SERVER-ONLY en lo que lee la base; `normalizarIdioma` y `idiomaTmdb` son puras.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * El idioma de cada usuario, para lo que escribe el servidor: las push, la
 * bandeja de la app, "Ferlage te recomienda ver" y "Tu resumen semanal".
 *
 * Lo decide la app (el idioma del teléfono, o el que se elija en Ajustes) y lo
 * guarda en `profiles.idioma` (supabase-idioma-2026-10.sql). NULL —versiones
 * anteriores de la app, o la web, que es sólo en castellano— es español: es lo
 * que todos recibían hasta la 1.0.16.
 *
 * Todo lo que lee la columna tolera que el SQL todavía no se haya corrido: si
 * la columna no existe, todos en español, como antes.
 */

export type Idioma = 'es' | 'en'

export const IDIOMA_POR_DEFECTO: Idioma = 'es'

/** 'en' y sus variantes ('en-US', 'EN') son inglés; cualquier otra cosa, español. */
export function normalizarIdioma(v: unknown): Idioma {
  return typeof v === 'string' && v.trim().toLowerCase().startsWith('en') ? 'en' : 'es'
}

/** El parámetro `language` de TMDB para cada idioma. */
export function idiomaTmdb(idioma: Idioma): string {
  return idioma === 'en' ? 'en-US' : 'es-AR'
}

/** La columna no existe: falta correr supabase-idioma-2026-10.sql. */
function faltaLaColumna(error: { code?: string; message?: string }): boolean {
  if (error.code === '42703' || error.code === 'PGRST204') return true
  return (error.message ?? '').toLowerCase().includes('idioma')
}

let avisoFaltaColumna = false

function avisarFaltaColumna() {
  if (avisoFaltaColumna) return
  avisoFaltaColumna = true
  console.warn('[idioma] falta correr supabase-idioma-2026-10.sql: todos en español')
}

/** El idioma de una persona. Nunca tira: ante cualquier problema, español. */
export async function idiomaDe(admin: SupabaseClient, userId: string): Promise<Idioma> {
  const { data, error } = await admin.from('profiles').select('idioma').eq('id', userId).maybeSingle()
  if (error) {
    if (faltaLaColumna(error)) avisarFaltaColumna()
    else console.error('[idioma] no se pudo leer el idioma:', error.message)
    return IDIOMA_POR_DEFECTO
  }
  return normalizarIdioma((data as { idioma?: unknown } | null)?.idioma)
}

/**
 * El idioma de varias personas, en tandas. Los que no aparecen (o si la
 * consulta falla) quedan en español: quien llama usa `.get(id) ?? 'es'`.
 */
export async function idiomasDe(admin: SupabaseClient, ids: string[]): Promise<Map<string, Idioma>> {
  const mapa = new Map<string, Idioma>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from('profiles').select('id, idioma').in('id', ids.slice(i, i + 200))
    if (error) {
      if (faltaLaColumna(error)) avisarFaltaColumna()
      else console.error('[idioma] no se pudieron leer los idiomas:', error.message)
      return mapa
    }
    for (const row of (data ?? []) as { id: string; idioma: unknown }[]) {
      if (normalizarIdioma(row.idioma) === 'en') mapa.set(row.id, 'en')
    }
  }
  return mapa
}
