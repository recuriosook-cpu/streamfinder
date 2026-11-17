'use client'

import type { EventProps } from '@/lib/analytics-events'
import { navegadorEmbebido } from '@/lib/navegador-embebido'

/**
 * De dónde llegó la visita, para las props de los eventos de entrada: el
 * primer `page_view` de cada visita y `descargar_viewed`.
 *
 * Existe desde el 17/11/2026. Hasta entonces `analytics_events` no guardaba ni
 * el referrer ni el user agent, y no había forma de saber si la gente que
 * entraba desde el celular venía de TikTok, de Instagram, de Google o de un
 * link de WhatsApp.
 *
 * Nada de esto es personal. Del referrer se guarda sólo el dominio (o el
 * package de Android), nunca la URL: la de una búsqueda o la de un perfil
 * pueden traer datos de quien la abrió. De los ids de clic de las redes
 * (`ttclid`, `fbclid`, `gclid`) se guarda que estaban, no el valor.
 *
 * Props que agrega, todas opcionales:
 *
 *   - `ref`: `directo` (sin referrer), `app:<package>` (otra app de Android
 *     que abrió el link en Chrome: `app:com.whatsapp`), `glynbox` (vino del
 *     mismo sitio) o el dominio sin `www.` (`google.com`, `l.instagram.com`).
 *     Sólo en la primera pantalla de la carga: después de navegar dentro del
 *     sitio, `document.referrer` sigue siendo el de la entrada y ya no dice
 *     nada de esa pantalla.
 *   - `navegador`: el navegador embebido de una app (`tiktok`, `instagram`,
 *     `facebook`, `otro`), por user agent. Muchos de estos no mandan referrer,
 *     así que es lo que separa "TikTok" de "directo".
 *   - `utm_source`, `utm_medium`, `utm_campaign`: la marca de campaña del link.
 *   - `clic`: `tiktok`, `meta` o `google` si la URL trae el id de clic que esas
 *     redes agregan solas a los links de sus anuncios.
 */

/** La ruta con la que arrancó esta carga, y si ya se salió de ella. */
let rutaDeEntrada: string | null = null
let navego = false

/**
 * Anota la ruta actual. Lo llama `PageViewTracker` en cada `page_view`, y
 * también `esPantallaDeEntrada()`: no hay un orden fijo entre el `page_view`
 * y el evento de la página (en `/descargar` el `page_view` sale primero).
 */
export function contarPantalla(): void {
  try {
    const ruta = window.location.pathname
    if (rutaDeEntrada === null) rutaDeEntrada = ruta
    else if (ruta !== rutaDeEntrada) navego = true
  } catch { /* silencio */ }
}

/** ¿Sigue en la pantalla con la que se cargó el documento? */
export function esPantallaDeEntrada(): boolean {
  contarPantalla()
  return !navego
}

const PACKAGE = /^android-app:\/\/([a-z0-9_.]{1,100})/i
const UTM = ['utm_source', 'utm_medium', 'utm_campaign'] as const
const CLIC: Array<[param: string, red: string]> = [
  ['ttclid', 'tiktok'],
  ['fbclid', 'meta'],
  ['gclid', 'google'],
  ['gbraid', 'google'],
  ['wbraid', 'google'],
]

/** El referrer reducido a algo que se puede guardar. */
export function referenciaDe(referrer: string): string {
  if (!referrer) return 'directo'
  const app = PACKAGE.exec(referrer)
  if (app) return `app:${app[1].toLowerCase()}`
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '')
    if (!host) return 'otro'
    if (host === 'glynbox.com' || host.endsWith('.glynbox.com')) return 'glynbox'
    return host.slice(0, 100)
  } catch {
    return 'otro'
  }
}

/** Las utm y la red del id de clic, de una querystring. */
export function marcaDeCampana(search: string): EventProps {
  const out: EventProps = {}
  try {
    const params = new URLSearchParams(search)
    for (const clave of UTM) {
      const valor = params.get(clave)?.trim()
      if (valor) out[clave] = valor.slice(0, 100)
    }
    for (const [param, red] of CLIC) {
      if (params.has(param)) { out.clic = red; break }
    }
  } catch { /* sin querystring legible, sin marca */ }
  return out
}

/**
 * Todo junto, para el evento que se está por mandar. `ref` sólo si es la
 * pantalla de entrada de la carga (ver arriba).
 */
export function propsDeEntrada(): EventProps {
  if (typeof window === 'undefined') return {}
  const out: EventProps = marcaDeCampana(window.location.search)
  try {
    if (esPantallaDeEntrada()) out.ref = referenciaDe(document.referrer)
  } catch { /* silencio */ }
  try {
    const nav = navegadorEmbebido(navigator.userAgent)
    if (nav) out.navegador = nav
  } catch { /* silencio */ }
  return out
}
