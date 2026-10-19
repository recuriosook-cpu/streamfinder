// SERVER-ONLY — lee perfiles, listas y tokens con la service role.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ALL_PLATFORMS, PLATAFORMAS_GRANDES } from './providers'
import { deleteDeadTokens, sendExpoPushMessages, type ExpoMessage } from './expo-push'
import { envioApagado, faltaLaTabla } from './push-envios'
import { idiomaDe, idiomaTmdb, idiomasDe, type Idioma } from './idioma'

/**
 * "Tu resumen semanal": los viernes a las 18 de Argentina, una push por
 * persona con un título armado para ella. La corre `/api/cron/resumen-semanal`
 * y la prueba el botón del panel (`/api/admin/semanal`).
 *
 * ── Qué se recomienda ──────────────────────────────────────────────────────
 *
 *   a. Algo de su watchlist que esté en una de sus plataformas
 *      (`favorite_platforms`) en Argentina, suscripción o gratis.
 *      "Ya está en Netflix: X, que tenías guardada".
 *   b. Si no hay, un estreno reciente en sus plataformas que coincida con sus
 *      géneros favoritos Y con lo que calificó con 4 o más.
 *      "Para este finde en Netflix: X".
 *   c. Si nada encaja, esa semana no se manda nada.
 *
 * TMDB no dice desde cuándo un título está en una plataforma, sólo si está
 * hoy. Así que (a) es "está disponible y nunca se lo mandamos", empezando por
 * lo último que guardó; y (b) es "estrenado hace poco y disponible hoy".
 *
 * ── Qué nunca se recomienda ────────────────────────────────────────────────
 *
 * Lo que vio, calificó o reseñó; lo que ya se le mandó en una semanal
 * (`push_semanal_enviados`, único por persona y título); y lo que salió en
 * "Ferlage te recomienda ver", que les llega a todos.
 *
 * ── Cuándo se saltea a alguien ─────────────────────────────────────────────
 *
 * Si apagó "Tu resumen semanal", si no eligió plataformas, o si en los últimos
 * 7 días ya recibió 3 notificaciones o más: las filas de `notifications` (cada
 * una sale como push) más los envíos de "Ferlage te recomienda ver", si no
 * los tiene apagados.
 *
 * ── El idioma ──────────────────────────────────────────────────────────────
 *
 * Se elige igual para todos; después, a quien tiene la app en inglés
 * (`profiles.idioma`, ver `lib/idioma.ts`) se le cambian el título de la push,
 * el texto y el nombre de la película o serie. El panel y
 * `push_semanal_enviados` guardan lo que de verdad se mandó.
 */

export const TITULO_SEMANAL = 'Tu resumen semanal'

const TITULO_POR_IDIOMA: Record<Idioma, string> = {
  es: TITULO_SEMANAL,
  en: 'Your weekly recap',
}

const LIMITE_NOTIFICACIONES = 3
const DIA_MS = 24 * 60 * 60 * 1000
const SEMANA_MS = 7 * DIA_MS
/** Una corrida real por semana: si Vercel dispara el cron dos veces, la segunda no hace nada. */
const ENTRE_CORRIDAS_MS = 5 * DIA_MS

/** Argentina no tiene horario de verano: siempre UTC-3. */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000

/** Cuántos títulos de la watchlist se miran por persona, de los últimos guardados. */
const WATCHLIST_A_MIRAR = 40
/** Calificaciones de 4 o más que arman el gusto. */
const ALTOS_A_MIRAR = 12
/** De ésas, a cuántas se les piden las recomendaciones de TMDB. */
const ALTOS_CON_RECOS = 5
const NOTA_MINIMA = 4
/** Un estreno con menos que esto en TMDB no se recomienda. */
const VOTO_MINIMO = 6.5

const TMDB = 'https://api.themoviedb.org/3'

type MediaType = 'movie' | 'tv'
type Motivo = 'watchlist' | 'estreno'

const clave = (mediaType: string, id: number) => `${mediaType}:${id}`

// ── Géneros ────────────────────────────────────────────────────────────────

/** Nombre de género (como lo guarda `profiles.favorite_genres`) → id de TMDB. */
const GENERO_ID: Record<string, number> = {
  'Acción': 28, 'Comedia': 35, 'Drama': 18, 'Terror': 27,
  'Ciencia ficción': 878, 'Thriller': 53, 'Animación': 16,
  'Romance': 10749, 'Documental': 99, 'Aventura': 12,
  'Fantasía': 14, 'Misterio': 9648, 'Historia': 36,
  'Crimen': 80, 'Musical': 10402, 'Western': 37, 'Guerra': 10752,
  'Familia': 10751,
}

/**
 * Los géneros de series que TMDB junta en uno, llevados a los de película,
 * que son los de `favorite_genres`. "Action & Adventure" es acción y aventura.
 */
const GENERO_SERIE: Record<number, number[]> = {
  10759: [28, 12],
  10765: [878, 14],
  10768: [10752],
  10762: [10751],
}

function generosComoPelicula(ids: number[]): number[] {
  return ids.flatMap(id => GENERO_SERIE[id] ?? [id])
}

// ── Plataformas ────────────────────────────────────────────────────────────

/**
 * Las plataformas de alguien: id de proveedor de TMDB → nombre para el texto.
 *
 * Cada plataforma grande es una familia de ids (`PLATAFORMAS_GRANDES`): quien
 * eligió el 384, el id viejo de Max, también tiene el 1899 de hoy.
 */
export function plataformasDe(favoritas: string[] | null): Map<number, string> {
  const mapa = new Map<number, string>()
  for (const fav of favoritas ?? []) {
    const id = Number(fav)
    if (!Number.isInteger(id)) continue
    const familia = PLATAFORMAS_GRANDES.find(f => f.ids.includes(id))
    if (familia) {
      for (const otro of familia.ids) mapa.set(otro, familia.name)
      continue
    }
    mapa.set(id, ALL_PLATFORMS.find(p => p.id === id)?.name ?? '')
  }
  return mapa
}

// ── TMDB, con memoria por corrida ──────────────────────────────────────────

interface Ficha {
  nombre: string
  generos: number[]
  /** En Argentina, por suscripción, gratis o con publicidad. En el orden de TMDB. */
  proveedores: { id: number; nombre: string }[]
}

interface Candidato {
  mediaType: MediaType
  id: number
  generos: number[]
  voto: number
  popularidad: number
}

/**
 * Las mismas fichas y los mismos estrenos se repiten entre personas: cada
 * pedido a TMDB se hace una sola vez por corrida.
 */
class Tmdb {
  private memoria = new Map<string, Promise<unknown>>()

  constructor(private key: string) {}

  private get<T>(ruta: string, params: Record<string, string> = {}): Promise<T | null> {
    const qs = new URLSearchParams({ api_key: this.key, language: 'es-AR', ...params })
    const url = `${TMDB}${ruta}?${qs}`
    let p = this.memoria.get(url) as Promise<T | null> | undefined
    if (!p) {
      p = fetch(url, { cache: 'no-store' })
        .then(r => (r.ok ? (r.json() as Promise<T>) : null))
        .catch(() => null)
      this.memoria.set(url, p)
    }
    return p
  }

  async ficha(mediaType: MediaType, id: number): Promise<Ficha | null> {
    type Proveedor = { provider_id: number; provider_name: string }
    const json = await this.get<{
      title?: string; name?: string
      genres?: { id: number }[]
      'watch/providers'?: { results?: Record<string, { flatrate?: Proveedor[]; free?: Proveedor[]; ads?: Proveedor[] }> }
    }>(`/${mediaType}/${id}`, { append_to_response: 'watch/providers' })
    if (!json) return null
    const nombre = (mediaType === 'movie' ? json.title : json.name)?.trim()
    if (!nombre) return null

    const ar = json['watch/providers']?.results?.AR
    const proveedores: Ficha['proveedores'] = []
    for (const p of [...(ar?.flatrate ?? []), ...(ar?.free ?? []), ...(ar?.ads ?? [])]) {
      if (!proveedores.some(x => x.id === p.provider_id)) {
        proveedores.push({ id: p.provider_id, nombre: p.provider_name })
      }
    }
    return {
      nombre,
      generos: generosComoPelicula((json.genres ?? []).map(g => g.id)),
      proveedores,
    }
  }

  /** Estrenos recientes disponibles hoy en alguna de esas plataformas, en Argentina. */
  async estrenos(mediaType: MediaType, proveedores: number[]): Promise<Candidato[]> {
    const hoy = fechaArgentina(0)
    const desde = fechaArgentina(mediaType === 'movie' ? 180 : 90)
    const campo = mediaType === 'movie' ? 'primary_release_date' : 'first_air_date'
    const params = {
      watch_region: 'AR',
      with_watch_providers: [...proveedores].sort((a, b) => a - b).join('|'),
      with_watch_monetization_types: 'flatrate|free|ads',
      sort_by: 'popularity.desc',
      include_adult: 'false',
      'vote_count.gte': mediaType === 'movie' ? '30' : '15',
      [`${campo}.gte`]: desde,
      [`${campo}.lte`]: hoy,
    }
    type Resultado = { id: number; genre_ids?: number[]; vote_average?: number; popularity?: number }
    const paginas = await Promise.all(
      ['1', '2'].map(page => this.get<{ results?: Resultado[] }>(`/discover/${mediaType}`, { ...params, page }))
    )
    return paginas.flatMap(p => p?.results ?? []).map(r => ({
      mediaType,
      id: r.id,
      generos: generosComoPelicula(r.genre_ids ?? []),
      voto: r.vote_average ?? 0,
      popularidad: r.popularity ?? 0,
    }))
  }

  /** Sólo el nombre, en otro idioma que el de la ficha. */
  async nombreEn(mediaType: MediaType, id: number, idioma: Idioma): Promise<string | null> {
    const json = await this.get<{ title?: string; name?: string }>(`/${mediaType}/${id}`, { language: idiomaTmdb(idioma) })
    return (mediaType === 'movie' ? json?.title : json?.name)?.trim() || null
  }

  async recomendaciones(mediaType: MediaType, id: number): Promise<string[]> {
    const json = await this.get<{ results?: { id: number; media_type?: string }[] }>(
      `/${mediaType}/${id}/recommendations`
    )
    return (json?.results ?? []).map(r => clave(r.media_type ?? mediaType, r.id))
  }
}

function fechaArgentina(diasAtras: number): string {
  return new Date(Date.now() - AR_OFFSET_MS - diasAtras * DIA_MS).toISOString().slice(0, 10)
}

export function esViernesEnArgentina(ahora = Date.now()): boolean {
  return new Date(ahora - AR_OFFSET_MS).getUTCDay() === 5
}

/** El próximo viernes a las 18 de Argentina (21 UTC). */
export function proximaCorrida(ahora = Date.now()): string {
  const d = new Date(ahora)
  d.setUTCHours(21, 0, 0, 0)
  const dias = (5 - d.getUTCDay() + 7) % 7
  d.setUTCDate(d.getUTCDate() + dias)
  if (d.getTime() <= ahora) d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString()
}

async function enParalelo<T, R>(items: T[], cuantos: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(items.length)
  let siguiente = 0
  await Promise.all(
    Array.from({ length: Math.min(cuantos, items.length) }, async () => {
      while (siguiente < items.length) {
        const i = siguiente++
        salida[i] = await fn(items[i])
      }
    })
  )
  return salida
}

// ── La elección ────────────────────────────────────────────────────────────

export interface Perfil {
  id: string
  favorite_platforms: string[] | null
  favorite_genres: string[] | null
  notification_preferences: unknown
}

export interface Eleccion {
  motivo: Motivo
  mediaType: MediaType
  tmdbId: number
  nombre: string
  plataforma: string
  cuerpo: string
  /** La ruta que abre la app: la ficha. */
  url: string
}

export type SinEleccion = 'sin_plataformas' | 'nada_encaja'

type Fila = { media_id: number; media_type: string }

async function filasDe<T>(
  admin: SupabaseClient,
  tabla: string,
  columnas: string,
  userId: string,
  orden?: string
): Promise<T[]> {
  let q = admin.from(tabla).select(columnas).eq('user_id', userId).limit(5000)
  if (orden) q = q.order(orden, { ascending: false })
  const { data, error } = await q
  if (error) throw new Error(`${tabla}: ${error.message}`)
  return (data ?? []) as T[]
}

function cuerpoDe(motivo: Motivo, plataforma: string, nombre: string, idioma: Idioma): string {
  if (idioma === 'en') {
    return motivo === 'watchlist'
      ? `Now on ${plataforma}: ${nombre}, from your watchlist`
      : `For this weekend on ${plataforma}: ${nombre}`
  }
  return motivo === 'watchlist'
    ? `Ya está en ${plataforma}: ${nombre}, que tenías guardada`
    : `Para este finde en ${plataforma}: ${nombre}`
}

/**
 * La elección, en el idioma de la persona. En castellano queda igual; si TMDB
 * no da el nombre en inglés, va el de castellano con el resto en inglés.
 */
async function enSuIdioma(tmdb: Tmdb, e: Eleccion, idioma: Idioma): Promise<Eleccion> {
  if (idioma === 'es') return e
  const nombre = (await tmdb.nombreEn(e.mediaType, e.tmdbId, idioma)) ?? e.nombre
  return { ...e, nombre, cuerpo: cuerpoDe(e.motivo, e.plataforma, nombre, idioma) }
}

/** Primer título de la lista que esté en alguna de sus plataformas. */
async function primeroDisponible(
  tmdb: Tmdb,
  titulos: { mediaType: MediaType; id: number }[],
  plataformas: Map<number, string>,
  motivo: Motivo
): Promise<Eleccion | null> {
  // De a tandas, para respetar el orden sin mirar uno por uno.
  for (let i = 0; i < titulos.length; i += 6) {
    const tanda = titulos.slice(i, i + 6)
    const fichas = await Promise.all(tanda.map(t => tmdb.ficha(t.mediaType, t.id)))
    for (let j = 0; j < tanda.length; j++) {
      const ficha = fichas[j]
      if (!ficha) continue
      const proveedor = ficha.proveedores.find(p => plataformas.has(p.id))
      if (!proveedor) continue
      const plataforma = plataformas.get(proveedor.id) || proveedor.nombre
      const { mediaType, id } = tanda[j]
      return {
        motivo,
        mediaType,
        tmdbId: id,
        nombre: ficha.nombre,
        plataforma,
        cuerpo: cuerpoDe(motivo, plataforma, ficha.nombre, 'es'),
        url: `/${mediaType}/${id}`,
      }
    }
  }
  return null
}

/**
 * Lo que le tocaría a una persona esta semana, o por qué nada.
 *
 * `yaRecomendados` son los títulos de "Ferlage te recomienda ver", que se
 * buscan una sola vez por corrida.
 */
async function elegir(
  admin: SupabaseClient,
  tmdb: Tmdb,
  perfil: Perfil,
  yaRecomendados: Set<string>
): Promise<Eleccion | SinEleccion> {
  const plataformas = plataformasDe(perfil.favorite_platforms)
  if (plataformas.size === 0) return 'sin_plataformas'

  const [watchlist, vistas, notas, resenas, enviadas, avisadas] = await Promise.all([
    filasDe<Fila>(admin, 'watchlist', 'media_id, media_type', perfil.id, 'added_at'),
    filasDe<Fila>(admin, 'watched', 'media_id, media_type', perfil.id),
    filasDe<Fila & { rating: number | null }>(admin, 'ratings', 'media_id, media_type, rating', perfil.id, 'rated_at'),
    filasDe<Fila & { rating: number | null }>(admin, 'reviews', 'media_id, media_type, rating', perfil.id, 'created_at'),
    filasDe<{ media_type: string; tmdb_id: number }>(admin, 'push_semanal_enviados', 'media_type, tmdb_id', perfil.id),
    // Lo que ya le avisó "Ya está en…" del cron diario (`lib/disponibilidad.ts`).
    filasDe<Fila>(admin, 'avisos_disponibilidad', 'media_id, media_type', perfil.id),
  ])

  const excluidos = new Set<string>(yaRecomendados)
  for (const f of [...vistas, ...notas, ...resenas]) excluidos.add(clave(f.media_type, f.media_id))
  for (const f of enviadas) excluidos.add(clave(f.media_type, f.tmdb_id))
  for (const f of avisadas) excluidos.add(clave(f.media_type, f.media_id))

  const esTipo = (t: string): t is MediaType => t === 'movie' || t === 'tv'

  // a. La watchlist, de lo último guardado a lo más viejo.
  const guardados = watchlist
    .filter(f => esTipo(f.media_type) && !excluidos.has(clave(f.media_type, f.media_id)))
    .slice(0, WATCHLIST_A_MIRAR)
    .map(f => ({ mediaType: f.media_type as MediaType, id: f.media_id }))
  const deLaLista = await primeroDisponible(tmdb, guardados, plataformas, 'watchlist')
  if (deLaLista) return deLaLista

  // b. Un estreno que encaje con sus géneros y con lo que calificó alto.
  const favoritos = new Set(
    (perfil.favorite_genres ?? []).map(g => GENERO_ID[g]).filter((id): id is number => id !== undefined)
  )
  const altos: { mediaType: MediaType; id: number }[] = []
  for (const f of [...notas, ...resenas]) {
    if (!esTipo(f.media_type) || (f.rating ?? 0) < NOTA_MINIMA) continue
    if (altos.some(a => a.mediaType === f.media_type && a.id === f.media_id)) continue
    altos.push({ mediaType: f.media_type, id: f.media_id })
    if (altos.length >= ALTOS_A_MIRAR) break
  }
  // Sin nada calificado alto no hay con qué decir que un estreno "encaja":
  // los géneros solos le darían a todos lo mismo.
  if (altos.length === 0) return 'nada_encaja'

  const [fichasAltas, recos] = await Promise.all([
    Promise.all(altos.map(a => tmdb.ficha(a.mediaType, a.id))),
    Promise.all(altos.slice(0, ALTOS_CON_RECOS).map(a => tmdb.recomendaciones(a.mediaType, a.id))),
  ])
  const gusto = new Map<number, number>()
  for (const ficha of fichasAltas) {
    for (const g of new Set(ficha?.generos ?? [])) gusto.set(g, (gusto.get(g) ?? 0) + 1)
  }
  const recomendados = new Set(recos.flat())

  const enLista = new Set(watchlist.map(f => clave(f.media_type, f.media_id)))
  const proveedores = [...plataformas.keys()]
  const [peliculas, series] = await Promise.all([
    tmdb.estrenos('movie', proveedores),
    tmdb.estrenos('tv', proveedores),
  ])

  const puntuados = [...peliculas, ...series]
    .filter(c => {
      const k = clave(c.mediaType, c.id)
      return !excluidos.has(k) && !enLista.has(k) && c.voto >= VOTO_MINIMO
    })
    .map(c => {
      const generos = [...new Set(c.generos)]
      const deFavoritos = generos.filter(g => favoritos.has(g)).length
      // Qué parte de lo que calificó alto comparte algún género con el estreno.
      const deGusto = generos.reduce((s, g) => Math.max(s, gusto.get(g) ?? 0), 0) / altos.length
      const recomendado = recomendados.has(clave(c.mediaType, c.id))
      // Tiene que coincidir con sus géneros (si eligió) y con lo que calificó alto.
      const encaja =
        (favoritos.size === 0 || deFavoritos > 0) &&
        (deGusto > 0 || recomendado)
      // En proporción y no en cantidad: si no, gana el título con más géneros.
      const puntaje =
        (recomendado ? 5 : 0) +
        deGusto * 3 +
        (generos.length > 0 ? (deFavoritos / generos.length) * 2 : 0) +
        c.voto / 2
      return { c, encaja, puntaje }
    })
    .filter(p => p.encaja)
    .sort((a, b) => b.puntaje - a.puntaje || b.c.popularidad - a.c.popularidad)
    .slice(0, 6)
    .map(p => ({ mediaType: p.c.mediaType, id: p.c.id }))

  // Se confirma con la ficha en qué plataforma está: discover puede estar atrasado.
  return (await primeroDisponible(tmdb, puntuados, plataformas, 'estreno')) ?? 'nada_encaja'
}

// ── Lo que comparten la corrida y la prueba ────────────────────────────────

function nuevoTmdb(): Tmdb {
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!key) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY.')
  return new Tmdb(key)
}

/** Los títulos que salieron en "Ferlage te recomienda ver". */
async function titulosRecomendados(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin
    .from('push_envios')
    .select('media_type, tmdb_id')
    .eq('tipo', 'recomendacion')
    .eq('prueba', false)
    .limit(5000)
  if (error) throw new Error(`push_envios: ${error.message}`)
  return new Set(
    ((data ?? []) as { media_type: string; tmdb_id: number }[]).map(r => clave(r.media_type, r.tmdb_id))
  )
}

/**
 * Cuántas notificaciones recibió cada uno en los últimos 7 días: sus filas de
 * `notifications` más los envíos reales de "Ferlage te recomienda ver", que no
 * dejan fila, si no los tiene apagados.
 */
async function notificacionesDeLaSemana(
  admin: SupabaseClient,
  perfiles: Perfil[]
): Promise<Map<string, number>> {
  const desde = new Date(Date.now() - SEMANA_MS).toISOString()
  const cuenta = new Map<string, number>()

  const { count: recomendaciones, error } = await admin
    .from('push_envios')
    .select('id', { count: 'exact', head: true })
    .eq('tipo', 'recomendacion')
    .eq('prueba', false)
    .gte('creado_en', desde)
  if (error) throw new Error(`push_envios: ${error.message}`)
  for (const p of perfiles) {
    cuenta.set(p.id, envioApagado(p.notification_preferences, 'recomendacion') ? 0 : recomendaciones ?? 0)
  }

  const ids = perfiles.map(p => p.id)
  for (let i = 0; i < ids.length; i += 100) {
    const tanda = ids.slice(i, i + 100)
    for (let desdeFila = 0; ; desdeFila += 1000) {
      // Las filas del cron diario con `sin_push` sólo cuentan si salieron como
      // push (`push_enviado_en`): las otras quedaron en la bandeja, sin sonar.
      const { data, error: e } = await admin
        .from('notifications')
        .select('user_id')
        .in('user_id', tanda)
        .gte('created_at', desde)
        .or('sin_push.eq.false,push_enviado_en.not.is.null')
        .range(desdeFila, desdeFila + 999)
      if (e) throw new Error(`notifications: ${e.message}`)
      for (const row of (data ?? []) as { user_id: string }[]) {
        cuenta.set(row.user_id, (cuenta.get(row.user_id) ?? 0) + 1)
      }
      if (!data || data.length < 1000) break
    }
  }
  return cuenta
}

/** user_id → sus tokens. */
async function tokensPorUsuario(admin: SupabaseClient, userId?: string): Promise<Map<string, string[]>> {
  const porUsuario = new Map<string, Set<string>>()
  for (let desde = 0; ; desde += 1000) {
    let q = admin.from('user_devices').select('user_id, push_token').range(desde, desde + 999)
    if (userId) q = q.eq('user_id', userId)
    const { data, error } = await q
    if (error) throw new Error(`user_devices: ${error.message}`)
    for (const row of (data ?? []) as { user_id: string; push_token: string | null }[]) {
      if (!row.push_token) continue
      const set = porUsuario.get(row.user_id) ?? new Set<string>()
      set.add(row.push_token)
      porUsuario.set(row.user_id, set)
    }
    if (!data || data.length < 1000) break
  }
  return new Map([...porUsuario].map(([id, set]) => [id, [...set]]))
}

async function perfilesDe(admin: SupabaseClient, ids: string[]): Promise<Perfil[]> {
  const perfiles: Perfil[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, favorite_platforms, favorite_genres, notification_preferences')
      .in('id', ids.slice(i, i + 200))
    if (error) throw new Error(`profiles: ${error.message}`)
    perfiles.push(...((data ?? []) as Perfil[]))
  }
  return perfiles
}

// ── La corrida de los viernes ──────────────────────────────────────────────

export interface ResumenCorrida {
  envioId: number | null
  /** Por qué no corrió, si no corrió. */
  saltada?: string
  conAparato: number
  apagada: number
  sinPlataformas: number
  porLimite: number
  nadaEncaja: number
  errores: number
  deLaWatchlist: number
  estrenos: number
  destinatarios: number
  enviados: number
  fallidos: number
  tokensBorrados: number
}

export async function correrSemanal(admin: SupabaseClient): Promise<ResumenCorrida> {
  const resumen: ResumenCorrida = {
    envioId: null, conAparato: 0, apagada: 0, sinPlataformas: 0, porLimite: 0, nadaEncaja: 0,
    errores: 0, deLaWatchlist: 0, estrenos: 0, destinatarios: 0, enviados: 0, fallidos: 0, tokensBorrados: 0,
  }

  const corridasRecientes = () => admin
    .from('push_envios')
    .select('id')
    .eq('tipo', 'semanal')
    .eq('prueba', false)
    .gte('creado_en', new Date(Date.now() - ENTRE_CORRIDAS_MS).toISOString())
    .order('creado_en', { ascending: true })
    .order('id', { ascending: true })

  const { data: previas, error: previasError } = await corridasRecientes()
  if (faltaLaTabla(previasError)) throw new Error('Falta correr supabase-push-semanal-2026-10.sql.')
  if (previasError) throw new Error(previasError.message)
  if ((previas ?? []).length > 0) return { ...resumen, saltada: 'Ya corrió esta semana.' }

  // La fila va primero y se vuelve a contar: si el cron entró dos veces a la
  // vez, sigue sólo la más vieja.
  const { data: fila, error: insertError } = await admin
    .from('push_envios')
    .insert({ tipo: 'semanal', prueba: false, titulo: TITULO_SEMANAL, cuerpo: 'Armando…', url: '/', destinatarios: 0 })
    .select('id')
    .single()
  if (insertError || !fila) throw new Error(insertError?.message ?? 'No se pudo registrar la corrida.')
  const { data: ahora } = await corridasRecientes()
  if ((ahora ?? [])[0]?.id !== fila.id) {
    await admin.from('push_envios').delete().eq('id', fila.id)
    return { ...resumen, saltada: 'Otra corrida empezó antes.' }
  }
  resumen.envioId = fila.id

  let armado: Awaited<ReturnType<typeof armarCorrida>>
  try {
    armado = await armarCorrida(admin, fila.id, resumen)
  } catch (err) {
    // Todavía no salió nada: se borra todo para que se pueda volver a correr.
    await admin.from('push_semanal_enviados').delete().eq('envio_id', fila.id)
    await admin.from('push_envios').delete().eq('id', fila.id)
    throw err
  }
  const { tokens, elegidos, reservados, idiomas } = armado

  const mensajes: ExpoMessage[] = []
  for (const { userId, eleccion: e } of elegidos) {
    if (!reservados.has(userId)) continue
    if (e.motivo === 'watchlist') resumen.deLaWatchlist++
    else resumen.estrenos++
    for (const token of tokens.get(userId) ?? []) {
      mensajes.push({
        token,
        title: TITULO_POR_IDIOMA[idiomas.get(userId) ?? 'es'],
        body: e.cuerpo,
        // `entityId` es el envío: la app lo devuelve en `push_abierta`.
        data: { url: e.url, type: 'semanal', entityId: String(fila.id) },
      })
    }
  }

  const resultado = await sendExpoPushMessages(mensajes)
  const borrados = await deleteDeadTokens(admin, resultado.muertos)
  Object.assign(resumen, {
    destinatarios: mensajes.length,
    enviados: resultado.aceptados.length,
    fallidos: resultado.fallidos,
    tokensBorrados: borrados,
  })

  const personas = resumen.deLaWatchlist + resumen.estrenos
  const { error: updateError } = await admin
    .from('push_envios')
    .update({
      cuerpo: `${personas} ${personas === 1 ? 'persona' : 'personas'}: ${resumen.deLaWatchlist} de la watchlist, ${resumen.estrenos} estrenos`,
      destinatarios: mensajes.length,
      enviados: resultado.aceptados.length,
      fallidos: resultado.fallidos,
      tokens_borrados: borrados,
      tickets: resultado.aceptados.length > 0 ? resultado.aceptados : null,
      recibos_revisados_en: resultado.aceptados.length > 0 ? null : new Date().toISOString(),
    })
    .eq('id', fila.id)
  if (updateError) console.error('[semanal] no se pudo guardar el resultado:', updateError.message)

  return resumen
}

/** Quién recibe qué, con cada título ya reservado. Todavía no manda nada. */
async function armarCorrida(admin: SupabaseClient, envioId: number, resumen: ResumenCorrida) {
  const tokens = await tokensPorUsuario(admin)
  const perfiles = await perfilesDe(admin, [...tokens.keys()])
  resumen.conAparato = perfiles.length

  const prendidos = perfiles.filter(p => !envioApagado(p.notification_preferences, 'semanal'))
  resumen.apagada = perfiles.length - prendidos.length
  const conPlataformas = prendidos.filter(p => plataformasDe(p.favorite_platforms).size > 0)
  resumen.sinPlataformas = prendidos.length - conPlataformas.length

  const recibidas = await notificacionesDeLaSemana(admin, conPlataformas)
  const candidatos = conPlataformas.filter(p => (recibidas.get(p.id) ?? 0) < LIMITE_NOTIFICACIONES)
  resumen.porLimite = conPlataformas.length - candidatos.length

  const tmdb = nuevoTmdb()
  const yaRecomendados = await titulosRecomendados(admin)
  const idiomas = await idiomasDe(admin, candidatos.map(p => p.id))
  const elecciones = await enParalelo(candidatos, 4, async p => {
    try {
      const eleccion = await elegir(admin, tmdb, p, yaRecomendados)
      return {
        perfil: p,
        eleccion: typeof eleccion === 'string' ? eleccion : await enSuIdioma(tmdb, eleccion, idiomas.get(p.id) ?? 'es'),
      }
    } catch (err) {
      console.error(`[semanal] ${p.id}:`, (err as Error).message)
      return { perfil: p, eleccion: null }
    }
  })

  const elegidos: { userId: string; eleccion: Eleccion }[] = []
  for (const { perfil, eleccion } of elecciones) {
    if (eleccion === null) resumen.errores++
    else if (eleccion === 'sin_plataformas') resumen.sinPlataformas++
    else if (eleccion === 'nada_encaja') resumen.nadaEncaja++
    else elegidos.push({ userId: perfil.id, eleccion })
  }

  // Se reserva cada título antes de mandar: el único por persona y título
  // hace que nunca salga dos veces, aunque algo se cruce.
  let reservados = new Set<string>()
  if (elegidos.length > 0) {
    const { data, error } = await admin
      .from('push_semanal_enviados')
      .upsert(
        elegidos.map(({ userId, eleccion: e }) => ({
          envio_id: envioId,
          user_id: userId,
          media_type: e.mediaType,
          tmdb_id: e.tmdbId,
          motivo: e.motivo,
          plataforma: e.plataforma,
          cuerpo: e.cuerpo,
          aparatos: tokens.get(userId)?.length ?? 0,
        })),
        { onConflict: 'user_id,media_type,tmdb_id', ignoreDuplicates: true }
      )
      .select('user_id')
    if (error) throw new Error(`push_semanal_enviados: ${error.message}`)
    reservados = new Set(((data ?? []) as { user_id: string }[]).map(r => r.user_id))
  }

  return { tokens, elegidos, reservados, idiomas }
}

// ── La prueba del panel ────────────────────────────────────────────────────

export interface ResultadoPrueba {
  eleccion: Eleccion | null
  /** Por qué no hay nada para mandar. */
  sinEleccion: string | null
  /** Cosas que harían que el viernes no le llegue, aunque la prueba salga. */
  avisos: string[]
  envioId: number | null
  destinatarios: number
  enviados: number
  fallidos: number
}

/**
 * Arma la semanal de una persona y se la manda sólo a ella. No reserva el
 * título: el viernes le puede tocar el mismo.
 */
export async function probarSemanal(admin: SupabaseClient, userId: string): Promise<ResultadoPrueba> {
  const [perfil] = await perfilesDe(admin, [userId])
  if (!perfil) throw new Error('No se encontró tu perfil.')
  const tokens = (await tokensPorUsuario(admin, userId)).get(userId) ?? []

  const avisos: string[] = []
  if (envioApagado(perfil.notification_preferences, 'semanal')) {
    avisos.push('Tenés apagado "Tu resumen semanal" en los ajustes de la app: el viernes no te llegaría.')
  }
  const recibidas = (await notificacionesDeLaSemana(admin, [perfil])).get(userId) ?? 0
  if (recibidas >= LIMITE_NOTIFICACIONES) {
    avisos.push(`En los últimos 7 días recibiste ${recibidas} notificaciones: si fuera viernes, la tuya se saltearía.`)
  }

  const vacio = { avisos, envioId: null, destinatarios: 0, enviados: 0, fallidos: 0 }
  const tmdb = nuevoTmdb()
  const idioma = await idiomaDe(admin, userId)
  const elegida = await elegir(admin, tmdb, perfil, await titulosRecomendados(admin))
  const eleccion = typeof elegida === 'string' ? elegida : await enSuIdioma(tmdb, elegida, idioma)
  if (eleccion === 'sin_plataformas') {
    return { ...vacio, eleccion: null, sinEleccion: 'No elegiste plataformas en tu perfil: no te tocaría ninguna.' }
  }
  if (eleccion === 'nada_encaja') {
    return {
      ...vacio,
      eleccion: null,
      sinEleccion: 'Nada de tu watchlist está en tus plataformas y ningún estreno encaja con tus géneros y tus calificaciones: esta semana no te llegaría nada.',
    }
  }
  if (tokens.length === 0) {
    return { ...vacio, eleccion, sinEleccion: 'Tu usuario no tiene ningún aparato con notificaciones activadas.' }
  }

  const { data: fila, error } = await admin
    .from('push_envios')
    .insert({
      tipo: 'semanal',
      prueba: true,
      media_type: eleccion.mediaType,
      tmdb_id: eleccion.tmdbId,
      titulo: TITULO_POR_IDIOMA[idioma],
      cuerpo: eleccion.cuerpo,
      url: eleccion.url,
      destinatarios: tokens.length,
      enviado_por: userId,
    })
    .select('id')
    .single()
  if (faltaLaTabla(error)) throw new Error('Falta correr supabase-push-semanal-2026-10.sql.')
  if (error || !fila) throw new Error(error?.message ?? 'No se pudo registrar la prueba.')

  const resultado = await sendExpoPushMessages(tokens.map(token => ({
    token,
    title: TITULO_POR_IDIOMA[idioma],
    body: eleccion.cuerpo,
    data: { url: eleccion.url, type: 'semanal', entityId: String(fila.id) },
  })))
  const borrados = await deleteDeadTokens(admin, resultado.muertos)
  await admin
    .from('push_envios')
    .update({
      enviados: resultado.aceptados.length,
      fallidos: resultado.fallidos,
      tokens_borrados: borrados,
      tickets: resultado.aceptados.length > 0 ? resultado.aceptados : null,
      recibos_revisados_en: resultado.aceptados.length > 0 ? null : new Date().toISOString(),
    })
    .eq('id', fila.id)

  return {
    eleccion,
    sinEleccion: null,
    avisos,
    envioId: fila.id,
    destinatarios: tokens.length,
    enviados: resultado.aceptados.length,
    fallidos: resultado.fallidos,
  }
}
