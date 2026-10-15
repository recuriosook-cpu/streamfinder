'use client'

import { useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { track, flushAnalytics } from '@/lib/analytics'
import { detectarDispositivo, refinarDispositivo, type Dispositivo } from '@/lib/device'
import { tiendasPara, type Tienda } from '@/lib/tiendas'
import { GooglePlayBadge } from './GooglePlayBadge'
import { AppStoreBadge } from './AppStoreBadge'

/**
 * Los badges de las tiendas que le sirven a este aparato: App Store en iPhone
 * y iPad, Google Play en Android, los dos en la computadora. La regla vive en
 * `tiendasPara`.
 *
 * ── De dónde sale el aparato ───────────────────────────────────────────────
 *
 * Si lo pasa quien lo usa, ese manda: `/descargar` lo detecta en el servidor
 * con el user-agent para que la primera pintura ya salga bien.
 *
 * Si no —el pie, que se renderiza igual para todos y no puede leer headers sin
 * volver dinámico todo el sitio—, se lee del navegador. El servidor pinta los
 * dos badges y, al hidratar, en un teléfono queda sólo el que corresponde. El
 * salto no se ve: el pie está al fondo de la página.
 */

const noHayASuscribirse = () => () => {}

function dispositivoDelNavegador(): Dispositivo {
  try {
    return refinarDispositivo(detectarDispositivo(navigator.userAgent))
  } catch {
    return 'desktop'
  }
}

/** El aparato visto desde el navegador; `'desktop'` en el servidor. */
export function useDispositivo(): Dispositivo {
  return useSyncExternalStore(noHayASuscribirse, dispositivoDelNavegador, () => 'desktop')
}

/**
 * Anchos del badge de Google, y el alto equivalente del de Apple.
 *
 * El PNG de Google mide 646×250 con el dibujo entre las filas 29 y 221: el
 * badge dibujado ocupa 192/646 del ancho en alto. El de Apple se dibuja a ese
 * mismo alto para que los dos se lean del mismo tamaño uno al lado del otro.
 */
const TAMANOS = {
  normal: 180,   // el del pie
  grande: 260,   // el botón principal de /descargar
} as const

export interface BadgesTiendasProps {
  /** El aparato, si ya se sabe. Si no, se lee del navegador. */
  dispositivo?: Dispositivo
  tamano?: keyof typeof TAMANOS
  /** El pie los alinea a la izquierda, con su columna; /descargar, al centro. */
  alinear?: 'inicio' | 'centro'
  /**
   * Qué registrar al tocar uno. Por defecto, el evento del pie con la ruta y
   * la tienda. El flush lo hace cada badge.
   */
  onClick?: (tienda: Tienda) => void
}

export function BadgesTiendas({ dispositivo, tamano = 'normal', alinear = 'centro', onClick }: BadgesTiendasProps) {
  const delNavegador = useDispositivo()
  const pathname = usePathname()
  const tiendas = tiendasPara(dispositivo ?? delNavegador)
  const ancho = TAMANOS[tamano]
  const altoApple = Math.round((ancho * 192) / 646)

  const registrar = (tienda: Tienda) => {
    if (onClick) onClick(tienda)
    else track('app_footer_clicked', { path: pathname ?? null, tienda })
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-2 ${alinear === 'centro' ? 'justify-center' : 'justify-start'}`}>
      {tiendas.map((tienda) =>
        tienda === 'app_store' ? (
          <AppStoreBadge
            key={tienda}
            alto={altoApple}
            onClick={() => {
              registrar(tienda)
              flushAnalytics()
            }}
          />
        ) : (
          <GooglePlayBadge key={tienda} ancho={`${ancho}px`} onClick={() => registrar(tienda)} />
        ),
      )}
    </div>
  )
}
