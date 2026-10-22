'use client'

import { appStoreUrl, type MarcaTienda } from '@/lib/tiendas'

/**
 * El badge oficial de Apple, "Descárgalo en el App Store".
 *
 * Mismo criterio que `GooglePlayBadge`: el archivo es el de Apple y no se
 * toca. `public/app-store-badge.svg` es la variante negra en español
 * latinoamericano (es-MX, el par del es-419 de Google), bajada tal cual de
 * `toolbox.marketingtools.apple.com`. Si hay que cambiarlo, se baja de nuevo.
 *
 * Las reglas de Apple que aplican acá:
 *
 *   - **No se modifica**: ni color, ni recorte, ni efectos sobre el `<img>`.
 *   - **Proporción intacta**: se fija el alto y el ancho va en `auto`.
 *   - **Alto mínimo de 40px** en pantalla.
 *   - **Espacio libre de un cuarto del alto** alrededor. El SVG de Apple, a
 *     diferencia del PNG de Google, no lo trae adentro, así que lo pone el
 *     padding del link.
 *
 * El tracking es del que lo usa, igual que en el de Google: mismo badge, y
 * cada contexto registra su propio evento. Lo que sí hace siempre es el flush
 * de la cola, porque el click se lleva la página.
 */

/** Las del archivo oficial. No tocar sin reemplazar el archivo. */
const BADGE_W = 119.66407
const BADGE_H = 40

export interface AppStoreBadgeProps {
  /** Alto CSS del dibujo, sin el espacio libre. No bajar de 40px. */
  alto: number
  onClick: () => void
  /** La marca de campaña del link. Por defecto, la del sitio (`web`). */
  marca?: MarcaTienda
}

export function AppStoreBadge({ alto, onClick, marca }: AppStoreBadgeProps) {
  return (
    <a
      href={appStoreUrl(marca)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Descárgalo en el App Store"
      onClick={onClick}
      className="inline-block transition-opacity hover:opacity-85"
      style={{ padding: `${alto / 4}px` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/app-store-badge.svg"
        alt="Descárgalo en el App Store"
        width={BADGE_W}
        height={BADGE_H}
        style={{ height: `${alto}px`, width: 'auto', display: 'block' }}
      />
    </a>
  )
}
