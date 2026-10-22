// SERVER-ONLY — lee calificaciones y plataformas con la service role.

import type { SupabaseClient } from '@supabase/supabase-js'
import { plataformasDe } from './resumen-semanal'
import { idiomaTmdb, type Idioma } from './idioma'

/**
 * "¿Qué veo hoy?" (octubre de 2026): dos preguntas —con quién y qué ganas— y
 * UNA recomendación de sus plataformas, con "Porque te gustó X". Reemplaza al
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
export type Ganas = 'reirme' | 'tension' | 'emocionarme' | 'liviano' | 'sorprendeme'

export const COMPANIAS: Compania[] = ['solo', 'pareja', 'amigos', 'familia']
export const GANAS: Ganas[] = ['reirme', 'tension', 'emocionarme', 'liviano', 'sorprendeme']

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
}

// ── Géneros de cada respuesta ──────────────────────────────────────────────

/** Géneros de TMDB de cine (los de series se traducen abajo). `null` = cualquiera. */
function generosPara(ganas: Ganas, compania: Compania): number[] | null {
  if (compania === 'familia') {
    return {
      reirme: [35, 10751, 16],
      tension: [12, 14, 9648],
      emocionarme: [18, 10751, 16],
      liviano: [10751, 16, 35],
      sorprendeme: [10751, 16, 12, 14],
    }[ganas]
  }
  if (compania === 'pareja') {
    return {
      reirme: [35, 10749],
      tension: [53, 9648, 80],
      emocionarme: [10749, 18],
      liviano: [10749, 35],
      sorprendeme: null,
    }[ganas]
  }
  if (compania === 'amigos') {
    return {
      reirme: [35],
      tension: [27, 53, 28],
      emocionarme: [18, 10752],
      liviano: [35, 28, 12],
      sorprendeme: null,
    }[ganas]
  }
  return {
    reirme: [35],
    tension: [53, 27, 80, 9648],
    emocionarme: [18, 10749],
    liviano: [35, 16, 12, 10751],
    sorprendeme: null,
  }[ganas]
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

function aResultado(f: Fila, tipo: MediaType, plataforma: ResultadoQueVeoHoy['plataforma'], porque: string | null): ResultadoQueVeoHoy | null {
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
  }
}

/**
 * Si el título va con las respuestas.
 *
 *   · En familia tiene que ser del género familiar (las series infantiles
 *     cuentan), y nada de terror, suspenso, crimen ni guerra. Con "comedia" o
 *     "animación" se colaban cosas para adultos, como Rick y Morty.
 *   · Si no, cuenta el género principal (el primero que da TMDB): con
 *     "cualquiera de sus géneros", un drama de guerra entraba en "emocionarme".
 */
function encaja(f: Fila, tipo: MediaType, generos: number[] | null, compania: Compania): boolean {
  const propios = tipo === 'tv' ? comoCine(f.genre_ids ?? []) : (f.genre_ids ?? [])
  if (compania === 'familia') {
    if (propios.some(g => NO_EN_FAMILIA.has(g))) return false
    if (!propios.includes(10751)) return false
  }
  if (generos && !generos.includes(propios[0])) return false
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

  // Su plataforma donde está, o `null` si no está en ninguna (o no eligió).
  async function dondeEsta(tipo: MediaType, id: number): Promise<ResultadoQueVeoHoy['plataforma'] | undefined> {
    if (plataformas.size === 0) return null
    const ids = await tmdb.proveedores(tipo, id, opts.pais)
    const suya = ids.find(p => plataformas.has(p))
    return suya === undefined ? undefined : { id: suya, nombre: plataformas.get(suya) || '' }
  }

  // 1. De lo que calificó alto: las 12 más altas, en otro orden cada vez.
  const desde = mezclar(semillas.slice(0, 12)).slice(0, 8)
  const recos = await Promise.all(desde.map(s => tmdb.recomendaciones(s.tipo, s.id)))
  const candidatos: { f: Fila; tipo: MediaType; porque: string }[] = []
  desde.forEach((s, i) => {
    for (const f of recos[i]) {
      const k = clave(s.tipo, f.id)
      if (marcados.has(k) || !encaja(f, s.tipo, generos, opts.compania)) continue
      candidatos.push({ f, tipo: s.tipo, porque: s.titulo })
    }
  })
  // Las mejores primero, con un poco de azar para que no salga siempre la misma.
  candidatos.sort((a, b) => (b.f.vote_average ?? 0) + Math.random() - ((a.f.vote_average ?? 0) + Math.random()))
  for (let i = 0; i < candidatos.length && resultados.length < RESULTADOS; i += 6) {
    const tanda = candidatos.slice(i, i + 6).filter(c => !usados.has(clave(c.tipo, c.f.id)) && !porQue.has(c.porque))
    const dondes = await Promise.all(tanda.map(c => dondeEsta(c.tipo, c.f.id)))
    tanda.forEach((c, j) => {
      const donde = dondes[j]
      const k = clave(c.tipo, c.f.id)
      if (donde === undefined || resultados.length >= RESULTADOS || usados.has(k) || porQue.has(c.porque)) return
      const r = aResultado(c.f, c.tipo, donde, c.porque)
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
    const deCine: Record<string, string> = generos ? { with_genres: generos.join('|') } : {}
    const generosSerie = generos ? [...new Set(generos.map(g => CINE_A_SERIE[g]).filter(Boolean))] : null
    const pedidos: Promise<{ tipo: MediaType; filas: Fila[] }>[] = [
      tmdb.descubrir('movie', { ...base, ...deCine }).then(filas => ({ tipo: 'movie' as const, filas })),
    ]
    if (!generosSerie || generosSerie.length > 0) {
      pedidos.push(
        tmdb.descubrir('tv', { ...base, 'vote_count.gte': '200', ...(generosSerie ? { with_genres: generosSerie.join('|') } : {}) })
          .then(filas => ({ tipo: 'tv' as const, filas }))
      )
    }
    const pozo = mezclar((await Promise.all(pedidos)).flatMap(({ tipo, filas }) => filas.map(f => ({ tipo, f }))))
    for (let i = 0; i < pozo.length && resultados.length < RESULTADOS; i += 6) {
      const tanda = pozo.slice(i, i + 6).filter(c => {
        const k = clave(c.tipo, c.f.id)
        return !usados.has(k) && !marcados.has(k) && encaja(c.f, c.tipo, generos, opts.compania)
      })
      const dondes = await Promise.all(tanda.map(c => dondeEsta(c.tipo, c.f.id)))
      tanda.forEach((c, j) => {
        const donde = dondes[j]
        if (donde === undefined || resultados.length >= RESULTADOS) return
        const r = aResultado(c.f, c.tipo, donde, null)
        if (!r) return
        usados.add(clave(c.tipo, c.f.id))
        resultados.push(r)
      })
    }
  }

  return resultados
}
