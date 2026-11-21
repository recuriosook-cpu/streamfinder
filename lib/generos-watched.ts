// SERVER-ONLY — escribe en `watched` con la service role.

import type { SupabaseClient } from '@supabase/supabase-js'
import { enParalelo, tmdbJson } from './cron-tmdb'

/**
 * Completa `watched.genre_ids` desde TMDB: un pedido por título distinto (no
 * por fila) y una sola UPDATE por tanda para todas las filas de esos títulos
 * (supabase-generos-y-aviso-wrapped-2026-11.sql). Lo usan el script de una
 * vez (`scripts/completar-generos.ts`) y el cron diario (`/api/cron/generos`),
 * que completa lo que se marcó desde la corrida anterior.
 *
 * Un título que TMDB no tiene o que no tiene géneros queda vacío y se vuelve
 * a pedir en la próxima corrida; son pocos.
 */

/** Pedidos a TMDB a la vez. Su límite es ~50 por segundo; con más empieza a dar 429. */
const A_LA_VEZ = 8

/** Títulos por UPDATE. */
const POR_TANDA = 500

export interface ResultadoGeneros {
  titulos: number
  conGeneros: number
  sinDatos: number
  filas: number
}

export async function completarGeneros(
  admin: SupabaseClient,
  opciones: { maxTitulos?: number; alAvanzar?: (r: ResultadoGeneros) => void } = {},
): Promise<ResultadoGeneros> {
  const { data, error } = await admin.rpc('watched_titulos_sin_genero', { p_limite: opciones.maxTitulos ?? null })
  if (error) throw new Error(`watched_titulos_sin_genero: ${error.message}`)
  const titulos = (data ?? []) as { media_type: 'movie' | 'tv'; media_id: number }[]

  const r: ResultadoGeneros = { titulos: titulos.length, conGeneros: 0, sinDatos: 0, filas: 0 }
  for (let i = 0; i < titulos.length; i += POR_TANDA) {
    const tanda = titulos.slice(i, i + POR_TANDA)
    const fichas = await enParalelo(tanda, A_LA_VEZ, t =>
      tmdbJson<{ genres?: { id: number }[] }>(`/${t.media_type}/${t.media_id}`))

    const filas = tanda
      .map((t, j) => ({ ...t, genre_ids: (fichas[j]?.genres ?? []).map(g => g.id) }))
      .filter(f => f.genre_ids.length > 0)
    r.conGeneros += filas.length
    r.sinDatos += tanda.length - filas.length

    if (filas.length > 0) {
      const { data: cambiadas, error: e } = await admin.rpc('watched_completar_generos', { p_filas: filas })
      if (e) throw new Error(`watched_completar_generos: ${e.message}`)
      r.filas += (cambiadas as number) ?? 0
    }
    opciones.alAvanzar?.(r)
  }
  return r
}
