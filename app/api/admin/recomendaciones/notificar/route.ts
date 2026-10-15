import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminClient } from '@/lib/service-role'
import {
  deleteDeadTokens,
  getExpoReceipts,
  sendExpoPushToTokens,
  type ExpoTicketRef,
} from '@/lib/expo-push'

/**
 * /api/admin/recomendaciones/notificar — "Ferlage te recomienda ver".
 *
 *   GET                                  cuántos aparatos, cuántos envíos van
 *                                        esta semana y el historial
 *   POST { recomendacionId, prueba }     manda una recomendación
 *
 * Un envío va a todos los tokens de `user_devices`: los de la app con el
 * permiso de notificaciones aceptado. Con `prueba: true` va sólo a los
 * aparatos de quien está logueado en el panel (Ferlageok), y no cuenta para el
 * límite.
 *
 * ── El límite ──────────────────────────────────────────────────────────────
 *
 * Tres envíos reales en los últimos 7 días, corridos y no por semana de
 * calendario: con semana de calendario se podrían mandar tres el domingo y
 * tres el lunes. Lo hace cumplir el servidor, no el panel: el panel sólo lo
 * muestra. La fila se inserta ANTES de mandar y se vuelve a contar, así dos
 * clics seguidos no pasan los dos.
 *
 * ── Los fallos y los tokens muertos ────────────────────────────────────────
 *
 * Al mandar, Expo devuelve un ticket por token. Que llegó lo dice el recibo,
 * minutos después, y ahí suele aparecer `DeviceNotRegistered` (desinstaló).
 * El GET revisa los recibos de los envíos de más de 15 minutos que no se
 * revisaron, borra esos tokens de `user_devices` y suma los fallos.
 *
 * ── Las aperturas ──────────────────────────────────────────────────────────
 *
 * La app manda `push_abierta` con `tipo` y `envio` al tocar la notificación
 * (desde la versión que trae el evento: las anteriores la abren igual pero no
 * lo cuentan). El historial cuenta instalaciones distintas por envío.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const TITULO = 'Ferlage te recomienda ver'
const LIMITE_SEMANAL = 3
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000

/** Antes de esto Expo puede no tener los recibos. Después de 24 h los borra. */
const RECIBOS_DESDE_MS = 15 * 60 * 1000
const RECIBOS_HASTA_MS = 24 * 60 * 60 * 1000

const HISTORIAL = 30

/** Mismo criterio de admin que el resto de `/api/admin`. */
async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options) } catch { /**/ } }) },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  return profile?.username === 'Ferlageok' ? user : null
}

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface EnvioPush {
  id: number
  prueba: boolean
  cuerpo: string
  mediaType: 'movie' | 'tv'
  tmdbId: number
  creadoEn: string
  destinatarios: number
  /** Aceptados por Expo, menos los que el recibo dio por fallidos. */
  enviados: number | null
  fallidos: number | null
  tokensBorrados: number
  /** Instalaciones que la abrieron. Sólo cuentan las versiones de la app con el evento. */
  abiertas: number
  /** Todavía no se revisaron los recibos: los fallos pueden subir. */
  recibosPendientes: boolean
}

export interface NotificarEstado {
  /** `false` si falta correr `supabase-push-envios-2026-10.sql`. */
  disponible: boolean
  /** Tokens en `user_devices`: a cuántos aparatos llegaría. */
  aparatos: number
  /** Los de quien está en el panel, para la prueba. */
  aparatosPrueba: number
  limite: number
  usadosSemana: number
  /** Cuándo se libera el próximo envío, si ya se usaron los tres. */
  proximoLibre: string | null
  historial: EnvioPush[]
}

interface FilaEnvio {
  id: number
  prueba: boolean
  cuerpo: string
  media_type: 'movie' | 'tv'
  tmdb_id: number
  creado_en: string
  destinatarios: number
  enviados: number | null
  fallidos: number | null
  tokens_borrados: number
  tickets: ExpoTicketRef[] | null
  recibos_revisados_en: string | null
}

// ── Ayudas ─────────────────────────────────────────────────────────────────

function faltaLaTabla(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const msg = (error.message ?? '').toLowerCase()
  return msg.includes('does not exist') || msg.includes('could not find the table')
}

/** Los envíos reales de los últimos 7 días, del más viejo al más nuevo. */
async function enviosDeLaSemana(admin: SupabaseClient) {
  return admin
    .from('push_envios')
    .select('id, creado_en')
    .eq('prueba', false)
    .gte('creado_en', new Date(Date.now() - SEMANA_MS).toISOString())
    .order('creado_en', { ascending: true })
}

function proximoLibre(semana: { creado_en: string }[]): string | null {
  if (semana.length < LIMITE_SEMANAL) return null
  // Se libera cuando el más viejo de los que cuentan cumple 7 días.
  const masViejo = semana[semana.length - LIMITE_SEMANAL]
  return new Date(new Date(masViejo.creado_en).getTime() + SEMANA_MS).toISOString()
}

/** Todos los tokens, sin repetir. */
async function todosLosTokens(admin: SupabaseClient, userId?: string): Promise<string[]> {
  const tokens = new Set<string>()
  for (let desde = 0; ; desde += 1000) {
    let q = admin.from('user_devices').select('push_token').range(desde, desde + 999)
    if (userId) q = q.eq('user_id', userId)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as { push_token: string | null }[]) {
      if (row.push_token) tokens.add(row.push_token)
    }
    if (!data || data.length < 1000) break
  }
  return [...tokens]
}

async function contarAparatos(admin: SupabaseClient, userId?: string): Promise<number> {
  let q = admin.from('user_devices').select('push_token', { count: 'exact', head: true })
  if (userId) q = q.eq('user_id', userId)
  const { count } = await q
  return count ?? 0
}

/** El nombre en castellano, como en la ficha. */
async function nombreDe(mediaType: 'movie' | 'tv', tmdbId: number): Promise<string | null> {
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!key) return null
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${key}&language=es-AR`,
      { cache: 'no-store' }
    )
    if (!res.ok) return null
    const json = (await res.json()) as { title?: string; name?: string }
    return (mediaType === 'movie' ? json.title : json.name)?.trim() || null
  } catch {
    return null
  }
}

/**
 * Revisa los recibos de los envíos que ya los tienen listos. Nunca tira: si
 * Expo no contesta, se reintenta en la próxima carga del panel.
 */
async function revisarRecibos(admin: SupabaseClient, filas: FilaEnvio[]): Promise<void> {
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
      console.error('[notificar] no se pudo guardar la revisión de recibos:', error.message)
      continue
    }
    Object.assign(fila, cambios)
  }
}

/** Instalaciones distintas que abrieron cada envío. */
async function aperturas(admin: SupabaseClient, filas: FilaEnvio[]): Promise<Map<number, number>> {
  const porEnvio = new Map<number, Set<string>>()
  if (filas.length === 0) return new Map()
  const desde = filas.reduce((min, f) => (f.creado_en < min ? f.creado_en : min), filas[0].creado_en)

  const { data, error } = await admin
    .from('analytics_events')
    .select('anon_id, props')
    .eq('name', 'push_abierta')
    .eq('props->>tipo', 'recomendacion')
    .gte('created_at', desde)
    .limit(10000)
  if (error) {
    console.error('[notificar] aperturas:', error.message)
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

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/recomendaciones/notificar')
  if (failure) return failure

  const [historialRes, semanaRes, aparatos, aparatosPrueba] = await Promise.all([
    admin
      .from('push_envios')
      .select('id, prueba, cuerpo, media_type, tmdb_id, creado_en, destinatarios, enviados, fallidos, tokens_borrados, tickets, recibos_revisados_en')
      .order('creado_en', { ascending: false })
      .limit(HISTORIAL),
    enviosDeLaSemana(admin),
    contarAparatos(admin),
    contarAparatos(admin, user.id),
  ])

  if (faltaLaTabla(historialRes.error)) {
    const vacio: NotificarEstado = {
      disponible: false, aparatos, aparatosPrueba, limite: LIMITE_SEMANAL,
      usadosSemana: 0, proximoLibre: null, historial: [],
    }
    return NextResponse.json(vacio)
  }
  if (historialRes.error) {
    return NextResponse.json({ message: historialRes.error.message }, { status: 500 })
  }

  const filas = (historialRes.data ?? []) as FilaEnvio[]
  await revisarRecibos(admin, filas)
  const abiertas = await aperturas(admin, filas)
  const semana = (semanaRes.data ?? []) as { creado_en: string }[]

  const estado: NotificarEstado = {
    disponible: true,
    aparatos,
    aparatosPrueba,
    limite: LIMITE_SEMANAL,
    usadosSemana: semana.length,
    proximoLibre: proximoLibre(semana),
    historial: filas.map(f => ({
      id: f.id,
      prueba: f.prueba,
      cuerpo: f.cuerpo,
      mediaType: f.media_type,
      tmdbId: f.tmdb_id,
      creadoEn: f.creado_en,
      destinatarios: f.destinatarios,
      enviados: f.enviados,
      fallidos: f.fallidos,
      tokensBorrados: f.tokens_borrados,
      abiertas: abiertas.get(f.id) ?? 0,
      recibosPendientes: !f.recibos_revisados_en && !!f.tickets,
    })),
  }
  return NextResponse.json(estado)
}

// ── POST ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { admin, failure } = requireAdminClient('admin/recomendaciones/notificar')
  if (failure) return failure

  const body = (await req.json().catch(() => ({}))) as { recomendacionId?: unknown; prueba?: unknown }
  const recomendacionId = Number(body.recomendacionId)
  const prueba = body.prueba === true
  if (!Number.isInteger(recomendacionId)) {
    return NextResponse.json({ message: 'Falta la recomendación.' }, { status: 400 })
  }

  const { data: rec, error: recError } = await admin
    .from('creator_recommendations')
    .select('id, media_type, tmdb_id')
    .eq('id', recomendacionId)
    .maybeSingle()
  if (recError) return NextResponse.json({ message: recError.message }, { status: 500 })
  if (!rec) return NextResponse.json({ message: 'Esa recomendación ya no existe.' }, { status: 404 })

  const mediaType = rec.media_type as 'movie' | 'tv'
  const tmdbId = rec.tmdb_id as number
  const cuerpo = await nombreDe(mediaType, tmdbId)
  if (!cuerpo) {
    return NextResponse.json({ message: 'No se pudo leer el nombre del título en TMDB. Probá de nuevo.' }, { status: 502 })
  }

  if (!prueba) {
    const { data: semana, error } = await enviosDeLaSemana(admin)
    if (faltaLaTabla(error)) {
      return NextResponse.json({ message: 'Falta correr supabase-push-envios-2026-10.sql.' }, { status: 409 })
    }
    if ((semana ?? []).length >= LIMITE_SEMANAL) {
      return NextResponse.json({
        message: `Ya mandaste ${LIMITE_SEMANAL} esta semana.`,
        proximoLibre: proximoLibre(semana ?? []),
      }, { status: 429 })
    }
  }

  let tokens: string[]
  try {
    tokens = await todosLosTokens(admin, prueba ? user.id : undefined)
  } catch (err) {
    return NextResponse.json({ message: (err as Error).message }, { status: 500 })
  }
  if (tokens.length === 0) {
    return NextResponse.json({
      message: prueba
        ? 'Tu usuario no tiene ningún aparato con notificaciones activadas.'
        : 'No hay aparatos con notificaciones activadas.',
    }, { status: 400 })
  }

  const url = `/${mediaType}/${tmdbId}`

  // La fila va antes del envío: reserva el lugar en el límite.
  const { data: fila, error: insertError } = await admin
    .from('push_envios')
    .insert({
      prueba,
      recomendacion_id: rec.id,
      media_type: mediaType,
      tmdb_id: tmdbId,
      titulo: TITULO,
      cuerpo,
      url,
      destinatarios: tokens.length,
      enviado_por: user.id,
    })
    .select('id, creado_en')
    .single()
  if (faltaLaTabla(insertError)) {
    return NextResponse.json({ message: 'Falta correr supabase-push-envios-2026-10.sql.' }, { status: 409 })
  }
  if (insertError || !fila) {
    return NextResponse.json({ message: insertError?.message ?? 'No se pudo registrar el envío.' }, { status: 500 })
  }

  if (!prueba) {
    // Segunda cuenta, ya con la fila adentro: si dos envíos entraron a la vez,
    // el que quedó cuarto se borra y no sale.
    const { data: semana } = await enviosDeLaSemana(admin)
    const puesto = (semana ?? []).findIndex(s => s.id === fila.id)
    if (puesto >= LIMITE_SEMANAL) {
      await admin.from('push_envios').delete().eq('id', fila.id)
      return NextResponse.json({
        message: `Ya mandaste ${LIMITE_SEMANAL} esta semana.`,
        proximoLibre: proximoLibre((semana ?? []).filter(s => s.id !== fila.id)),
      }, { status: 429 })
    }
  }

  const resultado = await sendExpoPushToTokens(
    tokens,
    { title: TITULO, body: cuerpo },
    // `entityId` es el envío: la app lo devuelve en `push_abierta`.
    { url, type: 'recomendacion', entityId: String(fila.id) }
  )
  const borrados = await deleteDeadTokens(admin, resultado.muertos)

  const { error: updateError } = await admin
    .from('push_envios')
    .update({
      enviados: resultado.aceptados.length,
      fallidos: resultado.fallidos,
      tokens_borrados: borrados,
      tickets: resultado.aceptados.length > 0 ? resultado.aceptados : null,
      recibos_revisados_en: resultado.aceptados.length > 0 ? null : new Date().toISOString(),
    })
    .eq('id', fila.id)
  if (updateError) console.error('[notificar] no se pudo guardar el resultado:', updateError.message)

  console.log(`[notificar] envío ${fila.id}${prueba ? ' (prueba)' : ''}: ${resultado.aceptados.length} aceptados, ${resultado.fallidos} fallidos, ${borrados} tokens borrados`)

  return NextResponse.json({
    id: fila.id,
    prueba,
    cuerpo,
    destinatarios: tokens.length,
    enviados: resultado.aceptados.length,
    fallidos: resultado.fallidos,
    tokensBorrados: borrados,
  })
}
