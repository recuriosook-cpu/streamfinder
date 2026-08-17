// SERVER-ONLY — habla con la Expo Push API con la service role key.

import { getAdminClient } from './service-role'
import type { PushPayload } from './send-push-notification'

/**
 * Push a la app nativa, vía Expo.
 *
 * Va aparte del push web (`send-push-notification.ts`) porque el transporte no
 * tiene nada que ver: el web usa VAPID y habla directo con el endpoint que le
 * dio el navegador; Expo recibe un token y se encarga de FCM/APNs. Lo que sí
 * comparten es `buildPushPayload`, así que el texto de cada tipo de
 * notificación se escribe una sola vez.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/** La API acepta hasta 100 mensajes por request. */
const BATCH_SIZE = 100

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
 * `url` es la ruta de glynbox.com —la misma que ya arma `buildPushPayload` para
 * el push web— y la app la resuelve con su parser de deep links. Así no hay un
 * segundo mapeo de tipo → pantalla que mantener del lado del servidor.
 */
export type ExpoPushData = {
  url: string
  type: string
  entityId?: string
}

type DeviceRow = { push_token: string }

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

  const dead: string[] = []

  for (let from = 0; from < tokens.length; from += BATCH_SIZE) {
    const batch = tokens.slice(from, from + BATCH_SIZE)

    const messages = batch.map((token) => ({
      to: token,
      title: payload.title,
      body: payload.body,
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
        continue
      }

      const result = (await response.json()) as { data?: ExpoTicket[] }
      const tickets = result.data ?? []

      // Los tickets vuelven en el mismo orden que los mensajes.
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok') return
        if (ticket.details?.error === DEVICE_NOT_REGISTERED) {
          dead.push(batch[i])
          return
        }
        console.error('[expo-push] ticket con error:', ticket.message)
      })
    } catch (err: unknown) {
      console.error('[expo-push] fallo de red:', (err as Error).message)
    }
  }

  if (dead.length > 0) {
    // Un token muerto no revive: si no se borra, cada notificación futura paga
    // el viaje a Expo para que lo rechace de nuevo.
    const { error: deleteError } = await admin
      .from('user_devices')
      .delete()
      .in('push_token', dead)

    if (deleteError) {
      console.error('[expo-push] no se pudieron borrar tokens muertos:', deleteError.message)
    } else {
      console.log(`[expo-push] ${dead.length} token(s) muerto(s) borrado(s)`)
    }
  }
}
