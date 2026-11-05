'use client'

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { usePathname } from 'next/navigation'
import { isRunningInApp } from '@/lib/app-mode'
import { detectarDispositivo, refinarDispositivo } from '@/lib/device'
import { visitaActual } from '@/lib/analytics'
import type { AvisoAppProps } from './AvisoApp'

/**
 * Decide si sale el aviso de pantalla completa para bajar la app, y recién
 * entonces lo trae (`import()` dinámico: en computadora el código del aviso no
 * se descarga, igual que hacía la barra que reemplaza).
 *
 * Reglas, en el orden en que se miran:
 *
 *   1. **Nada en el servidor.** Todo pasa en el navegador, después de cargar:
 *      el HTML que reciben Google y cualquier otro es el de siempre.
 *   2. **Sólo Android y iPhone/iPad.** Por user agent (`lib/device.ts`), con el
 *      ajuste del iPad que se hace pasar por Mac. En computadora, nada.
 *   3. **Nunca a un rastreador.** Googlebot renderiza con JavaScript y un user
 *      agent de Android: sin esto, vería el aviso.
 *   4. **Nunca dentro de la app** (`lib/app-mode.ts`). En `/descargar` y
 *      `/admin` no se monta (`ConditionalShell`).
 *   5. **Una vez por visita**: la misma visita que miden los eventos (30 min sin
 *      actividad abren otra). Sale aunque la haya cerrado en una visita anterior.
 *   6. **Quien llega desde un buscador no lo ve al entrar.** Google castiga los
 *      avisos que tapan la página a la que llevó a alguien. A esa persona le
 *      sale cuando pasa a otra página del sitio.
 */

const CLAVE = 'glynbox_aviso_app'

/** Rastreadores y herramientas que ejecutan JavaScript con user agent de celular. */
const RASTREADOR = /bot\b|googlebot|google-inspectiontool|googleother|storebot|adsbot|mediapartners|bingbot|bingpreview|slurp|duckduck|yandex|baiduspider|crawler|spider|headlesschrome|lighthouse|chrome-lighthouse|pagespeed/i

/** Los buscadores desde los que la entrada no lleva aviso. */
const BUSCADOR = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|yandex|search\.brave|startpage)\.[a-z.]+$/i

interface Estado {
  /** El id de visita al que corresponde (`visitaActual()`). */
  visita: string
  /** `pendiente`: llegó de un buscador y se espera a que cambie de página. */
  estado: 'mostrado' | 'pendiente'
  /** La página por la que entró, para saber cuándo "pasó a otra". */
  entrada: string
}

function leer(): Estado | null {
  try {
    const raw = window.sessionStorage.getItem(CLAVE)
    return raw ? (JSON.parse(raw) as Estado) : null
  } catch {
    return null
  }
}

function guardar(e: Estado): void {
  try { window.sessionStorage.setItem(CLAVE, JSON.stringify(e)) } catch { /* sin storage: sale una vez por carga */ }
}

function vieneDeBuscador(): boolean {
  try {
    if (!document.referrer) return false
    return BUSCADOR.test(new URL(document.referrer).hostname)
  } catch {
    return false
  }
}

export function AvisoAppGate() {
  const pathname = usePathname()
  const [Aviso, setAviso] = useState<ComponentType<AvisoAppProps> | null>(null)
  const [props, setProps] = useState<Omit<AvisoAppProps, 'onClose'> | null>(null)
  // Para no evaluar dos veces lo mismo (StrictMode, re-render) ni traer el chunk dos veces.
  const mostrando = useRef(false)

  useEffect(() => {
    if (mostrando.current || typeof window === 'undefined' || !pathname) return

    const ua = navigator.userAgent ?? ''
    if (RASTREADOR.test(ua)) return
    const dispositivo = refinarDispositivo(detectarDispositivo(ua))
    if (dispositivo === 'desktop') return
    if (isRunningInApp()) return

    const visita = visitaActual() ?? 'sin-storage'
    const previo = leer()
    const mismaVisita = previo?.visita === visita
    if (mismaVisita && previo.estado === 'mostrado') return

    let entrada: 'directa' | 'buscador' = 'directa'
    if (!mismaVisita) {
      // Primera página de la visita.
      if (vieneDeBuscador()) {
        guardar({ visita, estado: 'pendiente', entrada: pathname })
        return
      }
    } else if (previo.estado === 'pendiente') {
      // Vino de un buscador: sale recién en otra página.
      if (pathname === previo.entrada) return
      entrada = 'buscador'
    }

    mostrando.current = true
    guardar({ visita, estado: 'mostrado', entrada: mismaVisita ? previo.entrada : pathname })
    const tienda = dispositivo === 'ios' ? 'app_store' : 'play_store'

    import('./AvisoApp')
      .then(mod => {
        setProps({ tienda, entrada })
        setAviso(() => mod.default)
      })
      .catch(() => {
        // No llegó el código: se devuelve la oportunidad para la próxima página.
        mostrando.current = false
        try { window.sessionStorage.removeItem(CLAVE) } catch { /* silencio */ }
      })
  }, [pathname])

  const cerrar = useCallback(() => setAviso(null), [])

  if (!Aviso || !props) return null
  return <Aviso {...props} onClose={cerrar} />
}
