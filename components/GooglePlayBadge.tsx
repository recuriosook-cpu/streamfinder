'use client'

import { usePathname } from 'next/navigation'
import { track, flushAnalytics } from '@/lib/analytics'

/**
 * El badge oficial de Google Play.
 *
 * ── Por qué el asset es de Google y no un botón nuestro ────────────────────
 *
 * Google publica el badge como material de marca con condiciones de uso, y
 * armar uno parecido a mano es justamente lo que no está permitido. Así que el
 * PNG de `public/google-play-badge.png` es el archivo oficial, bajado tal cual
 * de `play.google.com/intl/es-419_ALL/badges/`, en la variante es-419 que es la
 * que corresponde al público del sitio.
 *
 * Las condiciones que aplican acá, y cómo las cumple este componente:
 *
 *   - **No se modifica.** Ni recolorear, ni recortar, ni rotar, ni agregarle
 *     efectos. No hay una sola clase de Tailwind sobre el `<img>` que lo toque.
 *
 *   - **Proporción intacta.** El asset es 646×250. Se fija el ancho y la altura
 *     va en `auto`, así que la relación se mantiene sola. Los atributos
 *     `width`/`height` van con los números reales del archivo para que el
 *     navegador reserve el espacio y el pie no salte al cargar.
 *
 *   - **Espacio libre alrededor.** La regla es un margen igual a un cuarto del
 *     alto del badge. Esto ya viene resuelto en el propio archivo: el PNG
 *     oficial trae ese margen adentro como área transparente —de ahí que sea
 *     646×250 cuando el dibujo es más chico—, así que no hay que agregarle
 *     padding, y agregárselo tampoco rompería nada.
 *
 *   - **Tamaño mínimo.** El piso es 40px de alto para el badge. A 180px de
 *     ancho el archivo mide unos 70px de alto, y descontando el margen
 *     transparente el dibujo queda cerca de 54px. Con aire sobre el mínimo.
 *
 * Si algún día hay que cambiarlo, se baja de nuevo el oficial; no se edita este
 * PNG.
 *
 * ── Los dos lugares donde se usa ───────────────────────────────────────────
 *
 * Nació para el pie, y por eso ese sigue siendo el comportamiento por defecto:
 * sin props hace exactamente lo que hacía antes. Después lo empezó a usar
 * `/descargar`, donde el badge no es un adorno del pie sino el botón principal,
 * y ahí hacían falta dos cosas distintas —otro tamaño y otro evento—, que son
 * justo las dos props que acepta.
 *
 * Lo que NO es configurable, a propósito: el archivo, la proporción, el texto
 * alternativo y el destino. Todo eso es la parte que las condiciones de marca
 * fijan, y dejarlo abierto sería invitar a que un caller la rompa sin enterarse.
 */

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.glynbox.app'

/** Las del archivo oficial. No tocar sin reemplazar el archivo. */
const BADGE_W = 646
const BADGE_H = 250

/** El del pie, y el piso razonable para cualquier uso. Ver "Tamaño mínimo". */
const ANCHO_POR_DEFECTO = '180px'

export interface GooglePlayBadgeProps {
  /**
   * Ancho CSS del badge. La altura siempre va en `auto`: la proporción del
   * asset oficial no se toca.
   *
   * **No bajar de 180px.** El dibujo ocupa cerca del 30% del ancho en alto
   * (el resto del archivo es el margen transparente), así que a 180px quedan
   * unos 54px de badge dibujado y el piso de marca son 40px. Por debajo de
   * ~135px se estaría incumpliendo.
   */
  ancho?: string

  /**
   * Qué registrar al tocarlo.
   *
   * Por defecto manda `app_footer_clicked`, que es el evento del pie. Quien lo
   * use en otro contexto tiene que pasar el suyo: mezclar contextos en el mismo
   * nombre de evento volvería inútiles las dos métricas, que es exactamente lo
   * que el catálogo de `lib/analytics-events.ts` explica al separar
   * `app_footer_clicked` de `app_banner_clicked`.
   *
   * El `flushAnalytics` NO es responsabilidad del caller: lo hace este
   * componente siempre, porque el click se lleva la página a Play Store pase lo
   * que pase y la cola manda de a lotes cada 5 segundos.
   */
  onClick?: () => void
}

export function GooglePlayBadge({ ancho = ANCHO_POR_DEFECTO, onClick }: GooglePlayBadgeProps = {}) {
  const pathname = usePathname()

  return (
    <a
      href={PLAY_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Conseguilo en Google Play"
      onClick={() => {
        if (onClick) {
          onClick()
        } else {
          // `path` porque el pie es idéntico en todo el sitio: sin eso no se sabe
          // desde qué pantalla salió el click.
          track('app_footer_clicked', { path: pathname ?? null })
        }
        // El click se lleva la página a Play Store, y la cola de analytics
        // manda de a lotes cada 5 segundos. Sin el flush el evento se pierde.
        flushAnalytics()
      }}
      className="inline-block transition-opacity hover:opacity-85"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/google-play-badge.png"
        alt="Conseguilo en Google Play"
        width={BADGE_W}
        height={BADGE_H}
        style={{ width: ancho, height: 'auto' }}
      />
    </a>
  )
}
