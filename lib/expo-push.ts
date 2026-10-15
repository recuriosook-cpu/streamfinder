// SERVER-ONLY — habla con la Expo Push API con la service role key.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from './service-role'
import type { PushPayload } from './send-push-notification'

/**
 * Push a la app nativa, vía Expo.
 *
 * Va aparte del push web (`send-push-notification.ts`) porque el transporte no
 * tiene nada que ver: el web usa VAPID y habla directo con el endpoint que le
 * dio el navegador; Expo recibe un token y se encarga de FCM/APNs. Lo que sí
 * comparten es el texto, que arma `buildNotificationContent`
 * (`lib/notification-content.ts`) una sola vez para los dos.
 *
 * Dos usos: `sendExpoPushToUser`, una notificación a los aparatos de una
 * persona, y `sendExpoPushToTokens`, el envío masivo del panel de
 * recomendaciones. Los dos mandan por el mismo camino.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'

/** La API acepta hasta 100 mensajes por request. */
const BATCH_SIZE = 100

/** Y hasta 1000 ids por pedido de recibos. */
const RECEIPTS_BATCH = 1000

/** Expo devuelve esto cuando el usuario desinstaló o revocó las notifs. */
const DEVICE_NOT_REGISTERED = 'DeviceNotRegistered'

type ExpoTicket = {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

/**
 * Lo que viaja en `data` y lee la app al tocar la notificación.
 *
 * `url` es la ruta de glynbox.com —la misma que usa el push web, armada por
 * `buildNotificationContent`— y la app la resuelve con su parser de deep links. Así no hay un
 * segundo mapeo de tipo → pantalla que mantener del lado del servidor.
 */
export type ExpoPushData = {
  url: string
  type: string
  entityId?: string
}

type DeviceRow = { push_token: string }

/** Un mensaje que Expo aceptó: con su id se pide el recibo después. */
export type ExpoTicketRef = { id: string; token: string }

export type ExpoSendResult = {
  /** Aceptados por Expo. Que lleguen se confirma en el recibo. */
  aceptados: ExpoTicketRef[]
  /** Rechazados al mandar, incluidos los tokens muertos. */
  fallidos: number
  /** Tokens que Expo dio por desinstalados. Hay que borrarlos. */
  muertos: string[]
}

/**
 * Manda el mismo mensaje a una lista de tokens, de a 100.
 *
 * Nunca tira. Un lote que falla entero (red, 5xx) cuenta todos sus tokens como
 * fallidos y se sigue con el siguiente.
 */
export async function sendExpoPushToTokens(
  tokens: string[],
  content: { title: string; body: string },
  data: ExpoPushData
): Promise<ExpoSendResult> {
  const result: ExpoSendResult = { aceptados: [], fallidos: 0, muertos: [] }

  for (let from = 0; from < tokens.length; from += BATCH_SIZE) {
    const batch = tokens.slice(from, from + BATCH_SIZE)

    const messages = batch.map((token) => ({
      to: token,
      title: content.title,
      body: content.body,
      data,
      sound: 'default' as const,
      // Agrupa en la bandeja igual que el `tag` del push web.
      channelId: 'default',
    }))

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      })

      if (!response.ok) {
        console.error('[expo-push] HTTP', response.status, await response.text())
        result.fallidos += batch.length
        continue
      }

      const json = (await response.json()) as { data?: ExpoTicket[] }
      const tickets = json.data ?? []

      // Los tickets vuelven en el mismo orden que los mensajes.
      batch.forEach((token, i) => {
        const ticket = tickets[i]
        if (ticket?.status === 'ok' && ticket.id) {
          result.aceptados.push({ id: ticket.id, token })
          return
        }
        result.fallidos += 1
        if (ticket?.details?.error === DEVICE_NOT_REGISTERED) result.muertos.push(token)
        else console.error('[expo-push] ticket con error:', ticket?.message ?? 'sin ticket')
      })
    } catch (err: unknown) {
      console.error('[expo-push] fallo de red:', (err as Error).message)
      result.fallidos += batch.length
    }
  }

  return result
}

/**
 * Los recibos de mensajes ya aceptados: si llegaron, y si no por qué.
 *
 * Expo los tiene listos unos minutos después del envío y los guarda 24 horas.
 * Es en el recibo donde casi siempre aparece `DeviceNotRegistered`: al mandar,
 * Expo todavía no sabe que la app se desinstaló.
 *
 * Devuelve `null` si no se pudo consultar, para que quien llama lo reintente
 * más tarde en vez de dar el envío por revisado.
 */
export async function getExpoReceipts(
  tickets: ExpoTicketRef[]
): Promise<{ fallidos: number; muertos: string[]; pendientes: number } | null> {
  const tokenDe = new Map(tickets.map((t) => [t.id, t.token]))
  const ids = [...tokenDe.keys()]
  let fallidos = 0
  let pendientes = 0
  const muertos: string[] = []

  for (let from = 0; from < ids.length; from += RECEIPTS_BATCH) {
    const batch = ids.slice(from, from + RECEIPTS_BATCH)
    try {
      const response = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: batch }),
      })
      if (!response.ok) {
        console.error('[expo-push] recibos HTTP', response.status)
        return null
      }
      const json = (await response.json()) as {
        data?: Record<string, { status: 'ok' | 'error'; details?: { error?: string } }>
      }
      const receipts = json.data ?? {}
      for (const id of batch) {
        const receipt = receipts[id]
        // Sin recibo todavía: Expo no terminó de entregarlo.
        if (!receipt) { pendientes += 1; continue }
        if (receipt.status === 'ok') continue
        fallidos += 1
        if (receipt.details?.error === DEVICE_NOT_REGISTERED) muertos.push(tokenDe.get(id)!)
      }
    } catch (err: unknown) {
      console.error('[expo-push] recibos, fallo de red:', (err as Error).message)
      return null
    }
  }

  return { fallidos, muertos, pendientes }
}

/**
 * Borra de `user_devices` los tokens de gente que desinstaló.
 *
 * Un token muerto no revive: si no se borra, cada notificación futura paga el
 * viaje a Expo para que lo rechace de nuevo. Devuelve cuántos borró.
 */
export async function deleteDeadTokens(admin: SupabaseClient, tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0
  const { error, count } = await admin
    .from('user_devices')
    .delete({ count: 'exact' })
    .in('push_token', tokens)

  if (error) {
    console.error('[expo-push] no se pudieron borrar tokens muertos:', error.message)
    return 0
  }
  console.log(`[expo-push] ${count ?? tokens.length} token(s) muerto(s) borrado(s)`)
  return count ?? tokens.length
}

/**
 * Manda a todos los dispositivos del usuario y limpia los tokens muertos.
 *
 * Nunca tira: es una notificación, no puede voltear la acción que la disparó
 * (seguir a alguien, comentar). Los errores se loguean y listo.
 */
export async function sendExpoPushToUser(
  userId: string,
  payload: PushPayload,
  data: ExpoPushData
): Promise<void> {
  let admin
  try {
    admin = getAdminClient()
  } catch (err: unknown) {
    console.warn('[expo-push] sin service role:', (err as Error).message)
    return
  }

  const { data: devices, error } = await admin
    .from('user_devices')
    .select('push_token')
    .eq('user_id', userId)

  if (error) {
    console.error('[expo-push] error leyendo user_devices:', error.message)
    return
  }

  const tokens = (devices ?? []).map((row: DeviceRow) => row.push_token)
  if (tokens.length === 0) return

  console.log(`[expo-push] enviando a ${tokens.length} dispositivo(s) de ${userId}`)

  const result = await sendExpoPushToTokens(tokens, payload, data)
  await deleteDeadTokens(admin, result.muertos)
}
