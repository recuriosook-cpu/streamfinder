// SERVER-ONLY — lee calificaciones de todos con la service role.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * "Gente con tu gusto" (Comunidad) y "Coinciden en X%" (perfiles), octubre de
 * 2026.
 *
 * Las calificaciones sólo las lee su dueño, así que esto corre en el servidor
 * y nunca devuelve notas ajenas: sólo el porcentaje y, en el carrusel, tres
 * títulos que los dos calificaron alto.
 *
 * ── Cómo se calcula ───────────────────────────────────────────────────────
 *
 * Sobre los títulos que calificaron los dos: cada uno vale 1 si pusieron la
 * misma nota y 0 si una es 0,5 y la otra 5 (la diferencia sobre 4,5). El
 * porcentaje es el promedio. Hace falta un mínimo de títulos en común para
 * que el número diga algo; para ordenar el carrusel se castiga a quien tiene
 * pocos en común, aunque el porcentaje que se muestra es el de verdad.
 *
 * ── Quién aparece en el carrusel ──────────────────────────────────────────
 *
 * Con 20 calificaciones o más y FOTO de perfil (sin foto, nunca). No uno
 * mismo, ni a quien ya sigue, ni bloqueados en ninguna dirección, ni quien
 * tiene "Ocultar actividad" o la cuenta suspendida.
 */

export const MIN_CALIFICACIONES_CARRUSEL = 20
/** Para calcular la coincidencia con alguien hace falta esto de cada lado. */
export const MIN_CALIFICACIONES_PROPIAS = 10
export const MIN_EN_COMUN = 5
const EN_EL_CARRUSEL = 15
/** Con esto en común, el porcentaje ya pesa entero al ordenar. */
const COMUNES_PLENOS = 15
const NOTA_ALTA = 4

type Nota = { rating: number; posterPath: string | null; title: string }
/** user_id → `tipo:id` → nota */
type Notas = Map<string, Map<string, Nota>>

const clave = (tipo: string, id: number) => `${tipo}:${id}`

/** Diez minutos por instancia: las coincidencias no cambian de un minuto a otro. */
const VIGENCIA_MS = 10 * 60 * 1000
const memoria = new Map<string, { en: number; notas: Map<string, Nota> }>()

/**
 * Las notas de esas personas, con memoria por persona. Sólo de quienes hacen
 * falta: leer las de todos tardaba 14 s con 1.400 cuentas.
 */
async function notasDe(admin: SupabaseClient, ids: string[]): Promise<Notas> {
  const salida: Notas = new Map()
  const faltan: string[] = []
  for (const id of ids) {
    const m = memoria.get(id)
    if (m && Date.now() - m.en < VIGENCIA_MS) salida.set(id, m.notas)
    else faltan.push(id)
  }
  for (let i = 0; i < faltan.length; i += 50) {
    const tanda = faltan.slice(i, i + 50)
    for (const id of tanda) salida.set(id, new Map())
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await admin
        .from('ratings')
        .select('user_id, media_type, media_id, rating, poster_path, title')
        .in('user_id', tanda)
        .order('user_id')
        .order('media_type')
        .order('media_id')
        .range(desde, desde + 999)
      if (error) throw new Error(`ratings: ${error.message}`)
      for (const r of (data ?? []) as {
        user_id: string; media_type: string; media_id: number; rating: number | string | null
        poster_path: string | null; title: string | null
      }[]) {
        const rating = Number(r.rating)
        if (!rating) continue
        salida.get(r.user_id)!.set(clave(r.media_type, r.media_id), { rating, posterPath: r.poster_path, title: r.title ?? '' })
      }
      if (!data || data.length < 1000) break
    }
    for (const id of tanda) memoria.set(id, { en: Date.now(), notas: salida.get(id)! })
  }
  return salida
}

export interface Coincidencia {
  porcentaje: number
  comunes: number
  /** Títulos que los dos calificaron con 4 o más, de mejor a peor. */
  altos: { key: string; posterPath: string | null; title: string }[]
}

function coincidencia(a: Map<string, Nota>, b: Map<string, Nota>): Coincidencia | null {
  const [chica, grande] = a.size <= b.size ? [a, b] : [b, a]
  let suma = 0
  let comunes = 0
  const altos: { key: string; posterPath: string | null; title: string; puntaje: number }[] = []
  for (const [key, nota] of chica) {
    const otra = grande.get(key)
    if (!otra) continue
    comunes++
    suma += 1 - Math.abs(nota.rating - otra.rating) / 4.5
    if (nota.rating >= NOTA_ALTA && otra.rating >= NOTA_ALTA) {
      altos.push({ key, posterPath: nota.posterPath ?? otra.posterPath, title: nota.title || otra.title, puntaje: nota.rating + otra.rating })
    }
  }
  if (comunes < MIN_EN_COMUN) return null
  altos.sort((x, y) => y.puntaje - x.puntaje)
  return {
    porcentaje: Math.round((suma / comunes) * 100),
    comunes,
    altos: altos.map(({ key, posterPath, title }) => ({ key, posterPath, title })),
  }
}

export interface PersonaConTuGusto {
  id: string
  username: string
  displayName: string | null
  avatarUrl: string
  porcentaje: number
  comunes: number
  posters: { mediaType: 'movie' | 'tv'; id: number; posterPath: string; title: string }[]
}

export type ResultadoGusto =
  | { gente: PersonaConTuGusto[] }
  | { gente: []; faltan: number }

type PerfilFila = {
  id: string; username: string | null; display_name: string | null; avatar_url: string | null
  hide_activity: boolean | null; blocked_at: string | null
}

/** El carrusel de quien pide. `faltan`: cuántas calificaciones le faltan para tenerlo. */
export async function genteConTuGusto(
  admin: SupabaseClient,
  userId: string,
  excluir: Set<string>
): Promise<ResultadoGusto> {
  const mias = (await notasDe(admin, [userId])).get(userId) ?? new Map<string, Nota>()
  if (mias.size < MIN_CALIFICACIONES_PROPIAS) return { gente: [], faltan: MIN_CALIFICACIONES_PROPIAS - mias.size }

  // Primero quién puede aparecer (con foto, a la vista y sin suspender), que
  // son pocos; recién después sus notas.
  const perfiles = new Map<string, PerfilFila>()
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, username, display_name, avatar_url, hide_activity, blocked_at')
      .not('avatar_url', 'is', null)
      .neq('avatar_url', '')
      .range(desde, desde + 999)
    if (error) throw new Error(`profiles: ${error.message}`)
    for (const p of (data ?? []) as PerfilFila[]) {
      if (p.id !== userId && !excluir.has(p.id) && p.username && !p.hide_activity && !p.blocked_at) perfiles.set(p.id, p)
    }
    if (!data || data.length < 1000) break
  }
  const notas = await notasDe(admin, [...perfiles.keys()])
  const conBastantes = [...perfiles.keys()].filter(id => (notas.get(id)?.size ?? 0) >= MIN_CALIFICACIONES_CARRUSEL)

  const gente: (PersonaConTuGusto & { orden: number })[] = []
  for (const id of conBastantes) {
    const p = perfiles.get(id)
    if (!p?.username || !p.avatar_url?.trim() || p.hide_activity || p.blocked_at) continue
    const c = coincidencia(mias, notas.get(id)!)
    if (!c) continue
    gente.push({
      id,
      username: p.username,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
      porcentaje: c.porcentaje,
      comunes: c.comunes,
      posters: c.altos
        .filter(a => a.posterPath)
        .slice(0, 3)
        .map(a => {
          const [tipo, mediaId] = a.key.split(':')
          return { mediaType: tipo === 'tv' ? 'tv' : 'movie', id: Number(mediaId), posterPath: a.posterPath!, title: a.title }
        }),
      orden: c.porcentaje * Math.min(1, c.comunes / COMUNES_PLENOS),
    })
  }
  gente.sort((a, b) => b.orden - a.orden || b.comunes - a.comunes)
  return {
    gente: gente.slice(0, EN_EL_CARRUSEL).map(p => ({
      id: p.id, username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl,
      porcentaje: p.porcentaje, comunes: p.comunes, posters: p.posters,
    })),
  }
}

/**
 * La coincidencia con una persona, para su perfil. `null` si alguno no tiene
 * suficientes calificaciones, si tienen pocas en común o si la otra persona
 * tiene "Ocultar actividad".
 */
export async function coincidenciaCon(
  admin: SupabaseClient,
  userId: string,
  otroId: string
): Promise<{ porcentaje: number; comunes: number } | null> {
  if (userId === otroId) return null
  const { data: otro } = await admin.from('profiles').select('hide_activity').eq('id', otroId).maybeSingle()
  if (!otro || (otro as { hide_activity: boolean | null }).hide_activity) return null

  const notas = await notasDe(admin, [userId, otroId])
  const mias = notas.get(userId)
  const suyas = notas.get(otroId)
  if (!mias || !suyas || mias.size < MIN_CALIFICACIONES_PROPIAS || suyas.size < MIN_CALIFICACIONES_PROPIAS) return null
  const c = coincidencia(mias, suyas)
  return c ? { porcentaje: c.porcentaje, comunes: c.comunes } : null
}

/**
 * La coincidencia con varias personas de una vez (la pestaña "Compatibilidad"
 * de la web, con la gente que sigue). Misma regla que `coincidenciaCon`.
 */
export async function coincidenciasCon(
  admin: SupabaseClient,
  userId: string,
  otrosIds: string[]
): Promise<Record<string, { porcentaje: number; comunes: number } | null>> {
  const ids = [...new Set(otrosIds)].filter(id => id !== userId)
  const salida: Record<string, { porcentaje: number; comunes: number } | null> = {}
  if (ids.length === 0) return salida

  const ocultos = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from('profiles').select('id, hide_activity').in('id', ids.slice(i, i + 200))
    for (const p of (data ?? []) as { id: string; hide_activity: boolean | null }[]) if (p.hide_activity) ocultos.add(p.id)
  }
  const notas = await notasDe(admin, [userId, ...ids.filter(id => !ocultos.has(id))])
  const mias = notas.get(userId)
  for (const id of ids) {
    const suyas = notas.get(id)
    if (!mias || !suyas || ocultos.has(id) || mias.size < MIN_CALIFICACIONES_PROPIAS || suyas.size < MIN_CALIFICACIONES_PROPIAS) {
      salida[id] = null
      continue
    }
    const c = coincidencia(mias, suyas)
    salida[id] = c ? { porcentaje: c.porcentaje, comunes: c.comunes } : null
  }
  return salida
}
