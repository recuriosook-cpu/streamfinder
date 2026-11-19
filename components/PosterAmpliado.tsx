'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useIdioma } from '@/components/useIdioma'

/**
 * El póster de la ficha, que al tocarlo se abre a pantalla completa (TMDB w780)
 * sobre fondo oscuro. Mismo comportamiento que la app (glynbox-mobile,
 * `src/components/detail/PosterAmpliado.tsx`).
 *
 * El póster de la página no cambia: llega como `children`, tal cual lo arma el
 * servidor (misma imagen, mismo `alt`), y encima va un botón transparente. El
 * ampliado se arma recién al abrirlo: no suma nada al HTML para Google.
 *
 * Mientras carga el w780 se ve la miniatura que ya está en la página (la misma
 * URL, así que sale del cache del navegador). Se cierra con la X, tocando
 * afuera, con Escape o deslizando hacia abajo en el celular, donde también se
 * hace zoom con dos dedos.
 */
export default function PosterAmpliado({
  posterPath,
  titulo,
  className,
  children,
}: {
  posterPath: string
  titulo: string
  /** Las clases del contenedor del póster (el mismo `div` de antes). */
  className: string
  children: ReactNode
}) {
  const contenedor = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const [miniatura, setMiniatura] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)
  const en = useIdioma() === 'en'

  const abrir = () => {
    setMiniatura(contenedor.current?.querySelector('img')?.currentSrc || null)
    setAbierto(true)
  }
  const cerrar = useCallback(() => {
    setAbierto(false)
    // El foco vuelve al póster, como en cualquier diálogo.
    boton.current?.focus()
  }, [])

  return (
    <div ref={contenedor} className={className}>
      {children}
      <button
        ref={boton}
        type="button"
        onClick={abrir}
        aria-label={en ? `View full-size poster of ${titulo}` : `Ampliar el póster de ${titulo}`}
        aria-haspopup="dialog"
        className="absolute inset-0 cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFD02]"
      />
      {abierto && createPortal(
        <Visor
          src={`https://image.tmdb.org/t/p/w780${posterPath}`}
          miniatura={miniatura}
          titulo={titulo}
          onCerrar={cerrar}
        />,
        document.body,
      )}
    </div>
  )
}

const ZOOM_MAX = 4
/** Cuánto hay que deslizar hacia abajo para cerrar. */
const UMBRAL_CIERRE = 110

type Gesto =
  | { tipo: 'pinza'; dist0: number; escala0: number; medio0: { x: number; y: number }; x0: number; y0: number }
  | { tipo: 'arrastre'; px: number; py: number; x0: number; y0: number }
  | null

function distancia(t: TouchEvent['touches']): number {
  return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
}

function medio(t: TouchEvent['touches']): { x: number; y: number } {
  return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 }
}

function Visor({
  src,
  miniatura,
  titulo,
  onCerrar,
}: {
  src: string
  miniatura: string | null
  titulo: string
  onCerrar: () => void
}) {
  const [cargada, setCargada] = useState(false)
  const [vista, setVista] = useState({ escala: 1, x: 0, y: 0 })
  /** Desplazamiento hacia abajo para cerrar (sólo sin zoom). */
  const [bajada, setBajada] = useState(0)
  const [animando, setAnimando] = useState(false)
  const gesto = useRef<Gesto>(null)
  const cerrarBtn = useRef<HTMLButtonElement>(null)
  const en = useIdioma() === 'en'

  // Escape cierra; la página de atrás no scrollea mientras está abierto.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', tecla)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cerrarBtn.current?.focus()
    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
    }
  }, [onCerrar])

  const empezar = (e: TouchEvent) => {
    setAnimando(false)
    if (e.touches.length >= 2) {
      gesto.current = { tipo: 'pinza', dist0: distancia(e.touches), escala0: vista.escala, medio0: medio(e.touches), x0: vista.x, y0: vista.y }
    } else if (e.touches.length === 1) {
      gesto.current = { tipo: 'arrastre', px: e.touches[0].clientX, py: e.touches[0].clientY, x0: vista.x, y0: vista.y }
    }
  }

  const mover = (e: TouchEvent) => {
    const g = gesto.current
    if (!g) return
    if (g.tipo === 'pinza' && e.touches.length >= 2) {
      const escala = Math.min(ZOOM_MAX, Math.max(1, g.escala0 * (distancia(e.touches) / g.dist0)))
      const m = medio(e.touches)
      setVista({ escala, x: g.x0 + (m.x - g.medio0.x), y: g.y0 + (m.y - g.medio0.y) })
    } else if (g.tipo === 'arrastre' && e.touches.length === 1) {
      const dx = e.touches[0].clientX - g.px
      const dy = e.touches[0].clientY - g.py
      if (vista.escala > 1) setVista(v => ({ ...v, x: g.x0 + dx, y: g.y0 + dy }))
      else setBajada(Math.max(0, dy))
    }
  }

  const terminar = (e: TouchEvent) => {
    const g = gesto.current
    // Se levantó un dedo de la pinza: sigue como arrastre con el que queda.
    if (g?.tipo === 'pinza' && e.touches.length === 1) {
      gesto.current = { tipo: 'arrastre', px: e.touches[0].clientX, py: e.touches[0].clientY, x0: vista.x, y0: vista.y }
      return
    }
    if (e.touches.length > 0) return
    gesto.current = null
    setAnimando(true)
    if (vista.escala <= 1.05) setVista({ escala: 1, x: 0, y: 0 })
    if (bajada > UMBRAL_CIERRE) { onCerrar(); return }
    setBajada(0)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={en ? `${titulo} poster` : `Póster de ${titulo}`}
      // Tocar afuera del póster cierra.
      onClick={e => { if (e.target === e.currentTarget) onCerrar() }}
      onTouchStart={empezar}
      onTouchMove={mover}
      onTouchEnd={terminar}
      onTouchCancel={terminar}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 overscroll-contain"
      // Los gestos los maneja esto, no el navegador (sin scroll ni zoom de la página).
      style={{ touchAction: 'none', backgroundColor: `rgba(0,0,0,${0.92 * Math.max(0.3, 1 - bajada / 400)})` }}
    >
      <button
        ref={cerrarBtn}
        type="button"
        onClick={onCerrar}
        aria-label={en ? 'Close' : 'Cerrar'}
        className="absolute top-3 right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFD02]"
      >
        <X size={24} />
      </button>

      <div
        onClick={e => { if (e.target === e.currentTarget) onCerrar() }}
        className="relative"
        style={{
          width: 'min(92vw, calc(88vh * 2 / 3))',
          aspectRatio: '2 / 3',
          transform: `translate(${vista.x}px, ${vista.y + bajada}px) scale(${vista.escala})`,
          transition: animando ? 'transform 200ms ease-out' : 'none',
        }}
      >
        {/* <img> y no next/image: es un visor que se arma al abrirlo, con la
            URL de TMDB directa (w780) y la miniatura que ya está en cache. */}
        {/* Queda abajo aunque cargue el grande: así el fundido no parpadea. */}
        {miniatura && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={miniatura} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full rounded-lg object-contain" draggable={false} />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={en ? `${titulo} poster` : `Póster de ${titulo}`}
          onLoad={() => setCargada(true)}
          draggable={false}
          className={`absolute inset-0 h-full w-full rounded-lg object-contain select-none transition-opacity duration-200 ${cargada ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>
    </div>
  )
}
