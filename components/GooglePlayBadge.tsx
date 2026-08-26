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
 *     transparente el dibujo queda cerca de 47px. Con aire sobre el mínimo.
 *
 * Si algún día hay que cambiarlo, se baja de nuevo el oficial; no se edita este
 * PNG.
 */

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.glynbox.app'

/** Las del archivo oficial. No tocar sin reemplazar el archivo. */
const BADGE_W = 646
const BADGE_H = 250

export function GooglePlayBadge() {
  const pathname = usePathname()

  return (
    <a
      href={PLAY_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Conseguilo en Google Play"
      onClick={() => {
        // `path` porque el pie es idéntico en todo el sitio: sin eso no se sabe
        // desde qué pantalla salió el click.
        track('app_footer_clicked', { path: pathname ?? null })
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
        style={{ width: '180px', height: 'auto' }}
      />
    </a>
  )
}
