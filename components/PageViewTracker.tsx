'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { track } from '@/lib/analytics'

/**
 * Dispara `page_view` en cada navegación.
 *
 * Va montado en el layout raíz, al lado de `AnalyticsBoot`. La diferencia entre
 * los dos es el alcance: `app_open` es una vez por carga de la app,
 * `page_view` es una vez por pantalla.
 *
 * ── Por qué hacía falta ────────────────────────────────────────────────────
 *
 * Hasta acá el catálogo tenía 9 eventos y 8 eran de conversión: registro,
 * onboarding, click en plataforma, búsqueda sin resultados. Todos raros. Una
 * persona que entraba, miraba veinte fichas y se iba generaba exactamente un
 * evento — `app_open` — y su sesión quedaba con un solo timestamp.
 *
 * Con un solo timestamp no hay duración posible: (último − primero) da cero. El
 * tiempo de actividad no se podía calcular porque no había con qué.
 *
 * ── Por qué NO se infla ────────────────────────────────────────────────────
 *
 * Una navegación del router es un `page_view`, no diez. Hay tres cosas que
 * podrían multiplicarlo y las tres están cubiertas:
 *
 *   1. **Re-renders.** El `useEffect` depende de `[pathname]`, así que no corre
 *      cuando el layout se vuelve a renderizar por cualquier otro motivo.
 *
 *   2. **StrictMode.** En desarrollo React monta, desmonta y vuelve a montar
 *      cada efecto. Por eso el guard `lastPath` vive a nivel de módulo y no en
 *      un `useRef`: un ref nace de nuevo con cada montaje, una variable de
 *      módulo no. Es el mismo patrón que el flag `fired` de `AnalyticsBoot`.
 *
 *   3. **Cambios de querystring.** `usePathname` no los ve, y está bien: pasar
 *      de `?page=1` a `?page=2` no es una pantalla nueva. (Y de todas formas el
 *      sanitizador del servidor tira la querystring antes de guardar.)
 *
 * Volver a una ruta ya visitada —de `/` a `/movie/1` y otra vez a `/`— sí
 * cuenta como vista nueva, porque `lastPath` guarda la última y no un historial.
 *
 * ── Sobre la hidratación ───────────────────────────────────────────────────
 *
 * El doc de `usePathname` avisa de un posible mismatch cuando hay rewrites en
 * `next.config`. Acá no aplica por dos motivos: no hay rewrites (sólo un
 * redirect), y el componente devuelve `null` — el pathname nunca llega al
 * markup, sólo al efecto.
 */

/**
 * Última ruta trackeada.
 *
 * A nivel de módulo a propósito: tiene que sobrevivir a los remontajes de
 * StrictMode. Con un `useRef` el guard no serviría de nada en desarrollo.
 */
let lastPath: string | null = null

export function PageViewTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    if (lastPath === pathname) return

    lastPath = pathname
    track('page_view', { path: pathname })
  }, [pathname])

  return null
}
