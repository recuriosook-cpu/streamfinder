// SERVER-ONLY — lee calificaciones y plataformas con la service role.

import type { SupabaseClient } from '@supabase/supabase-js'
import { plataformasDe } from './resumen-semanal'
import { idiomaTmdb, type Idioma } from './idioma'

/**
 * "¿Qué veo hoy?" (octubre de 2026): tres preguntas —con quién, qué ganas y
 * cuánto tiempo— y UNA recomendación de sus plataformas, con "Porque te
 * gustó X". Reemplaza al
 * recomendador por ánimo (`/api/mood-recommendations` y `lib/mood.ts` de la
 * app). Lo usan la web y la app por `/api/que-veo-hoy`, así hay un solo
 * motor.
 *
 * ── De dónde sale ─────────────────────────────────────────────────────────
 *
 *   1. De lo que calificó con 4 o más: las recomendaciones de TMDB de esos
 *      títulos, filtradas por las respuestas y confirmadas en sus plataformas,
 *      en su país. Es lo que deja decir "Porque te gustó X".
 *   2. Si eso no alcanza, conocidas de sus plataformas con los géneros de las
 *      respuestas ("Popular en Netflix").
 *
 * Nunca algo que ya vio, calificó o reseñó, ni lo que la app o la web le
 * mostraron hace poco (`excluir`). Devuelve hasta 4: la primera y las 3 de
 * "Otra".
 */

export type Compania = 'solo' | 'pareja' | 'amigos' | 'familia'
export type Ganas = 'reirme' | 'emocionarme' | 'asustarme' | 'accion' | 'intriga'
/**
 * Cuánto tiempo tiene. Se mira la duración real: en películas, la película; en
 * series, el episodio. "Más de 2 h" son sólo películas y "Un capítulo", sólo
 * series.
 */
export type Duracion = 'corta' | 'hasta2' | 'larga' | 'capitulo' | 'sinApuro'

export const COMPANIAS: Compania[] = ['solo', 'pareja', 'amigos', 'familia']
export const GANAS: Ganas[] = ['reirme', 'emocionarme', 'asustarme', 'accion', 'intriga']
export const DURACIONES: Duracion[] = ['corta', 'hasta2', 'larga', 'capitulo', 'sinApuro']

/**
 * Las ganas de antes de las cinco actuales (23/10). Las sigue mandando una
 * pestaña de la web abierta desde antes del cambio.
 */
export const GANAS_VIEJAS: Record<string, Ganas> = {
  tension: 'intriga',
  liviano: 'reirme',
  sorprendeme: 'accion',
}

export const RESULTADOS = 4

type MediaType = 'movie' | 'tv'

export interface ResultadoQueVeoHoy {
  mediaType: MediaType
  id: number
  titulo: string
  anio: string | null
  posterPath: string | null
  backdropPath: string | null
  nota: number
  /** La plataforma suya donde está, o `null` si no eligió plataformas. */
  plataforma: { id: number; nombre: string } | null
  /** El título que calificó alto y la trajo; `null` si vino de las populares. */
  porque: string | null
  /** Minutos: la película, o un episodio de la serie. `null` si no se miró o TMDB no lo sabe. */
  duracion: number | null
}

// ── Géneros de cada respuesta ──────────────────────────────────────────────

/** Géneros de TMDB de cine (los de series se traducen abajo). */
function generosPara(ganas: Ganas, compania: Compania): number[] {
  if (compania === 'familia') {
    // Nada de terror ni suspenso en familia (`NO_EN_FAMILIA`): "asustarme" es
    // misterio y fantasía para chicos.
    return {
      reirme: [35, 10751, 16],
      emocionarme: [18, 10751, 16],
      asustarme: [9648, 14, 16],
      accion: [12, 28, 16, 10751],
      intriga: [9648, 12, 14],
    }[ganas]
  }
  if (compania === 'pareja') {
    return {
      reirme: [35, 10749],
      emocionarme: [10749, 18],
      asustarme: [27, 53],
      accion: [28, 12, 53],
      intriga: [53, 9648, 80],
    }[ganas]
  }
  if (compania === 'amigos') {
    return {
      reirme: [35],
      emocionarme: [18, 10752],
      asustarme: [27, 53],
      accion: [28, 12, 878],
      intriga: [53, 80, 9648],
    }[ganas]
  }
  return {
    reirme: [35],
    emocionarme: [18, 10749],
    asustarme: [27, 53],
    accion: [28, 12, 878],
    intriga: [53, 9648, 80],
  }[ganas]
}

// ── Duración ───────────────────────────────────────────────────────────────

/** Si la duración deja ese tipo: "Más de 2 h" no tiene series, "Un capítulo" no tiene películas. */
function tipoPermitido(tipo: MediaType, duracion: Duracion): boolean {
  if (duracion === 'capitulo') return tipo === 'tv'
  if (duracion === 'larga') return tipo === 'movie'
  return true
}

/** Si hace falta mirar los minutos de ese título para saber si entra. */
function hayQueMedir(tipo: MediaType, duracion: Duracion): boolean {
  if (duracion === 'sinApuro' || duracion === 'capitulo') return false
  return tipo === 'movie' || duracion === 'corta' || duracion === 'hasta2'
}

/**
 * Si los minutos entran. Una película sin duración conocida no entra (no se
 * puede prometer "menos de 1:30 h"); una serie sin duración del episodio sí,
 * porque casi todos los episodios duran menos de una hora.
 */
function entraEnElTiempo(tipo: MediaType, minutos: number | null, duracion: Duracion): boolean {
  if (!hayQueMedir(tipo, duracion)) return true
  if (minutos === null) return tipo === 'tv'
  if (duracion === 'corta') return minutos < 90
  if (duracion === 'hasta2') return minutos <= 120
  return minutos > 120
}

/** Para que TMDB filtre de entrada (en series, `with_runtime` mira el episodio). */
function filtroDuracion(duracion: Duracion): Record<string, string> {
  if (duracion === 'corta') return { 'with_runtime.lte': '89' }
  if (duracion === 'hasta2') return { 'with_runtime.lte': '120' }
  if (duracion === 'larga') return { 'with_runtime.gte': '121' }
  return {}
}

/** Lo que nunca va en familia: terror, suspenso, crimen, guerra. */
const NO_EN_FAMILIA = new Set([27, 53, 80, 10752])

/** Los géneros de series de TMDB, llevados a los de cine. */
const SERIE_A_CINE: Record<number, number[]> = {
  10759: [28, 12], 10765: [878, 14], 10768: [10752], 10762: [10751],
}
const comoCine = (ids: number[]) => ids.flatMap(id => SERIE_A_CINE[id] ?? [id])

/** Para pedir series por género: los de cine que tienen equivalente. */
const CINE_A_SERIE: Record<number, number> = {
  35: 35, 18: 18, 80: 80, 9648: 9648, 16: 16, 10751: 10751, 99: 99,
  28: 10759, 12: 10759, 14: 10765, 878: 10765, 10752: 10768,
}

// ── TMDB, con memoria por pedido ───────────────────────────────────────────

const TMDB = 'https://api.themoviedb.org/3'

type Fila = {
  id: number; title?: string; name?: string; genre_ids?: number[]
  vote_average?: number; vote_count?: number; popularity?: number
  poster_path?: string | null; backdrop_path?: string | null
  release_date?: string; first_air_date?: string
}

class Tmdb {
  private memoria = new Map<string, Promise<unknown>>()
  constructor(private key: string, private idioma: Idioma) {}

  get<T>(ruta: string, params: Record<string, string> = {}): Promise<T | null> {
    const qs = new URLSearchParams({ api_key: this.key, language: idiomaTmdb(this.idioma), ...params })
    const url = `${TMDB}${ruta}?${qs}`
    let p = this.memoria.get(url) as Promise<T | null> | undefined
    if (!p) {
      p = fetch(url, { next: { revalidate: 3600 } })
        .then(r => (r.ok ? (r.json() as Promise<T>) : null))
        .catch(() => null)
      this.memoria.set(url, p)
    }
    return p
  }

  async recomendaciones(tipo: MediaType, id: number): Promise<Fila[]> {
    return (await this.get<{ results?: Fila[] }>(`/${tipo}/${id}/recommendations`))?.results ?? []
  }

  /** Los proveedores de un título en un país: suscripción, gratis o con publicidad. */
  async proveedores(tipo: MediaType, id: number, pais: string): Promise<number[]> {
    type P = { provider_id: number }
    const json = await this.get<{ results?: Record<string, { flatrate?: P[]; free?: P[]; ads?: P[] }> }>(
      `/${tipo}/${id}/watch/providers`
    )
    const r = json?.results?.[pais]
    return [...(r?.flatrate ?? []), ...(r?.free ?? []), ...(r?.ads ?? [])].map(p => p.provider_id)
  }

  /** Los minutos de la película o de un episodio de la serie; `null` si TMDB no los tiene. */
  async minutos(tipo: MediaType, id: number): Promise<number | null> {
    type Detalle = {
      runtime?: number | null
      episode_run_time?: number[]
      last_episode_to_air?: { runtime?: number | null } | null
    }
    const d = await this.get<Detalle>(`/${tipo}/${id}`)
    const m = tipo === 'movie' ? d?.runtime : (d?.episode_run_time?.[0] ?? d?.last_episode_to_air?.runtime)
    return m && m > 0 ? m : null
  }

  async descubrir(tipo: MediaType, params: Record<string, string>): Promise<Fila[]> {
    const pagina = String(1 + Math.floor(Math.random() * 3))
    return (await this.get<{ results?: Fila[] }>(`/discover/${tipo}`, { ...params, page: pagina }))?.results ?? []
  }
}

// ── La elección ────────────────────────────────────────────────────────────

const clave = (tipo: string, id: number) => `${tipo}:${id}`

/** Conocida y bien puntuada: lo que se recomienda sin dudar. */
const VOTOS_MINIMOS = 300
const NOTA_MINIMA = 6.3

function aResultado(
  f: Fila,
  tipo: MediaType,
  plataforma: ResultadoQueVeoHoy['plataforma'],
  porque: string | null,
  duracion: number | null
): ResultadoQueVeoHoy | null {
  const titulo = (tipo === 'movie' ? f.title : f.name)?.trim()
  if (!titulo || !f.poster_path) return null
  const fecha = tipo === 'movie' ? f.release_date : f.first_air_date
  return {
    mediaType: tipo,
    id: f.id,
    titulo,
    anio: fecha ? fecha.slice(0, 4) : null,
    posterPath: f.poster_path ?? null,
    backdropPath: f.backdrop_path ?? null,
    nota: f.vote_average ?? 0,
    plataforma,
    porque,
    duracion,
  }
}

/**
 * Si el título va con las respuestas.
 *
 *   · En familia tiene que ser del género familiar (las series infantiles
 *     cuentan), y nada de terror, suspenso, crimen ni guerra. Con "comedia" o
 *     "animación" se colaban cosas para adultos, como Rick y Morty.
 *     Ahí alcanza con cualquiera de sus géneros: casi ninguna serie familiar
 *     tiene "misterio" o "aventura" como principal, y lo importante en
 *     familia ya lo filtró lo anterior.
 *   · Si no, cuenta el género principal (el primero que da TMDB): con
 *     "cualquiera de sus géneros", un drama de guerra entraba en "emocionarme".
 *     En series, el principal traducido a cine ("Acción y aventura" es acción
 *     o aventura).
 */
function encaja(f: Fila, tipo: MediaType, generos: number[], compania: Compania): boolean {
  const ids = f.genre_ids ?? []
  const propios = tipo === 'tv' ? comoCine(ids) : ids
  if (compania === 'familia') {
    if (propios.some(g => NO_EN_FAMILIA.has(g))) return false
    if (!propios.includes(10751)) return false
    if (!generos.some(g => propios.includes(g))) return false
  } else {
    const principal = ids.length === 0 ? [] : tipo === 'tv' ? comoCine([ids[0]]) : [ids[0]]
    if (!principal.some(g => generos.includes(g))) return false
  }
  return (f.vote_count ?? 0) >= VOTOS_MINIMOS && (f.vote_average ?? 0) >= NOTA_MINIMA
}

function mezclar<T>(lista: T[]): T[] {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

export async function queVeoHoy(
  admin: SupabaseClient | null,
  opts: {
    userId: string | null
    compania: Compania
    ganas: Ganas
    duracion: Duracion
    pais: string
    idioma: Idioma
    excluir: Set<string>
  }
): Promise<ResultadoQueVeoHoy[]> {
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!key) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY.')
  const tmdb = new Tmdb(key, opts.idioma)
  const generos = generosPara(opts.ganas, opts.compania)

  // Lo suyo: plataformas, lo que calificó alto y lo que ya marcó.
  let plataformas = new Map<number, string>()
  const semillas: { tipo: MediaType; id: number; titulo: string }[] = []
  const marcados = new Set<string>(opts.excluir)
  if (admin && opts.userId) {
    const uid = opts.userId
    const [perfil, notas, vistas, resenas] = await Promise.all([
      admin.from('profiles').select('favorite_platforms').eq('id', uid).maybeSingle(),
      admin.from('ratings').select('media_type, media_id, rating, title').eq('user_id', uid)
        .order('rating', { ascending: false }).order('rated_at', { ascending: false }).limit(1000),
      admin.from('watched').select('media_type, media_id').eq('user_id', uid).limit(5000),
      admin.from('reviews').select('media_type, media_id').eq('user_id', uid).limit(5000),
    ])
    plataformas = plataformasDe((perfil.data as { favorite_platforms: string[] | null } | null)?.favorite_platforms ?? null)
    type N = { media_type: string; media_id: number; rating: number | string | null; title: string | null }
    for (const n of (notas.data ?? []) as N[]) {
      marcados.add(clave(n.media_type, n.media_id))
      if (Number(n.rating) >= 4 && (n.media_type === 'movie' || n.media_type === 'tv') && n.title) {
        semillas.push({ tipo: n.media_type, id: n.media_id, titulo: n.title })
      }
    }
    for (const f of [...((vistas.data ?? []) as { media_type: string; media_id: number }[]),
      ...((resenas.data ?? []) as { media_type: string; media_id: number }[])]) {
      marcados.add(clave(f.media_type, f.media_id))
    }
  }

  const resultados: ResultadoQueVeoHoy[] = []
  const usados = new Set<string>()
  /** Una por título calificado: si no, las cuatro son "porque te gustó" lo mismo. */
  const porQue = new Set<string>()

  // Su plataforma donde está (`null` si no eligió plataformas) y los minutos,
  // o `undefined` si no está en las suyas o no entra en el tiempo que tiene.
  async function revisar(tipo: MediaType, id: number): Promise<
    { plataforma: ResultadoQueVeoHoy['plataforma']; minutos: number | null } | undefined
  > {
    const [ids, minutos] = await Promise.all([
      plataformas.size > 0 ? tmdb.proveedores(tipo, id, opts.pais) : Promise.resolve([]),
      hayQueMedir(tipo, opts.duracion) ? tmdb.minutos(tipo, id) : Promise.resolve(null),
    ])
    if (!entraEnElTiempo(tipo, minutos, opts.duracion)) return undefined
    if (plataformas.size === 0) return { plataforma: null, minutos }
    const suya = ids.find(p => plataformas.has(p))
    return suya === undefined ? undefined : { plataforma: { id: suya, nombre: plataformas.get(suya) || '' }, minutos }
  }

  // 1. De lo que calificó alto: las 12 más altas, en otro orden cada vez.
  const desde = mezclar(semillas.slice(0, 12)).slice(0, 8)
  const recos = await Promise.all(desde.map(s => tmdb.recomendaciones(s.tipo, s.id)))
  const candidatos: { f: Fila; tipo: MediaType; porque: string }[] = []
  desde.forEach((s, i) => {
    for (const f of recos[i]) {
      const k = clave(s.tipo, f.id)
      if (marcados.has(k) || !tipoPermitido(s.tipo, opts.duracion) || !encaja(f, s.tipo, generos, opts.compania)) continue
      candidatos.push({ f, tipo: s.tipo, porque: s.titulo })
    }
  })
  // Las mejores primero, con un poco de azar para que no salga siempre la misma.
  candidatos.sort((a, b) => (b.f.vote_average ?? 0) + Math.random() - ((a.f.vote_average ?? 0) + Math.random()))
  for (let i = 0; i < candidatos.length && resultados.length < RESULTADOS; i += 6) {
    const tanda = candidatos.slice(i, i + 6).filter(c => !usados.has(clave(c.tipo, c.f.id)) && !porQue.has(c.porque))
    const dondes = await Promise.all(tanda.map(c => revisar(c.tipo, c.f.id)))
    tanda.forEach((c, j) => {
      const donde = dondes[j]
      const k = clave(c.tipo, c.f.id)
      if (donde === undefined || resultados.length >= RESULTADOS || usados.has(k) || porQue.has(c.porque)) return
      const r = aResultado(c.f, c.tipo, donde.plataforma, c.porque, donde.minutos)
      if (!r) return
      usados.add(k)
      porQue.add(c.porque)
      resultados.push(r)
    })
  }

  // 2. Si no alcanzó: conocidas de sus plataformas, con los géneros pedidos.
  if (resultados.length < RESULTADOS) {
    const base: Record<string, string> = {
      sort_by: 'popularity.desc',
      include_adult: 'false',
      'vote_count.gte': '500',
      'vote_average.gte': String(NOTA_MINIMA),
      watch_region: opts.pais,
      with_watch_monetization_types: 'flatrate|free|ads',
    }
    if (plataformas.size > 0) base.with_watch_providers = [...plataformas.keys()].join('|')
    const tiempo = filtroDuracion(opts.duracion)
    // En familia, las series se piden por familiares e infantiles: el género
    // de las ganas lo mira `encaja`, entre todos los suyos.
    const generosSerie = opts.compania === 'familia'
      ? [10751, 10762]
      : [...new Set(generos.map(g => CINE_A_SERIE[g]).filter(Boolean))]
    const pedidos: Promise<{ tipo: MediaType; filas: Fila[] }>[] = []
    if (tipoPermitido('movie', opts.duracion)) {
      pedidos.push(
        tmdb.descubrir('movie', { ...base, ...tiempo, with_genres: generos.join('|') })
          .then(filas => ({ tipo: 'movie' as const, filas }))
      )
    }
    if (tipoPermitido('tv', opts.duracion) && generosSerie.length > 0) {
      pedidos.push(
        tmdb.descubrir('tv', { ...base, ...tiempo, 'vote_count.gte': '200', with_genres: generosSerie.join('|') })
          .then(filas => ({ tipo: 'tv' as const, filas }))
      )
    }
    const pozo = mezclar((await Promise.all(pedidos)).flatMap(({ tipo, filas }) => filas.map(f => ({ tipo, f }))))
    for (let i = 0; i < pozo.length && resultados.length < RESULTADOS; i += 6) {
      const tanda = pozo.slice(i, i + 6).filter(c => {
        const k = clave(c.tipo, c.f.id)
        return !usados.has(k) && !marcados.has(k) && encaja(c.f, c.tipo, generos, opts.compania)
      })
      const dondes = await Promise.all(tanda.map(c => revisar(c.tipo, c.f.id)))
      tanda.forEach((c, j) => {
        const donde = dondes[j]
        if (donde === undefined || resultados.length >= RESULTADOS) return
        const r = aResultado(c.f, c.tipo, donde.plataforma, null, donde.minutos)
        if (!r) return
        usados.add(clave(c.tipo, c.f.id))
        resultados.push(r)
      })
    }
  }

  return resultados
}
