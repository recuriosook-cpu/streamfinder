import { detectarDispositivo, refinarDispositivo } from '@/lib/device'
import { navegadorEmbebido } from '@/lib/navegador-embebido'

/**
 * "Ver ficha" de la ruleta: abre la película en la app si está instalada y,
 * si no, en la ficha web con `?sugerir_app=1` (que muestra un cartel chico
 * para bajarla, `components/SugerirApp.tsx`).
 *
 * Hace falta porque un link a glynbox.com tocado DENTRO de glynbox.com nunca
 * abre la app: ni Android (App Links) ni iOS (Universal Links) pasan a la app
 * una navegación al mismo sitio. Así que se usa el scheme propio de la app,
 * `glynbox://movie/{id}`, que la app ya entiende (`src/lib/deepLinks.ts` de
 * glynbox-mobile → MovieDetail).
 *
 *   - Android: un link `intent://` con el package. Chrome abre la app si está
 *     y, si no, va solo a `browser_fallback_url`.
 *   - iPhone: se intenta el scheme y, si a los 1,5 s la página sigue a la
 *     vista (no se fue a la app), se va a la ficha web.
 *   - Computadora y navegadores de adentro de otras apps (Instagram, TikTok…,
 *     que suelen bloquear `intent://` y los schemes): la ficha web, como un
 *     link común.
 *
 * Devuelve `true` si se encargó de la navegación (y el link no tiene que
 * seguir), `false` si el link común tiene que hacer lo suyo.
 */

const PAQUETE = 'com.glynbox.app'
const ESPERA_IOS = 1500

export function abrirFichaEnApp(id: number): boolean {
  const ua = navigator.userAgent ?? ''
  const dispositivo = refinarDispositivo(detectarDispositivo(ua))
  if (dispositivo === 'desktop' || navegadorEmbebido(ua)) return false

  const web = `${window.location.origin}/movie/${id}?sugerir_app=1`

  if (dispositivo === 'android') {
    window.location.href =
      `intent://movie/${id}#Intent;scheme=glynbox;package=${PAQUETE};S.browser_fallback_url=${encodeURIComponent(web)};end`
    return true
  }

  // iPhone. Si la app se abre, la página pasa a segundo plano: se cancela la
  // ida a la web, y al volver a Safari la persona sigue en la ruleta.
  let seFue = false
  const alOcultar = () => { if (document.visibilityState === 'hidden') seFue = true }
  const alSalir = () => { seFue = true }
  document.addEventListener('visibilitychange', alOcultar)
  window.addEventListener('pagehide', alSalir)
  setTimeout(() => {
    document.removeEventListener('visibilitychange', alOcultar)
    window.removeEventListener('pagehide', alSalir)
    if (!seFue && document.visibilityState === 'visible') window.location.href = web
  }, ESPERA_IOS)
  window.location.href = `glynbox://movie/${id}`
  return true
}
