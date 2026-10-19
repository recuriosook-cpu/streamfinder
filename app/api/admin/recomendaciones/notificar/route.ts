import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminClient } from '@/lib/service-role'
import { deleteDeadTokens, sendExpoPushMessages, type ExpoMessage } from '@/lib/expo-push'
import { idiomaTmdb, idiomasDe, type Idioma } from '@/lib/idioma'
import {
  COLUMNAS_FILA,
  aperturas,
  faltaLaTabla,
  revisarRecibos,
  usuariosConEnvioApagado,
  type FilaEnvio,
} from '@/lib/push-envios'

/**
 * /api/admin/recomendaciones/notificar — "Ferlage te recomienda ver".
 *
 *   GET                                  cuántos aparatos, cuántos envíos van
 *                                        esta semana y el historial
 *   POST { recomendacionId, prueba }     manda una recomendación
 *
 * Cada aparato la recibe en el idioma de su dueño (`profiles.idioma`, ver
 * `lib/idioma.ts`): el título y el nombre de la película o serie. El historial
 * del panel muestra el de castellano.
 *
 * Un envío va a todos los tokens de `user_devices`: los de la app con el
 * permiso de notificaciones aceptado, menos los de quien apagó "Recomendaciones
 * de Ferlage" en los ajustes de la app. Con `prueba: true` va sólo a los
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
const TITULO_POR_IDIOMA: Record<Idioma, string> = {
  es: TITULO,
  en: 'Ferlage recommends',
}
const LIMITE_SEMANAL = 3
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000

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
  /** Tokens en `user_devices` de quien no apagó el envío: a cuántos aparatos llegaría. */
  aparatos: number
  /** Los de quien está en el panel, para la prueba. */
  aparatosPrueba: number
  limite: number
  usadosSemana: number
  /** Cuándo se libera el próximo envío, si ya se usaron los tres. */
  proximoLibre: string | null
  historial: EnvioPush[]
}

// ── Ayudas ─────────────────────────────────────────────────────────────────

/** Los envíos reales de los últimos 7 días, del más viejo al más nuevo. */
async function enviosDeLaSemana(admin: SupabaseClient) {
  return admin
    .from('push_envios')
    .select('id, creado_en')
    .eq('tipo', 'recomendacion')
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

/**
 * Los tokens a los que va un envío, sin repetir. Sin `userId` son todos menos
 * los de quien apagó "Recomendaciones de Ferlage"; con `userId` (la prueba),
 * los de esa persona, haya apagado o no.
 */
async function todosLosTokens(admin: SupabaseClient, userId?: string): Promise<{ token: string; userId: string }[]> {
  const apagados = userId ? new Set<string>() : await usuariosConEnvioApagado(admin, 'recomendacion')
  const tokens = new Map<string, string>()
  for (let desde = 0; ; desde += 1000) {
    let q = admin.from('user_devices').select('user_id, push_token').range(desde, desde + 999)
    if (userId) q = q.eq('user_id', userId)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as { user_id: string; push_token: string | null }[]) {
      if (row.push_token && !apagados.has(row.user_id)) tokens.set(row.push_token, row.user_id)
    }
    if (!data || data.length < 1000) break
  }
  return [...tokens].map(([token, userId]) => ({ token, userId }))
}

async function contarAparatos(admin: SupabaseClient, userId?: string): Promise<number> {
  try {
    return (await todosLosTokens(admin, userId)).length
  } catch {
    return 0
  }
}

/** El nombre como en la ficha, en castellano o en inglés. */
async function nombreDe(mediaType: 'movie' | 'tv', tmdbId: number, idioma: Idioma = 'es'): Promise<string | null> {
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!key) return null
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${key}&language=${idiomaTmdb(idioma)}`,
      { cache: 'no-store' }
    )
    if (!res.ok) return null
    const json = (await res.json()) as { title?: string; name?: string }
    return (mediaType === 'movie' ? json.title : json.name)?.trim() || null
  } catch {
    return null
  }
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
      .select(COLUMNAS_FILA)
      .eq('tipo', 'recomendacion')
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

  const filas = (historialRes.data ?? []) as unknown as FilaEnvio[]
  await revisarRecibos(admin, filas)
  const abiertas = await aperturas(admin, 'recomendacion', filas)
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
      mediaType: f.media_type ?? 'movie',
      tmdbId: f.tmdb_id ?? 0,
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

  let tokens: { token: string; userId: string }[]
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
      tipo: 'recomendacion',
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

  // En inglés para quien tiene la app en inglés. Si TMDB no da el nombre en
  // inglés, va el de castellano: mejor eso que no mandar.
  const idiomas = await idiomasDe(admin, [...new Set(tokens.map(t => t.userId))])
  const hayIngles = tokens.some(t => idiomas.get(t.userId) === 'en')
  const cuerpoEn = hayIngles ? ((await nombreDe(mediaType, tmdbId, 'en')) ?? cuerpo) : cuerpo

  // `entityId` es el envío: la app lo devuelve en `push_abierta`.
  const data = { url, type: 'recomendacion', entityId: String(fila.id) }
  const mensajes: ExpoMessage[] = tokens.map(({ token, userId }) => {
    const idioma = idiomas.get(userId) ?? 'es'
    return { token, title: TITULO_POR_IDIOMA[idioma], body: idioma === 'en' ? cuerpoEn : cuerpo, data }
  })
  const resultado = await sendExpoPushMessages(mensajes)
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
