// SERVER-ONLY — lee altas, perfiles, eventos y tokens con la service role.

import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteDeadTokens, sendExpoPushMessages, type ExpoMessage } from './expo-push'
import { envioApagado, faltaLaTabla } from './push-envios'
import { idiomaTmdb, idiomasDe, type Idioma } from './idioma'
import {
  enParalelo,
  LIMITE_NOTIFICACIONES,
  notificacionesDeLaSemana,
  plataformasDe,
} from './resumen-semanal'

/**
 * "Para esta noche": la push del día 1, para que la gente nueva vuelva al día
 * siguiente de registrarse. La corre `/api/cron/push-dia1` cada hora (la llama
 * pg_cron desde Supabase: el plan de Vercel sólo deja crons diarios, ver
 * supabase-push-dia1-2026-10.sql) y la prueba el botón del panel
 * (`/api/admin/dia1`).
 *
 * ── A quién ────────────────────────────────────────────────────────────────
 *
 * A cada cuenta nueva con la app y las notificaciones activadas, una sola vez:
 *
 *   · El día siguiente al de su alta, en la hora de su país
 *     (`profiles.country`; si no se sabe, Argentina), desde las 20. Si una
 *     corrida falla, la de las 21 o las 22 la alcanza; después de las 23 ya
 *     no, para no sonar de madrugada.
 *   · Sólo si ese día todavía no abrió la app ni la web (ningún evento suyo en
 *     `analytics_events` desde la medianoche de su país). Si ya volvió, no
 *     hace falta.
 *   · No si apagó "Tu resumen semanal", que es el interruptor de las
 *     recomendaciones armadas para cada persona, ni si en los últimos 7 días ya
 *     recibió 3 notificaciones (`notificacionesDeLaSemana`).
 *
 * ── Qué ────────────────────────────────────────────────────────────────────
 *
 * Una recomendación de TMDB de algo que calificó con 4 o más (casi siempre en
 * el onboarding), que esté hoy en una de sus plataformas en su país y que sea
 * conocida (500 votos o más, nota 6,5 o más). Nada que ya vio, calificó o
 * reseñó. "Para esta noche — Dune está en Max. Porque te gustó Interstellar".
 * Si nada encaja, no se manda.
 */

export const TITULO_DIA1 = 'Para esta noche'

const TITULO_POR_IDIOMA: Record<Idioma, string> = {
  es: TITULO_DIA1,
  en: 'For tonight',
}

const HORA_DESDE = 20
/** Hasta las 22:59: la corrida de las 23 ya no manda. */
const HORA_HASTA = 23

const DIA_MS = 24 * 60 * 60 * 1000
/** Altas a mirar: con 3 días alcanza para cualquier zona horaria. */
const ALTAS_DESDE_MS = 3 * DIA_MS

const NOTA_MINIMA = 4
/** Cuántos títulos calificados alto se usan como punto de partida. */
const SEMILLAS = 5
/** De cada uno, cuántas recomendaciones se confirman en qué plataforma están. */
const POR_SEMILLA = 6
const VOTOS_MINIMOS = 500
const NOTA_TMDB_MINIMA = 6.5

const TMDB = 'https://api.themoviedb.org/3'

type MediaType = 'movie' | 'tv'

const clave = (mediaType: string, id: number) => `${mediaType}:${id}`

// ── La hora de cada país ───────────────────────────────────────────────────

/**
 * La zona horaria de cada país del selector (`lib/countries.ts`). En los que
 * tienen varias, la de la ciudad más grande. El que no está, Argentina.
 */
const ZONA_POR_PAIS: Record<string, string> = {
  AR: 'America/Argentina/Buenos_Aires', BO: 'America/La_Paz', BR: 'America/Sao_Paulo',
  CL: 'America/Santiago', CO: 'America/Bogota', CR: 'America/Costa_Rica', CU: 'America/Havana',
  EC: 'America/Guayaquil', SV: 'America/El_Salvador', GT: 'America/Guatemala',
  HN: 'America/Tegucigalpa', MX: 'America/Mexico_City', NI: 'America/Managua', PA: 'America/Panama',
  PY: 'America/Asuncion', PE: 'America/Lima', DO: 'America/Santo_Domingo', UY: 'America/Montevideo',
  VE: 'America/Caracas', AG: 'America/Antigua', BS: 'America/Nassau', BB: 'America/Barbados',
  BZ: 'America/Belize', GF: 'America/Cayenne', GY: 'America/Guyana', TC: 'America/Grand_Turk',
  JM: 'America/Jamaica', LC: 'America/St_Lucia', TT: 'America/Port_of_Spain',
  US: 'America/New_York', CA: 'America/Toronto',
  GB: 'Europe/London', ES: 'Europe/Madrid', FR: 'Europe/Paris', DE: 'Europe/Berlin', IT: 'Europe/Rome',
  PT: 'Europe/Lisbon', NL: 'Europe/Amsterdam', BE: 'Europe/Brussels', CH: 'Europe/Zurich',
  AT: 'Europe/Vienna', SE: 'Europe/Stockholm', NO: 'Europe/Oslo', DK: 'Europe/Copenhagen',
  FI: 'Europe/Helsinki', PL: 'Europe/Warsaw', CZ: 'Europe/Prague', HU: 'Europe/Budapest',
  RO: 'Europe/Bucharest', GR: 'Europe/Athens', TR: 'Europe/Istanbul', RU: 'Europe/Moscow',
  AU: 'Australia/Sydney', NZ: 'Pacific/Auckland', JP: 'Asia/Tokyo', KR: 'Asia/Seoul',
  IN: 'Asia/Kolkata', ZA: 'Africa/Johannesburg', SA: 'Asia/Riyadh',
}

const PAIS_POR_DEFECTO = 'AR'

export function zonaDe(pais: string | null): string {
  return ZONA_POR_PAIS[pais ?? ''] ?? ZONA_POR_PAIS[PAIS_POR_DEFECTO]
}

/** El día (AAAA-MM-DD) y la hora en una zona. */
export function enZona(ms: number, zona: string): { dia: string; hora: number; desplazamientoMs: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(ms)).map(p => [p.type, p.value])
  )
  const comoUtc = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second)
  return {
    dia: `${partes.year}-${partes.month}-${partes.day}`,
    hora: +partes.hour,
    // Lo que hay que restarle a la hora local para tener UTC.
    desplazamientoMs: comoUtc - Math.floor(ms / 1000) * 1000,
  }
}

function diaSiguiente(dia: string): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + DIA_MS).toISOString().slice(0, 10)
}

/** La medianoche de hoy en esa zona, en milisegundos UTC. */
function medianoche(ms: number, zona: string): number {
  const { dia, desplazamientoMs } = enZona(ms, zona)
  return Date.parse(`${dia}T00:00:00Z`) - desplazamientoMs
}

// ── TMDB, con memoria por corrida ──────────────────────────────────────────

interface Recomendado {
  mediaType: MediaType
  id: number
  nombre: string
  votos: number
  nota: number
}

class Tmdb {
  private memoria = new Map<string, Promise<unknown>>()

  constructor(private key: string) {}

  private get<T>(ruta: string, params: Record<string, string> = {}): Promise<T | null> {
    const qs = new URLSearchParams({ api_key: this.key, ...params })
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

  async nombre(mediaType: MediaType, id: number, idioma: Idioma): Promise<string | null> {
    const json = await this.get<{ title?: string; name?: string }>(`/${mediaType}/${id}`, { language: idiomaTmdb(idioma) })
    return (mediaType === 'movie' ? json?.title : json?.name)?.trim() || null
  }

  async recomendaciones(mediaType: MediaType, id: number, idioma: Idioma): Promise<Recomendado[]> {
    type R = { id: number; title?: string; name?: string; vote_count?: number; vote_average?: number }
    const json = await this.get<{ results?: R[] }>(`/${mediaType}/${id}/recommendations`, { language: idiomaTmdb(idioma) })
    return (json?.results ?? []).map(r => ({
      mediaType,
      id: r.id,
      nombre: ((mediaType === 'movie' ? r.title : r.name) ?? '').trim(),
      votos: r.vote_count ?? 0,
      nota: r.vote_average ?? 0,
    }))
  }

  /** Los proveedores de un título en un país: suscripción, gratis o con publicidad. */
  async proveedores(mediaType: MediaType, id: number, pais: string): Promise<number[]> {
    type P = { provider_id: number }
    const json = await this.get<{ results?: Record<string, { flatrate?: P[]; free?: P[]; ads?: P[] }> }>(
      `/${mediaType}/${id}/watch/providers`
    )
    const region = json?.results?.[pais]
    return [...(region?.flatrate ?? []), ...(region?.free ?? []), ...(region?.ads ?? [])].map(p => p.provider_id)
  }
}

function nuevoTmdb(): Tmdb {
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!key) throw new Error('Falta NEXT_PUBLIC_TMDB_API_KEY.')
  return new Tmdb(key)
}

// ── La elección ────────────────────────────────────────────────────────────

export interface PerfilDia1 {
  id: string
  country: string | null
  favorite_platforms: string[] | null
  notification_preferences: unknown
}

export interface EleccionDia1 {
  mediaType: MediaType
  tmdbId: number
  nombre: string
  plataforma: string
  /** El título calificado alto que la trajo. */
  porNombre: string
  cuerpo: string
  url: string
}

export type SinEleccionDia1 = 'sin_plataformas' | 'sin_calificaciones' | 'nada_encaja'

function cuerpoDe(nombre: string, plataforma: string, porNombre: string, idioma: Idioma): string {
  return idioma === 'en'
    ? `${nombre} is on ${plataforma}. Because you liked ${porNombre}`
    : `${nombre} está en ${plataforma}. Porque te gustó ${porNombre}`
}

type Fila = { media_id: number; media_type: string }

async function filasDe<T>(admin: SupabaseClient, tabla: string, columnas: string, userId: string): Promise<T[]> {
  const { data, error } = await admin.from(tabla).select(columnas).eq('user_id', userId).limit(5000)
  if (error) throw new Error(`${tabla}: ${error.message}`)
  return (data ?? []) as T[]
}

async function elegirDia1(
  admin: SupabaseClient,
  tmdb: Tmdb,
  perfil: PerfilDia1,
  idioma: Idioma
): Promise<EleccionDia1 | SinEleccionDia1> {
  const plataformas = plataformasDe(perfil.favorite_platforms)
  if (plataformas.size === 0) return 'sin_plataformas'
  const pais = perfil.country && /^[A-Z]{2}$/.test(perfil.country) ? perfil.country : PAIS_POR_DEFECTO

  const [notas, vistas, resenas] = await Promise.all([
    filasDe<Fila & { rating: number | null; title: string | null; rated_at: string }>(
      admin, 'ratings', 'media_id, media_type, rating, title, rated_at', perfil.id),
    filasDe<Fila>(admin, 'watched', 'media_id, media_type', perfil.id),
    filasDe<Fila>(admin, 'reviews', 'media_id, media_type', perfil.id),
  ])
  const excluidos = new Set([...notas, ...vistas, ...resenas].map(f => clave(f.media_type, f.media_id)))

  // Lo más alto primero; a igual nota, lo primero que calificó (el onboarding).
  const semillas = notas
    .filter(n => (n.rating ?? 0) >= NOTA_MINIMA && (n.media_type === 'movie' || n.media_type === 'tv'))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.rated_at.localeCompare(b.rated_at))
    .slice(0, SEMILLAS)
  if (semillas.length === 0) return 'sin_calificaciones'

  for (const semilla of semillas) {
    const tipo = semilla.media_type as MediaType
    const candidatos = (await tmdb.recomendaciones(tipo, semilla.media_id, idioma))
      .filter(r => r.nombre && r.votos >= VOTOS_MINIMOS && r.nota >= NOTA_TMDB_MINIMA)
      .filter(r => !excluidos.has(clave(r.mediaType, r.id)))
      .slice(0, POR_SEMILLA)
    const proveedores = await Promise.all(candidatos.map(c => tmdb.proveedores(c.mediaType, c.id, pais)))
    for (let i = 0; i < candidatos.length; i++) {
      const id = proveedores[i].find(p => plataformas.has(p))
      if (id === undefined) continue
      const c = candidatos[i]
      const plataforma = plataformas.get(id) || 'tus plataformas'
      const porNombre = (idioma === 'es' ? semilla.title?.trim() : null)
        || (await tmdb.nombre(tipo, semilla.media_id, idioma))
        || semilla.title?.trim()
        || ''
      if (!porNombre) continue
      return {
        mediaType: c.mediaType,
        tmdbId: c.id,
        nombre: c.nombre,
        plataforma,
        porNombre,
        cuerpo: cuerpoDe(c.nombre, plataforma, porNombre, idioma),
        url: `/${c.mediaType}/${c.id}`,
      }
    }
  }
  return 'nada_encaja'
}

// ── Lo que comparten la corrida y la prueba ────────────────────────────────

async function tokensDe(admin: SupabaseClient, ids: string[]): Promise<Map<string, string[]>> {
  const porUsuario = new Map<string, Set<string>>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin
      .from('user_devices')
      .select('user_id, push_token')
      .in('user_id', ids.slice(i, i + 200))
      .limit(5000)
    if (error) throw new Error(`user_devices: ${error.message}`)
    for (const row of (data ?? []) as { user_id: string; push_token: string | null }[]) {
      if (!row.push_token) continue
      const set = porUsuario.get(row.user_id) ?? new Set<string>()
      set.add(row.push_token)
      porUsuario.set(row.user_id, set)
    }
  }
  return new Map([...porUsuario].map(([id, set]) => [id, [...set]]))
}

async function perfilesDe(admin: SupabaseClient, ids: string[]): Promise<PerfilDia1[]> {
  const perfiles: PerfilDia1[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, country, favorite_platforms, notification_preferences')
      .in('id', ids.slice(i, i + 200))
    if (error) throw new Error(`profiles: ${error.message}`)
    perfiles.push(...((data ?? []) as PerfilDia1[]))
  }
  return perfiles
}

/** Quiénes ya usaron la app o la web desde cada momento. */
async function activosDesde(admin: SupabaseClient, desde: Map<string, number>): Promise<Set<string>> {
  const activos = new Set<string>()
  const ids = [...desde.keys()]
  if (ids.length === 0) return activos
  const minimo = new Date(Math.min(...desde.values())).toISOString()
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await admin
      .from('analytics_events')
      .select('user_id, created_at')
      .in('user_id', ids.slice(i, i + 100))
      .eq('is_bot', false)
      .gte('created_at', minimo)
      .limit(10000)
    if (error) throw new Error(`analytics_events: ${error.message}`)
    for (const row of (data ?? []) as { user_id: string; created_at: string }[]) {
      if (Date.parse(row.created_at) >= (desde.get(row.user_id) ?? Infinity)) activos.add(row.user_id)
    }
  }
  return activos
}

// ── La corrida de cada hora ────────────────────────────────────────────────

export interface ResumenDia1 {
  envioId: number | null
  altas: number
  noEsLaHora: number
  sinAparato: number
  apagada: number
  yaEnviada: number
  yaVolvio: number
  porLimite: number
  sinPlataformas: number
  sinCalificaciones: number
  nadaEncaja: number
  errores: number
  personas: number
  destinatarios: number
  enviados: number
  fallidos: number
  tokensBorrados: number
}

export async function correrDia1(admin: SupabaseClient, ahora = Date.now()): Promise<ResumenDia1> {
  const resumen: ResumenDia1 = {
    envioId: null, altas: 0, noEsLaHora: 0, sinAparato: 0, apagada: 0, yaEnviada: 0, yaVolvio: 0,
    porLimite: 0, sinPlataformas: 0, sinCalificaciones: 0, nadaEncaja: 0, errores: 0,
    personas: 0, destinatarios: 0, enviados: 0, fallidos: 0, tokensBorrados: 0,
  }

  // Sin el SQL, no hay dónde anotar a quién se le mandó: no sale nada.
  const { error: tablaError } = await admin.from('push_dia1_enviados').select('user_id', { head: true }).limit(1)
  if (faltaLaTabla(tablaError)) throw new Error('Falta correr supabase-push-dia1-2026-10.sql.')

  const { data: altas, error: altasError } = await admin
    .from('usuarios_alta')
    .select('id, created_at')
    .gte('created_at', new Date(ahora - ALTAS_DESDE_MS).toISOString())
    .limit(5000)
  if (altasError) throw new Error(`usuarios_alta: ${altasError.message}`)
  resumen.altas = altas?.length ?? 0
  if (!altas?.length) return resumen

  const perfiles = new Map((await perfilesDe(admin, altas.map(a => a.id))).map(p => [p.id, p]))

  // El día siguiente al alta, entre las 20 y las 23 de su país.
  const enHora: { perfil: PerfilDia1; medianocheMs: number }[] = []
  for (const alta of altas as { id: string; created_at: string }[]) {
    const perfil = perfiles.get(alta.id)
    if (!perfil) continue
    const zona = zonaDe(perfil.country)
    const hoy = enZona(ahora, zona)
    const diaAlta = enZona(Date.parse(alta.created_at), zona).dia
    if (hoy.dia !== diaSiguiente(diaAlta) || hoy.hora < HORA_DESDE || hoy.hora >= HORA_HASTA) {
      resumen.noEsLaHora++
      continue
    }
    enHora.push({ perfil, medianocheMs: medianoche(ahora, zona) })
  }
  if (enHora.length === 0) return resumen

  const tokens = await tokensDe(admin, enHora.map(e => e.perfil.id))
  const conAparato = enHora.filter(e => (tokens.get(e.perfil.id)?.length ?? 0) > 0)
  resumen.sinAparato = enHora.length - conAparato.length

  const prendidos = conAparato.filter(e => !envioApagado(e.perfil.notification_preferences, 'dia1'))
  resumen.apagada = conAparato.length - prendidos.length

  const { data: enviadas, error: enviadasError } = await admin
    .from('push_dia1_enviados')
    .select('user_id')
    .in('user_id', prendidos.map(e => e.perfil.id))
  if (enviadasError) throw new Error(`push_dia1_enviados: ${enviadasError.message}`)
  const yaEnviadas = new Set(((enviadas ?? []) as { user_id: string }[]).map(r => r.user_id))
  const nuevos = prendidos.filter(e => !yaEnviadas.has(e.perfil.id))
  resumen.yaEnviada = prendidos.length - nuevos.length

  const activos = await activosDesde(admin, new Map(nuevos.map(e => [e.perfil.id, e.medianocheMs])))
  const sinVolver = nuevos.filter(e => !activos.has(e.perfil.id))
  resumen.yaVolvio = nuevos.length - sinVolver.length

  const recibidas = await notificacionesDeLaSemana(admin, sinVolver.map(e => e.perfil))
  const candidatos = sinVolver.filter(e => (recibidas.get(e.perfil.id) ?? 0) < LIMITE_NOTIFICACIONES)
  resumen.porLimite = sinVolver.length - candidatos.length
  if (candidatos.length === 0) return resumen

  const tmdb = nuevoTmdb()
  const idiomas = await idiomasDe(admin, candidatos.map(e => e.perfil.id))
  const elecciones = await enParalelo(candidatos, 4, async ({ perfil }) => {
    try {
      return { perfil, eleccion: await elegirDia1(admin, tmdb, perfil, idiomas.get(perfil.id) ?? 'es') }
    } catch (err) {
      console.error(`[dia1] ${perfil.id}:`, (err as Error).message)
      return { perfil, eleccion: null }
    }
  })

  const elegidos: { userId: string; eleccion: EleccionDia1 }[] = []
  for (const { perfil, eleccion } of elecciones) {
    if (eleccion === null) resumen.errores++
    else if (eleccion === 'sin_plataformas') resumen.sinPlataformas++
    else if (eleccion === 'sin_calificaciones') resumen.sinCalificaciones++
    else if (eleccion === 'nada_encaja') resumen.nadaEncaja++
    else elegidos.push({ userId: perfil.id, eleccion })
  }
  // Sin nadie a quien mandarle no queda fila: el cron corre cada hora.
  if (elegidos.length === 0) return resumen

  const { data: fila, error: insertError } = await admin
    .from('push_envios')
    .insert({ tipo: 'dia1', prueba: false, titulo: TITULO_DIA1, cuerpo: 'Armando…', url: '/', destinatarios: 0 })
    .select('id')
    .single()
  if (insertError || !fila) throw new Error(insertError?.message ?? 'No se pudo registrar el envío.')
  resumen.envioId = fila.id

  // Se reserva a cada persona antes de mandar: la clave única por persona hace
  // que nunca le llegue dos veces, aunque dos corridas se crucen.
  const { data: reservadas, error: reservaError } = await admin
    .from('push_dia1_enviados')
    .upsert(
      elegidos.map(({ userId, eleccion: e }) => ({
        user_id: userId,
        envio_id: fila.id,
        media_type: e.mediaType,
        tmdb_id: e.tmdbId,
        por_titulo: e.porNombre,
        plataforma: e.plataforma,
        cuerpo: e.cuerpo,
        aparatos: tokens.get(userId)?.length ?? 0,
      })),
      { onConflict: 'user_id', ignoreDuplicates: true }
    )
    .select('user_id')
  if (reservaError) {
    await admin.from('push_envios').delete().eq('id', fila.id)
    throw new Error(`push_dia1_enviados: ${reservaError.message}`)
  }
  const reservados = new Set(((reservadas ?? []) as { user_id: string }[]).map(r => r.user_id))

  const mensajes: ExpoMessage[] = []
  for (const { userId, eleccion: e } of elegidos) {
    if (!reservados.has(userId)) continue
    resumen.personas++
    for (const token of tokens.get(userId) ?? []) {
      mensajes.push({
        token,
        title: TITULO_POR_IDIOMA[idiomas.get(userId) ?? 'es'],
        body: e.cuerpo,
        // `entityId` es el envío: la app lo devuelve en `push_abierta`.
        data: { url: e.url, type: 'dia1', entityId: String(fila.id) },
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

  const { error: updateError } = await admin
    .from('push_envios')
    .update({
      cuerpo: `${resumen.personas} ${resumen.personas === 1 ? 'persona nueva' : 'personas nuevas'}`,
      destinatarios: mensajes.length,
      enviados: resultado.aceptados.length,
      fallidos: resultado.fallidos,
      tokens_borrados: borrados,
      tickets: resultado.aceptados.length > 0 ? resultado.aceptados : null,
      recibos_revisados_en: resultado.aceptados.length > 0 ? null : new Date().toISOString(),
    })
    .eq('id', fila.id)
  if (updateError) console.error('[dia1] no se pudo guardar el resultado:', updateError.message)

  return resumen
}

// ── La prueba del panel ────────────────────────────────────────────────────

export interface ResultadoPruebaDia1 {
  eleccion: EleccionDia1 | null
  sinEleccion: string | null
  /** Cosas que harían que a una cuenta nueva como la tuya no le llegue. */
  avisos: string[]
  envioId: number | null
  destinatarios: number
  enviados: number
  fallidos: number
}

/**
 * Arma la del día 1 de quien está en el panel y se la manda sólo a él, sin
 * mirar si es nuevo, la hora ni si ya abrió la app. No reserva nada.
 */
export async function probarDia1(admin: SupabaseClient, userId: string): Promise<ResultadoPruebaDia1> {
  const [perfil] = await perfilesDe(admin, [userId])
  if (!perfil) throw new Error('No se encontró tu perfil.')
  const tokens = (await tokensDe(admin, [userId])).get(userId) ?? []

  const avisos: string[] = []
  if (envioApagado(perfil.notification_preferences, 'dia1')) {
    avisos.push('Tenés apagado "Tu resumen semanal" en los ajustes de la app: si fueras nuevo, no te llegaría.')
  }
  const recibidas = (await notificacionesDeLaSemana(admin, [perfil])).get(userId) ?? 0
  if (recibidas >= LIMITE_NOTIFICACIONES) {
    avisos.push(`En los últimos 7 días recibiste ${recibidas} notificaciones: si fueras nuevo, se saltearía.`)
  }
  if (!perfil.country) avisos.push('Tu perfil no tiene país: se usaría la hora de Argentina.')

  const vacio = { avisos, envioId: null, destinatarios: 0, enviados: 0, fallidos: 0 }
  const idioma = (await idiomasDe(admin, [userId])).get(userId) ?? 'es'
  const eleccion = await elegirDia1(admin, nuevoTmdb(), perfil, idioma)
  if (eleccion === 'sin_plataformas') {
    return { ...vacio, eleccion: null, sinEleccion: 'No elegiste plataformas en tu perfil: no te tocaría ninguna.' }
  }
  if (eleccion === 'sin_calificaciones') {
    return { ...vacio, eleccion: null, sinEleccion: 'No calificaste nada con 4 o más: no hay de dónde sacar una recomendación.' }
  }
  if (eleccion === 'nada_encaja') {
    return {
      ...vacio,
      eleccion: null,
      sinEleccion: 'Ninguna recomendación de lo que calificaste alto está hoy en tus plataformas: no te llegaría nada.',
    }
  }
  if (tokens.length === 0) {
    return { ...vacio, eleccion, sinEleccion: 'Tu usuario no tiene ningún aparato con notificaciones activadas.' }
  }

  const { data: fila, error } = await admin
    .from('push_envios')
    .insert({
      tipo: 'dia1',
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
  if (error || !fila) {
    if (error?.code === '23514') throw new Error('Falta correr supabase-push-dia1-2026-10.sql.')
    throw new Error(error?.message ?? 'No se pudo registrar la prueba.')
  }

  const resultado = await sendExpoPushMessages(tokens.map(token => ({
    token,
    title: TITULO_POR_IDIOMA[idioma],
    body: eleccion.cuerpo,
    data: { url: eleccion.url, type: 'dia1', entityId: String(fila.id) },
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
