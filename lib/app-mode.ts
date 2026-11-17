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
 *   1. **`document.referrer` = `android-app://com.glynbox.app`.** Es la señal
 *      fuerte y la específica de la TWA: Chrome se lo pone al documento que
 *      abre desde la app, con el package name.
 *
 *      Tiene que ser NUESTRO package. Chrome le pone `android-app://<package>`
 *      a todo link que otra app abre en él: WhatsApp, Gmail, Telegram, la app
 *      de Google (`com.google.android.googlequicksearchbox`). Hasta el
 *      17/11/2026 alcanzaba con el esquema: a quien entraba desde un link de
 *      WhatsApp se lo tomaba como "dentro de la app", la marca se pegaba y no
 *      volvía a ver el aviso para bajarla en ese celular.
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

/**
 * `_v2` desde el 17/11/2026: la clave vieja quedó pegada en celulares que
 * entraron alguna vez desde un link de WhatsApp o de la app de Google (ver la
 * señal 1). Con otra clave esos navegadores se vuelven a evaluar; a quien de
 * verdad está en la app lo vuelve a marcar la primera carga.
 */
const IN_APP_KEY = 'glynbox_in_app_v2'

/** El referrer que Chrome le pone al documento que abre la TWA de Glynbox. */
const REFERRER_DE_LA_APP = /^android-app:\/\/com\.glynbox\.app(\/|$)/

/**
 * Qué señal dijo "está en la app". `marca` es la de `localStorage`, que guarda
 * que alguna de las otras se vio antes en este navegador. La mide el evento
 * `aviso_app_descartado`.
 */
export type SenalDeApp = 'marca' | 'referrer' | 'display_mode' | 'standalone'

/**
 * Los display-mode que significan "esto no se ve como una pestaña".
 * `browser` queda afuera a propósito: es el modo normal.
 */
const APP_DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui'] as const

export function isRunningInApp(): boolean {
  return senalDeApp() !== null
}

/** Como `isRunningInApp()`, pero dice qué señal lo decidió (o `null`: no es la app). */
export function senalDeApp(): SenalDeApp | null {
  try {
    if (typeof window === 'undefined') return null

    // El flag pegado gana y corta temprano: si ya se detectó una vez en este
    // navegador, no hace falta volver a mirar nada.
    try {
      if (window.localStorage.getItem(IN_APP_KEY) === '1') return 'marca'
    } catch { /* sin storage seguimos con las señales en vivo */ }

    let senal: SenalDeApp | null = null

    // Señal 1 — la TWA, y sólo la nuestra.
    try {
      if (REFERRER_DE_LA_APP.test(document.referrer)) senal = 'referrer'
    } catch { /* silencio */ }

    // Señal 2 — instalada, por la vía que sea.
    try {
      if (!senal && typeof window.matchMedia === 'function') {
        for (const mode of APP_DISPLAY_MODES) {
          if (window.matchMedia(`(display-mode: ${mode})`).matches) {
            senal = 'display_mode'
            break
          }
        }
      }
    } catch { /* silencio */ }

    // Señal 3 — iOS agregado a la pantalla de inicio. Evita ofrecerle la app
    // a alguien que está en un iPhone en modo standalone. Es una línea.
    try {
      const nav = window.navigator as Navigator & { standalone?: boolean }
      if (!senal && nav.standalone === true) senal = 'standalone'
    } catch { /* silencio */ }

    if (senal) {
      try { window.localStorage.setItem(IN_APP_KEY, '1') } catch { /* silencio */ }
    }

    return senal
  } catch {
    // Ante la duda, "no es la app". El caller usa esto para decidir si muestra
    // una barra de promoción, y errar hacia mostrarla en un navegador común es
    // el error barato.
    return null
  }
}
