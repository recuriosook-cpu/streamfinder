// SERVER-ONLY — escribe `notifications` y manda push con la service role.

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildNotificationContent, type DatosAviso, type NotificationRow } from './notification-content'
import { idiomasDe } from './idioma'
import { sendPushToUser } from './send-push-notification'
import type { NotifType } from './notify'

/**
 * Los avisos automáticos del cron diario (`/api/cron/daily-notifications`):
 * cumpleaños, estrenos y proyectos nuevos de los famosos que cada uno sigue,
 * y lo que llegó a sus plataformas (de esos famosos o de su "Ver después").
 *
 * ── El tope ────────────────────────────────────────────────────────────────
 *
 * Como mucho UNA push por día y CUATRO por semana (7 días corridos) entre
 * todos estos tipos. Todas las novedades quedan en la bandeja; la push es una
 * sola: la más importante si hay una, o un resumen si hay varias.
 *
 * Por eso las filas se insertan con `sin_push = true` —el webhook
 * `/api/push/on-notification` las deja pasar sin mandar— y la push la manda
 * este módulo. La fila que la representa queda con `push_enviado_en`, que es
 * lo que cuenta el tope.
 *
 * Las preferencias las aplica la base (`notificaciones_respetan_preferencias`
 * descarta la fila), así que una novedad apagada nunca vuelve del insert.
 */

export type TipoAviso = 'actor_birthday' | 'new_release' | 'famoso_proyecto' | 'famoso_disponible' | 'watchlist_disponible'

const TIPOS: TipoAviso[] = ['actor_birthday', 'new_release', 'famoso_proyecto', 'famoso_disponible', 'watchlist_disponible']

/** Cuál va en la push cuando hay varias: lo que tiene fecha primero. */
const PRIORIDAD: Record<TipoAviso, number> = {
  actor_birthday: 0,
  watchlist_disponible: 1,
  famoso_disponible: 2,
  new_release: 3,
  famoso_proyecto: 4,
}

const POR_DIA = 1
const POR_SEMANA = 4
const DIA_MS = 24 * 60 * 60 * 1000

export interface Novedad {
  userId: string
  type: TipoAviso
  entityId: string
  entityType: 'person' | 'movie' | 'tv'
  /** La frase en castellano, para la campanita de la web. */
  entityTitle: string
  datos: DatosAviso | null
}

export interface ResultadoAvisos {
  /** Filas nuevas en `notifications` (sin las repetidas ni las apagadas). */
  insertadas: Record<TipoAviso, number>
  repetidas: number
  pushes: number
  resumidas: number
  porTope: number
}

/**
 * Lo que ya se avisó, para no repetir. Un cumpleaños se repite cada año (se
 * mira desde hace 300 días); lo demás, una sola vez por título.
 */
async function yaAvisadas(admin: SupabaseClient, novedades: Novedad[]): Promise<Set<string>> {
  const claves = new Set<string>()
  const usuarios = [...new Set(novedades.map(n => n.userId))]
  const desdeCumple = new Date(Date.now() - 300 * DIA_MS).toISOString()
  for (let i = 0; i < usuarios.length; i += 100) {
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await admin
        .from('notifications')
        .select('user_id, type, entity_id, created_at')
        .in('user_id', usuarios.slice(i, i + 100))
        .in('type', TIPOS)
        .range(desde, desde + 999)
      if (error) throw new Error(`notifications: ${error.message}`)
      for (const r of (data ?? []) as { user_id: string; type: string; entity_id: string | null; created_at: string }[]) {
        if (r.type === 'actor_birthday' && r.created_at < desdeCumple) continue
        claves.add(`${r.user_id}|${r.type}|${r.entity_id}`)
      }
      if (!data || data.length < 1000) break
    }
  }
  return claves
}

/** Pushes de estos tipos que ya salieron, por persona: en el último día y en la última semana. */
async function pushesRecientes(
  admin: SupabaseClient,
  usuarios: string[]
): Promise<Map<string, { dia: number; semana: number }>> {
  const ahora = Date.now()
  const desdeDia = new Date(ahora - DIA_MS).toISOString()
  const cuenta = new Map<string, { dia: number; semana: number }>()
  for (let i = 0; i < usuarios.length; i += 100) {
    const { data, error } = await admin
      .from('notifications')
      .select('user_id, push_enviado_en')
      .in('user_id', usuarios.slice(i, i + 100))
      .gte('push_enviado_en', new Date(ahora - 7 * DIA_MS).toISOString())
      .limit(5000)
    if (error) throw new Error(`notifications: ${error.message}`)
    for (const r of (data ?? []) as { user_id: string; push_enviado_en: string }[]) {
      const c = cuenta.get(r.user_id) ?? { dia: 0, semana: 0 }
      c.semana++
      if (r.push_enviado_en >= desdeDia) c.dia++
      cuenta.set(r.user_id, c)
    }
  }
  return cuenta
}

type Insertada = NotificationRow & { id: string; user_id: string; type: TipoAviso }

export async function insertarYAvisar(admin: SupabaseClient, novedades: Novedad[]): Promise<ResultadoAvisos> {
  const resultado: ResultadoAvisos = {
    insertadas: { actor_birthday: 0, new_release: 0, famoso_proyecto: 0, famoso_disponible: 0, watchlist_disponible: 0 },
    repetidas: 0, pushes: 0, resumidas: 0, porTope: 0,
  }
  if (novedades.length === 0) return resultado

  // Sin repetir: ni lo ya avisado otro día, ni dos veces lo mismo hoy (un
  // famoso que actúa y dirige, dos famosos en la misma película).
  const avisadas = await yaAvisadas(admin, novedades)
  const nuevas: Novedad[] = []
  for (const n of novedades) {
    const clave = `${n.userId}|${n.type}|${n.entityId}`
    if (avisadas.has(clave)) { resultado.repetidas++; continue }
    avisadas.add(clave)
    nuevas.push(n)
  }

  const insertadas: Insertada[] = []
  for (let i = 0; i < nuevas.length; i += 500) {
    const { data, error } = await admin
      .from('notifications')
      .insert(nuevas.slice(i, i + 500).map(n => ({
        user_id: n.userId,
        type: n.type,
        entity_id: n.entityId,
        entity_type: n.entityType,
        entity_title: n.entityTitle,
        datos: n.datos,
        sin_push: true,
        read: false,
      })))
      .select('id, user_id, type, entity_id, entity_type, entity_title, datos')
    if (error) throw new Error(`notifications insert: ${error.message}`)
    insertadas.push(...((data ?? []) as Insertada[]))
  }
  for (const f of insertadas) resultado.insertadas[f.type]++

  // La push: una por persona y día, como mucho.
  const porUsuario = new Map<string, Insertada[]>()
  for (const f of insertadas) porUsuario.set(f.user_id, [...(porUsuario.get(f.user_id) ?? []), f])
  const usuarios = [...porUsuario.keys()]
  if (usuarios.length === 0) return resultado

  const [recientes, idiomas] = await Promise.all([pushesRecientes(admin, usuarios), idiomasDe(admin, usuarios)])

  for (const [userId, filas] of porUsuario) {
    const c = recientes.get(userId) ?? { dia: 0, semana: 0 }
    if (c.dia >= POR_DIA || c.semana >= POR_SEMANA) { resultado.porTope++; continue }

    filas.sort((a, b) => PRIORIDAD[a.type] - PRIORIDAD[b.type])
    const principal = filas[0]
    const idioma = idiomas.get(userId) ?? 'es'
    const texto = await buildNotificationContent(admin, principal.type, principal, idioma)
    if (!texto) continue

    const otras = filas.length - 1
    const push = otras === 0
      ? texto
      : {
          title: idioma === 'en' ? `You have ${filas.length} updates` : `Tenés ${filas.length} novedades`,
          body: idioma === 'en'
            ? `${texto.title} and ${otras} more`
            : `${texto.title} y ${otras} más`,
          url: texto.url,
        }

    // Se marca antes de mandar: si dos corridas se cruzan, el tope ya cuenta.
    const { error } = await admin
      .from('notifications')
      .update({ push_enviado_en: new Date().toISOString() })
      .eq('id', principal.id)
    if (error) { console.error('[avisos] no se pudo marcar la push:', error.message); continue }

    await sendPushToUser(
      userId,
      { title: push.title, body: push.body, url: push.url, tag: principal.type },
      { type: principal.type as NotifType, entityId: principal.entity_id ?? undefined }
    )
    resultado.pushes++
    if (otras > 0) resultado.resumidas++
  }

  return resultado
}
