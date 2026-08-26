'use client'

/**
 * ¿Esta pestaña está corriendo dentro de la app, o en un navegador común?
 *
 * Hasta ahora el sitio no se hacía esta pregunta en ningún lado. La
 * infraestructura de la TWA estaba (`public/.well-known/assetlinks.json` con
 * `com.glynbox.app`, `manifest.json` con `display: standalone`, el header de
 * Content-Type en `next.config.ts`) y `/api/track` acepta `platform: 'mobile'`,
 * pero eso lo manda la app nativa: el cliente web hardcodea `'web'`. Así que
 * esto es la primera detección del lado del navegador y conviene ser explícito
 * sobre cómo funciona.
 *
 * ── Las dos señales ────────────────────────────────────────────────────────
 *
 *   1. **`document.referrer` con esquema `android-app://`.** Es la señal fuerte
 *      y la específica de la TWA: Chrome se lo pone al documento que abre desde
 *      la app, y trae el package name. Es lo más cerca que se puede estar de
 *      "esto es com.glynbox.app".
 *
 *   2. **`display-mode: standalone`** (y sus primos `fullscreen` y
 *      `minimal-ui`). Es la señal amplia: matchea la TWA y también la PWA
 *      instalada desde el navegador.
 *
 * Que la segunda sea amplia no es un defecto para lo que se usa acá. Alguien
 * que instaló la PWA no necesita que le ofrezcan bajar la app: ya la tiene, en
 * la forma que eligió. Ofrecérsela sería el peor caso posible de la barra.
 *
 * ── Por qué el flag se pega en localStorage ────────────────────────────────
 *
 * `document.referrer` es una propiedad del documento, no de la sesión. Solo
 * aparece en la primera navegación que hace la app; en cuanto la persona toca
 * un link y se carga otro documento, el referrer pasa a ser la página anterior
 * de glynbox.com y la señal 1 desaparece.
 *
 * Sin pegarlo, la detección sería correcta en la pantalla de entrada e
 * incorrecta en todas las siguientes — que es justo donde la barra tiene tiempo
 * de aparecer, porque espera 7 segundos. En la práctica la barra le saldría a
 * todo usuario de la app que navegue a una segunda pantalla, que es
 * exactamente a quien no tiene que salirle.
 *
 * `display-mode` sí sobrevive a la navegación, así que el flag es cinturón
 * sobre tirador. Vale igual: es barato y cubre el caso de un WebView que no
 * reporte display-mode.
 *
 * El flag es de una sola dirección: se escribe cuando se detecta la app, nunca
 * se borra. El costo de equivocarse es asimétrico. Un falso positivo pegado
 * significa que a alguien no le sale una barra de promoción; un falso negativo
 * significa ofrecerle instalar la app a alguien que ya está adentro de la app.
 *
 * Como todo lo que toca storage en este código, cada acceso va en su propio
 * try/catch: en Safari privado, con cookies de terceros bloqueadas o con el
 * storage lleno, estos accesos TIRAN, no devuelven null.
 */

const IN_APP_KEY = 'glynbox_in_app'

/** El esquema que Chrome le pone al referrer cuando abre desde una TWA. */
const ANDROID_APP_SCHEME = 'android-app://'

/**
 * Los display-mode que significan "esto no se ve como una pestaña".
 * `browser` queda afuera a propósito: es el modo normal.
 */
const APP_DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui'] as const

export function isRunningInApp(): boolean {
  try {
    if (typeof window === 'undefined') return false

    // El flag pegado gana y corta temprano: si ya se detectó una vez en este
    // navegador, no hace falta volver a mirar nada.
    try {
      if (window.localStorage.getItem(IN_APP_KEY) === '1') return true
    } catch { /* sin storage seguimos con las señales en vivo */ }

    let inApp = false

    // Señal 1 — la TWA.
    try {
      if (document.referrer.startsWith(ANDROID_APP_SCHEME)) inApp = true
    } catch { /* silencio */ }

    // Señal 2 — instalada, por la vía que sea.
    try {
      if (typeof window.matchMedia === 'function') {
        for (const mode of APP_DISPLAY_MODES) {
          if (window.matchMedia(`(display-mode: ${mode})`).matches) {
            inApp = true
            break
          }
        }
      }
    } catch { /* silencio */ }

    // Señal 3 — iOS agregado a la pantalla de inicio. No hay app de iOS todavía,
    // así que esto no evita una instalación: evita ofrecerle una app de Android
    // a alguien que está en un iPhone en modo standalone. Es una línea.
    try {
      const nav = window.navigator as Navigator & { standalone?: boolean }
      if (nav.standalone === true) inApp = true
    } catch { /* silencio */ }

    if (inApp) {
      try { window.localStorage.setItem(IN_APP_KEY, '1') } catch { /* silencio */ }
    }

    return inApp
  } catch {
    // Ante la duda, "no es la app". El caller usa esto para decidir si muestra
    // una barra de promoción, y errar hacia mostrarla en un navegador común es
    // el error barato.
    return false
  }
}
