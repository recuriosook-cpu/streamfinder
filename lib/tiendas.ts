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

/**
 * La marca de campaña que llevan los links a las tiendas, para que App Store
 * Connect y Play Console cuenten de dónde vino cada descarga.
 *
 *   - `medio`: `landing` en `/descargar`, `web` en el resto del sitio (pie y
 *     barra de descarga).
 *   - `campana`: `landing` o `web` igual que el medio, salvo en `/descargar`
 *     con `?src=algo`, donde va ese `algo` (ver `campanaDeSrc`).
 *
 * En Apple viaja como `ct` (el "campaign token"; `pt` es el proveedor de la
 * cuenta y `mt=8` dice que es una app). En Play viaja dentro de `referrer`,
 * codificado: es un parámetro de la URL cuyo valor es otra query string.
 */
export interface MarcaTienda {
  medio: 'landing' | 'web'
  campana: string
}

/** La del sitio, para todo lo que no es `/descargar`. */
export const MARCA_WEB: MarcaTienda = { medio: 'web', campana: 'web' }

/** El "provider token" de la cuenta de App Store Connect. */
const APP_STORE_PT = '129527694'

export function appStoreUrl(marca: MarcaTienda = MARCA_WEB): string {
  const query = new URLSearchParams({ pt: APP_STORE_PT, ct: marca.campana, mt: '8' })
  return `https://apps.apple.com/app/apple-store/id${APP_STORE_ID}?${query}`
}

export function playUrl(marca: MarcaTienda = MARCA_WEB): string {
  const referrer = `utm_source=glynbox&utm_medium=${marca.medio}&utm_campaign=${marca.campana}`
  return `https://play.google.com/store/apps/details?id=com.glynbox.app&referrer=${encodeURIComponent(referrer)}`
}

/**
 * La campaña de `/descargar` a partir de `?src=`.
 *
 * Sólo letras, números y guiones, hasta 30 caracteres. Cualquier otra cosa
 * —vacío, más largo, con espacios o símbolos, repetido— se ignora y queda
 * `landing`: el valor termina adentro de dos URLs de terceros y en sus
 * reportes, y es preferible perder una etiqueta mal escrita a mandar basura.
 */
export function campanaDeSrc(src: string | string[] | undefined): string {
  return typeof src === 'string' && /^[A-Za-z0-9-]{1,30}$/.test(src) ? src : 'landing'
}

export type Tienda = 'app_store' | 'play_store'

/** Qué tiendas ofrecerle a cada aparato, en el orden en que se muestran. */
export function tiendasPara(dispositivo: Dispositivo): Tienda[] {
  if (dispositivo === 'ios') return ['app_store']
  if (dispositivo === 'android') return ['play_store']
  return ['app_store', 'play_store']
}

export function urlDeTienda(tienda: Tienda, marca: MarcaTienda = MARCA_WEB): string {
  return tienda === 'app_store' ? appStoreUrl(marca) : playUrl(marca)
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
