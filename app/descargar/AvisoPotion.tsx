'use client'

import { useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import type { Dispositivo } from '@/lib/device'

/**
 * El aviso de Potion Bottle al pie de la primera pantalla de `/descargar`.
 *
 * La sección del juego (`SeccionPotion`) vive debajo de la pantalla de
 * Glynbox, que ocupa el alto completo, así que en el celular nadie sabía que
 * existía. Esto la anuncia sin competir con el botón principal:
 *
 *   - Una tira chica y apagada —texto gris, fondo casi transparente, sin
 *     amarillo— con la cara del profesor. Al tocarla baja suavemente hasta la
 *     sección; NO abre la tienda: la decisión de instalar se toma allá, con el
 *     banner a la vista.
 *   - Una flechita con un vaivén lento que se va apenas la persona empieza a
 *     bajar. Ya cumplió: avisó que había algo más. Si vuelve arriba no
 *     reaparece, porque ya lo sabe.
 *
 * La tira es un `<a href="#potion">` y no un botón: sin JavaScript (antes de
 * hidratar) igual salta a la sección, sólo que sin la animación.
 *
 * ── El contenedor que scrollea no es la ventana ────────────────────────────
 *
 * `/descargar` bloquea el scroll del body y scrollea su propio contenedor de
 * `100svh` (ver `DescargarClient`). Por eso la flecha escucha el `scroll` de
 * ese contenedor, que encuentra subiendo por el DOM, y no el de `window`, que
 * nunca se mueve.
 */
export function AvisoPotion({ dispositivo }: { dispositivo: Dispositivo }) {
  const raiz = useRef<HTMLDivElement>(null)
  const [bajo, setBajo] = useState(false)

  useEffect(() => {
    const contenedor = raiz.current?.closest<HTMLElement>('[data-scroll-descargar]')
    if (!contenedor) return
    const alScrollear = () => {
      if (contenedor.scrollTop > 8) {
        setBajo(true)
        contenedor.removeEventListener('scroll', alScrollear)
      }
    }
    contenedor.addEventListener('scroll', alScrollear, { passive: true })
    alScrollear()
    return () => contenedor.removeEventListener('scroll', alScrollear)
  }, [])

  const irALaSeccion = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const seccion = document.getElementById('potion')
    track('descargar_potion_clicked', { dispositivo, destino: 'seccion', desde: 'tira' })
    if (!seccion) return
    e.preventDefault()
    let suave = true
    try { suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* silencio */ }
    seccion.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })
  }

  return (
    <div ref={raiz} className="relative z-10 flex shrink-0 flex-col items-center px-6 pb-4 sm:pb-6">
      <a
        href="#potion"
        onClick={irALaSeccion}
        className="inline-flex max-w-full items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-4 text-[0.8125rem] leading-tight text-[#A0A0B0] transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/potion-bottle/profesor-96.webp"
          alt=""
          width={96}
          height={96}
          className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/15"
        />
        <span>
          ¿Te gustan los juegos? <span className="text-[#D0D0DC]">Probá Potion Bottle</span>{' '}
          <span aria-hidden="true">↓</span>
        </span>
      </a>

      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`mt-2 text-[#6B6B7B] transition-opacity duration-300 ${bajo ? 'opacity-0' : ''}`}
      >
        <g className="flecha-abajo">
          <path d="M6 9l6 6 6-6" />
        </g>
      </svg>
    </div>
  )
}
