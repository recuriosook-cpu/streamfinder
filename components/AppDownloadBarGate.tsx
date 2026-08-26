'use client'

import { useCallback, useEffect, useState, type ComponentType } from 'react'
import { isRunningInApp } from '@/lib/app-mode'
import type { AppDownloadBarProps } from './AppDownloadBar'

/**
 * Decide si la barra de descarga tiene que existir, y recién ahí la trae.
 *
 * Va montado en el layout raíz, al lado de `AnalyticsBoot` y `PageViewTracker`,
 * y como ellos devuelve `null` casi siempre. La diferencia es que estos dos
 * hacen su trabajo en todas las cargas y este no hace ninguno en la enorme
 * mayoría.
 *
 * ── Por qué está partido en dos archivos ───────────────────────────────────
 *
 * El requisito no era solo "que no se vea en escritorio": era que **no se
 * descargue**. Un `hidden md:block` no alcanza ni cerca —el componente igual
 * viaja en el bundle, igual hidrata, igual corre sus efectos— y un
 * `if (esCelular) return null` tampoco, porque el `import` estático ya metió el
 * componente en el chunk del layout, que lo pide absolutamente todo el mundo.
 *
 * La única forma de que el código no viaje es que la referencia no sea
 * estática. Por eso `AppDownloadBar` entra por `import()` dinámico, dentro del
 * efecto, después de los chequeos. El bundler lo parte en un chunk aparte y el
 * navegador lo pide cuando se ejecuta esa línea y no antes.
 *
 * Del módulo de la barra acá arriba solo se importa el **tipo** de sus props,
 * con `import type`: eso se borra en compilación y no genera ningún require.
 *
 * Se usa `import()` pelado en vez de `next/dynamic` a propósito. `next/dynamic`
 * también parte el chunk, pero además participa del preload de Next y hace
 * menos evidente en qué momento exacto sale el pedido. Acá el momento exacto es
 * el requisito, así que conviene la versión que se lee de un vistazo.
 *
 * ── El orden de los chequeos ───────────────────────────────────────────────
 *
 * Está puesto de más barato a más caro, y de más frecuente a menos:
 *
 *   1. **Ancho de viewport.** Por ancho y no por user-agent, como se pidió: el
 *      UA miente, se puede falsear y no dice nada del espacio real. `md` de
 *      Tailwind son 768px, así que `max-width: 767px` es el mismo corte que usa
 *      el resto del sitio. Tablets y escritorio quedan afuera del mismo lado.
 *   2. **¿Ya se mostró?** Una lectura de localStorage.
 *   3. **¿Estamos adentro de la app?** Ver `lib/app-mode.ts`.
 *
 * Recién si los tres pasan se arma el timer de 7 segundos, y al dispararse se
 * revisa el ancho de nuevo: entre medio la persona pudo haber rotado el
 * teléfono o agrandado la ventana, y lo que importa es el ancho en el momento
 * de mostrarla.
 */

/** Igual que `md:` en Tailwind, que es el corte que usa el resto del sitio. */
const MOBILE_QUERY = '(max-width: 767px)'

/** No al entrar: a los 7 segundos de estar en la página. */
const DELAY_MS = 7_000

/**
 * La marca de "esta persona ya la vio".
 *
 * Versionada en el nombre para que una campaña futura pueda empezar de cero
 * cambiando el sufijo, sin tener que ir a borrarle la clave vieja a nadie.
 */
const SEEN_KEY = 'glynbox_app_banner_v1'

function yaSeMostro(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    // Sin storage no hay forma de saberlo. Se devuelve `false` y la barra sale:
    // el requisito de "una sola vez" se apoya en el storage y sin storage no
    // hay dónde apoyarse. Es un navegador en modo privado viendo una barra por
    // sesión, no un problema.
    return false
  }
}

function marcarMostrada(): void {
  try { window.localStorage.setItem(SEEN_KEY, '1') } catch { /* silencio */ }
}

function esCelular(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches
  } catch {
    return false
  }
}

export function AppDownloadBarGate() {
  const [Bar, setBar] = useState<ComponentType<AppDownloadBarProps> | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Corte temprano. En escritorio la función termina acá: sin timer, sin
    // import, sin pedido de red.
    if (!esCelular()) return
    if (yaSeMostro()) return
    if (isRunningInApp()) return

    let cancelado = false

    const timer = setTimeout(() => {
      // Segundo chequeo de ancho: pudo haber rotado o cambiado el tamaño de la
      // ventana durante los 7 segundos.
      if (!esCelular()) return

      // Se marca ANTES de traer el chunk, no en el `onClose`.
      //
      // El requisito dice "se muestra UNA sola vez", y eso es más fuerte que
      // "no vuelve después de cerrarla". Marcando al cerrar, alguien que la ve
      // y recarga la página la vuelve a ver, y otra vez, mientras no la toque:
      // la ignora y la barra insiste. Marcando acá, se muestra una vez y se
      // terminó, la haya cerrado, tocado o ignorado.
      //
      // Antes del `import()` y no después porque si el chunk no llega —red
      // caída, deploy nuevo que invalidó el archivo— la barra no se mostró y no
      // habría que gastarle la única oportunidad. El `.catch()` de abajo
      // entonces desmarca.
      marcarMostrada()

      import('./AppDownloadBar')
        .then(mod => {
          if (cancelado) return
          // `setState` con una función la interpreta como updater y la
          // llamaría en vez de guardarla. Un componente ES una función, así que
          // hay que envolverlo.
          setBar(() => mod.default)
        })
        .catch(() => {
          // No se pudo traer. Se devuelve la oportunidad y listo: nadie se
          // entera, y en la próxima carga se vuelve a intentar.
          try { window.localStorage.removeItem(SEEN_KEY) } catch { /* silencio */ }
        })
    }, DELAY_MS)

    return () => {
      cancelado = true
      clearTimeout(timer)
    }
  }, [])

  // La barra avisa cuando terminó su animación de salida. Desmontarla devuelve
  // el padding del `<body>` (el cleanup del efecto que lo puso) y saca el nodo
  // fijo de la página.
  const handleClose = useCallback(() => setBar(null), [])

  if (!Bar) return null
  return <Bar onClose={handleClose} />
}
