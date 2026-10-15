import type { Metadata } from 'next'
import type { Dispositivo } from '@/lib/device'

/**
 * Las dos tiendas de la app, en un solo lugar.
 *
 * Antes el link de Play estaba copiado en la barra, en el badge y en la
 * landing; con la app de iPhone publicada hay dos destinos, y la regla para
 * elegir entre ellos es una sola en todo el sitio:
 *
 *   - iPhone / iPad → App Store
 *   - Android       → Google Play
 *   - computadora   → las dos (no hay nada que instalar en este aparato, pero
 *                     es gente que después agarra el teléfono)
 */

/** Apple ID de la app en App Store Connect. Es el mismo del aviso de Safari. */
export const APP_STORE_ID = '6817536332'

export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`
export const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.glynbox.app'

export type Tienda = 'app_store' | 'play_store'

/** Qué tiendas ofrecerle a cada aparato, en el orden en que se muestran. */
export function tiendasPara(dispositivo: Dispositivo): Tienda[] {
  if (dispositivo === 'ios') return ['app_store']
  if (dispositivo === 'android') return ['play_store']
  return ['app_store', 'play_store']
}

export function urlDeTienda(tienda: Tienda): string {
  return tienda === 'app_store' ? APP_STORE_URL : PLAY_URL
}

/**
 * El aviso nativo de Safari en iPhone ("Abrir" / "Obtener") para una ruta.
 *
 * `appArgument` es la URL que recibe la app al tocar "Abrir", y va con el
 * dominio `www` porque es el que la app reconoce como suyo (ver
 * `glynbox-mobile/src/lib/deepLinks.ts`) y el del AASA. Sin ruta, el aviso
 * abre la app en el inicio: es lo que pone el layout raíz.
 *
 * Next reemplaza `itunes` entero cuando una página lo define, así que cada
 * página con ficha propia lo pide acá con su ruta y el resto hereda el del
 * layout.
 */
export function itunesPara(ruta?: string): NonNullable<Metadata['itunes']> {
  return ruta
    ? { appId: APP_STORE_ID, appArgument: `https://www.glynbox.com${ruta}` }
    : { appId: APP_STORE_ID }
}
