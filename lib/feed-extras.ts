// SERVER-ONLY — lo usan el feed de Comunidad y los carruseles de amigos.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from './service-role'
import { diaArgentina, tmdbJson } from './cron-tmdb'
import { idiomaTmdb, type Idioma } from './idioma'

/**
 * Lo que la app 1.0.16 suma al feed de Comunidad y al inicio:
 *
 *   · Las cuentas destacadas con que se completa todo cuando alguien sigue a
 *     poca gente: las verificadas (`profiles.verified`) y las más activas.
 *   · Las tarjetas que no son actividad de alguien que seguís: las
 *     recomendaciones de Ferlage, los cumpleaños y los estrenos de los famosos
 *     que seguís.
 *   · El orden: lo de quien seguís primero, y nadie más de 2 veces seguidas.
 */

/**
 * La cuenta de Ferlage, autor de las recomendaciones del panel. Va por nombre
 * porque las recomendaciones son suyas, no de "las verificadas".
 */
const USUARIO_FERLAGE = 'Ferlageok'

/** Hasta cuántas verificadas se suman al relleno, antes de las populares. */
const VERIFICADAS = 10

/**
 * Cuentas que nunca van como destacadas aunque tengan puntos: la de prueba
 * que usan los revisores de las tiendas.
 */
const NUNCA_DESTACADAS = ['appreview']

/** Cuántas cuentas populares se suman al relleno. */
const POPULARES = 12

/** Seguir a menos que esto es "seguir a poca gente". */
export const POCOS_SEGUIDOS = 5

/**
 * Las cuentas para completar: las verificadas y las más activas (más puntos),
 * sin la propia ni las que ya sigue. Las verificadas primero.
 */
export async function cuentasDestacadas(
  db: SupabaseClient,
  userId: string,
  yaSigue: string[]
): Promise<string[]> {
  const fuera = new Set([userId, ...yaSigue])
  const [verificadas, activas] = await Promise.all([
    db.from('profiles').select('id').eq('verified', true).limit(VERIFICADAS + fuera.size),
    db.from('profiles').select('id, username').order('points', { ascending: false })
      .limit(POPULARES + fuera.size + NUNCA_DESTACADAS.length),
  ])
  const ids: string[] = []
  for (const r of [...(verificadas.data ?? []), ...(activas.data ?? [])] as { id: string; username?: string | null }[]) {
    if (r.username && NUNCA_DESTACADAS.includes(r.username)) continue
    if (!fuera.has(r.id) && !ids.includes(r.id)) ids.push(r.id)
  }
  return ids.slice(0, POPULARES + VERIFICADAS)
}

// ── Tarjetas que no son actividad de alguien ──────────────────────────────

export interface FerlageItem {
  key: string
  type: 'ferlage'
  /** El perfil de Ferlage, para la foto y el nombre. */
  userId: string
  sortTime: string
  mediaId: number
  mediaType: 'movie' | 'tv'
  mediaTitle: string
  mediaPosterPath: string | null
  coverUrl: string
}

export interface FamosoCumpleItem {
  key: string
  type: 'famoso_cumple'
  sortTime: string
  personId: number
  personName: string
  profilePath: string | null
  /** Los años que cumple, si se sabe. */
  edad: number | null
}

export interface FamosoEstrenoItem {
  key: string
  type: 'famoso_estreno'
  sortTime: string
  personId: number
  personName: string
  rol: 'cast' | 'crew'
  mediaId: number
  mediaType: 'movie' | 'tv'
  mediaTitle: string
  mediaPosterPath: string | null
  /** `YYYY-MM-DD` del estreno. */
  fecha: string
}

const RECS_FERLAGE = 3
const RECS_FERLAGE_DIAS = 45

/**
 * Cuánto se guarda la ficha de TMDB (título y póster) de cada recomendación.
 * Son las mismas 3 para todos, en 2 idiomas: sin caché eran 3 pedidos a TMDB
 * por cada carga del feed. El título y el póster casi no cambian, y si TMDB
 * cambia el póster la ruta vieja sigue sirviendo. Una recomendación nueva es
 * otra URL, así que aparece enseguida.
 */
const FICHA_FERLAGE_SEGUNDOS = 86_400

/**
 * Las últimas recomendaciones de Ferlage (las del panel), con su portada. El
 * título y el póster se piden a TMDB en el idioma de quien mira: son 3
 * pedidos, compartidos por todos y cacheados un día (no dependen de quién mira).
 */
export async function recomendacionesFerlage(db: SupabaseClient, idioma: Idioma): Promise<FerlageItem[]> {
  const desde = new Date(Date.now() - RECS_FERLAGE_DIAS * 86_400_000).toISOString()
  const [recs, perfil] = await Promise.all([
    db.from('creator_recommendations')
      .select('id, tmdb_id, media_type, cover_path, created_at')
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(RECS_FERLAGE),
    db.from('profiles').select('id').eq('username', USUARIO_FERLAGE).maybeSingle(),
  ])
  const autor = (perfil.data as { id: string } | null)?.id
  if (recs.error || !autor) return []

  type Row = { id: number; tmdb_id: number; media_type: 'movie' | 'tv'; cover_path: string; created_at: string }
  const filas = (recs.data ?? []) as Row[]
  const fichas = await Promise.all(filas.map(r =>
    tmdbJson<{ title?: string; name?: string; poster_path?: string | null }>(
      `/${r.media_type}/${r.tmdb_id}`, { language: idiomaTmdb(idioma) },
      { revalidate: FICHA_FERLAGE_SEGUNDOS })))

  return filas.flatMap((r, i) => {
    const titulo = (fichas[i]?.title ?? fichas[i]?.name)?.trim()
    if (!titulo) return []
    return [{
      key: `ferlage-${r.id}`,
      type: 'ferlage' as const,
      userId: autor,
      sortTime: r.created_at,
      mediaId: r.tmdb_id,
      mediaType: r.media_type,
      mediaTitle: titulo,
      mediaPosterPath: fichas[i]?.poster_path ?? null,
      coverUrl: db.storage.from('recommendations').getPublicUrl(r.cover_path).data.publicUrl,
    }]
  })
}

/** Hoy a las 9 de Argentina: la hora del cron de avisos, para ordenar los cumpleaños. */
function hoyALas9(): string {
  return `${diaArgentina()}T12:00:00.000Z`
}

/**
 * Los cumpleaños de hoy de los famosos que sigue. `followed_actors` la lee su
 * dueño, y el feed lee como quien mira: alcanza con el cliente del usuario.
 */
export async function cumpleanosDeFamosos(db: SupabaseClient, userId: string): Promise<FamosoCumpleItem[]> {
  const mmdd = diaArgentina().slice(5)
  const { data, error } = await db
    .from('followed_actors')
    .select('actor_id, actor_name, actor_photo, birthday')
    .eq('user_id', userId)
    .like('birthday', `%-${mmdd}`)
  if (error) return []
  const anio = Number(diaArgentina().slice(0, 4))
  return ((data ?? []) as { actor_id: number; actor_name: string; actor_photo: string | null; birthday: string }[])
    .map(r => ({
      key: `cumple-${r.actor_id}-${anio}`,
      type: 'famoso_cumple' as const,
      sortTime: hoyALas9(),
      personId: r.actor_id,
      personName: r.actor_name,
      profilePath: r.actor_photo,
      edad: /^\d{4}/.test(r.birthday) ? anio - Number(r.birthday.slice(0, 4)) : null,
    }))
}

const ESTRENOS_DIAS = 14

/**
 * Los estrenos de los últimos 14 días de los famosos que sigue. Salen de lo que
 * guarda el cron de avisos (`famosos_creditos`, ver `lib/avisos-famosos.ts`),
 * que sólo lee el servidor: por eso va con la service role.
 */
export async function estrenosDeFamosos(
  db: SupabaseClient,
  userId: string,
  idioma: Idioma
): Promise<FamosoEstrenoItem[]> {
  const { data: seguidos } = await db.from('followed_actors').select('actor_id, actor_name').eq('user_id', userId)
  const nombres = new Map(((seguidos ?? []) as { actor_id: number; actor_name: string }[]).map(s => [s.actor_id, s.actor_name]))
  if (nombres.size === 0) return []

  let admin: SupabaseClient
  try {
    admin = getAdminClient()
  } catch {
    return []
  }
  const { data, error } = await admin
    .from('famosos_creditos')
    .select('person_id, media_type, media_id, rol, titulo_es, titulo_en, poster_path, fecha')
    .in('person_id', [...nombres.keys()])
    .gte('fecha', diaArgentina(ESTRENOS_DIAS))
    .lte('fecha', diaArgentina())
    .order('fecha', { ascending: false })
    .limit(20)
  if (error) return []

  type Row = {
    person_id: number; media_type: 'movie' | 'tv'; media_id: number; rol: 'cast' | 'crew'
    titulo_es: string; titulo_en: string | null; poster_path: string | null; fecha: string
  }
  const vistos = new Set<string>()
  return ((data ?? []) as Row[]).flatMap(r => {
    // Una película con dos famosos que sigue, una sola tarjeta.
    const clave = `${r.media_type}:${r.media_id}`
    if (vistos.has(clave)) return []
    vistos.add(clave)
    return [{
      key: `estreno-${clave}-${r.person_id}`,
      type: 'famoso_estreno' as const,
      sortTime: `${r.fecha}T12:00:00.000Z`,
      personId: r.person_id,
      personName: nombres.get(r.person_id) ?? '',
      rol: r.rol,
      mediaId: r.media_id,
      mediaType: r.media_type,
      mediaTitle: (idioma === 'en' && r.titulo_en) || r.titulo_es,
      mediaPosterPath: r.poster_path,
      fecha: r.fecha,
    }]
  })
}

// ── El orden ──────────────────────────────────────────────────────────────

/** Cuánto "más viejo" cuenta lo sugerido: lo de quien seguís va primero. */
const ATRASO_SUGERIDO_MS = 3 * 86_400_000

/**
 * Ordena por fecha, con dos reglas más:
 *
 *   · Lo sugerido (de cuentas que no seguís) cuenta 3 días más viejo: rellena,
 *     pero no tapa a quien seguís.
 *   · Nadie aparece más de 2 veces seguidas: lo de alguien muy activo se
 *     intercala con lo de los demás, en vez de llenar la pantalla.
 */
export function ordenarFeed<T extends { sortTime: string; sugerido?: boolean; userId?: string }>(items: T[]): T[] {
  const peso = (i: T) => new Date(i.sortTime).getTime() - (i.sugerido ? ATRASO_SUGERIDO_MS : 0)
  const pendientes = [...items].sort((a, b) => peso(b) - peso(a))
  const salida: T[] = []
  while (pendientes.length > 0) {
    const [a, b] = [salida[salida.length - 1], salida[salida.length - 2]]
    const repetido = a?.userId && b?.userId && a.userId === b.userId ? a.userId : null
    const i = repetido ? pendientes.findIndex(p => p.userId !== repetido) : 0
    salida.push(pendientes.splice(i === -1 ? 0 : i, 1)[0])
  }
  return salida
}
