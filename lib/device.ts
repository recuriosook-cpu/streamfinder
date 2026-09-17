/**
 * Clasificación del dispositivo del visitante.
 *
 * Existe para `/descargar`, que muestra un botón distinto según dónde esté
 * parada la persona: en Android la app se puede instalar, en iPhone todavía no,
 * y en escritorio no hay nada que instalar.
 *
 * No se importa desde `lib/app-mode.ts` ni lo reemplaza: ese módulo contesta
 * otra pregunta —"¿esta pestaña ya está corriendo adentro de la app?"— y lo
 * hace con señales del documento (`display-mode`, el referrer `android-app://`).
 * Acá la pregunta es "¿qué aparato es este?", que es anterior y se contesta con
 * el user-agent.
 *
 * ── Por qué es una función pura sobre un string ────────────────────────────
 *
 * Porque se llama desde los dos lados. El servidor la usa con el header
 * `user-agent` del request para que la primera pintura ya traiga el botón
 * correcto; el navegador la usa con `navigator.userAgent` para refinar el caso
 * del iPad (ver abajo). Si leyera `navigator` adentro no se podría usar en el
 * servidor, y si fuera `'use client'` no se podría importar desde un Server
 * Component.
 *
 * ── El caso del iPad ───────────────────────────────────────────────────────
 *
 * Desde iPadOS 13, Safari en iPad manda por defecto un user-agent de
 * escritorio: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...`. Es
 * indistinguible del de una Mac. Mirando sólo el string —que es todo lo que
 * tiene el servidor— un iPad es una computadora, y no hay forma de arreglarlo
 * desde ahí.
 *
 * La única señal que los separa vive en el navegador: una Mac reporta
 * `maxTouchPoints === 0` y un iPad reporta 5. De ahí que la detección esté
 * partida en dos funciones y no en una:
 *
 *   - `detectarDispositivo(ua)` corre en el servidor y acierta en todo salvo el
 *     iPad en modo escritorio, que le sale `'desktop'`.
 *   - `refinarDispositivo(base)` corre en el navegador y corrige ese único
 *     caso.
 *
 * Se podría hacer todo del lado del cliente y ahorrarse la segunda función,
 * pero entonces la primera pintura no tendría botón: habría que esperar al
 * efecto. En una pantalla cuyo único propósito es el botón, eso es exactamente
 * lo que no se puede permitir.
 */

export type Dispositivo = 'android' | 'ios' | 'desktop'

/** Etiqueta para mostrar. Vive acá para que el panel y la página coincidan. */
export const DISPOSITIVO_LABEL: Record<Dispositivo, string> = {
  android: 'Android',
  ios:     'iPhone / iPad',
  desktop: 'Computadora',
}

/** Los tres valores, en el orden en que se muestran en el panel. */
export const DISPOSITIVOS: readonly Dispositivo[] = ['android', 'ios', 'desktop'] as const

export function esDispositivo(v: unknown): v is Dispositivo {
  return v === 'android' || v === 'ios' || v === 'desktop'
}

/**
 * Clasifica a partir del user-agent. Sirve en el servidor y en el cliente.
 *
 * El orden de los tests importa. `android` va primero porque hay user-agents de
 * Android que mencionan Linux y X11, y `ios` va antes que el caso general
 * porque los de iPhone incluyen la frase "like Mac OS X" y matchearían un test
 * de Mac hecho a la ligera.
 *
 * Un UA vacío o ausente cae en `'desktop'`. Es el default correcto para lo que
 * decide esta función: en escritorio la página ofrece entrar al sitio, que es
 * algo que funciona en cualquier aparato. Errar hacia Android le ofrecería una
 * instalación imposible a alguien que no puede hacerla.
 */
export function detectarDispositivo(userAgent: string | null | undefined): Dispositivo {
  if (!userAgent) return 'desktop'

  const ua = userAgent.toLowerCase()

  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios'

  return 'desktop'
}

/**
 * Corrige el veredicto del servidor con lo que sólo se sabe en el navegador.
 *
 * Hoy arregla un solo caso —el iPad que se hace pasar por Mac— y por eso sólo
 * mira cuando `base` es `'desktop'`: si el UA ya dijo Android o iPhone, no hay
 * nada que refinar y `maxTouchPoints` no agrega información.
 *
 * Las dos condiciones van juntas a propósito. `maxTouchPoints > 1` por sí solo
 * daría verdadero en cualquier notebook con pantalla táctil —una Surface, una
 * Dell 2-en-1— y esas son computadoras con Windows, no iPads. El requisito de
 * que además el UA sea de Macintosh es lo que hace específica la regla: una Mac
 * nunca tiene pantalla táctil, así que "se dice Mac y tiene cinco dedos" sólo
 * lo cumple un iPad.
 *
 * Como todo lo que toca APIs del navegador en este código, va envuelto en
 * try/catch y ante la duda devuelve `base`: el refinamiento es una mejora, no
 * algo de lo que dependa que la página funcione.
 */
export function refinarDispositivo(base: Dispositivo): Dispositivo {
  if (base !== 'desktop') return base

  try {
    if (typeof navigator === 'undefined') return base

    const esMac = /macintosh|mac os x/i.test(navigator.userAgent ?? '')
    const tieneTactil = (navigator.maxTouchPoints ?? 0) > 1

    if (esMac && tieneTactil) return 'ios'
  } catch { /* silencio: si no se puede refinar, el veredicto del servidor vale */ }

  return base
}
