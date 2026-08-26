'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { track, flushAnalytics } from '@/lib/analytics'

/**
 * La barra de descarga propiamente dicha.
 *
 * Este módulo **no se importa de forma estática en ningún lado**. Lo carga
 * `AppDownloadBarGate` con un `import()` dinámico, y recién después de que se
 * cumplieron todas las condiciones: celular, primera vez, fuera de la app, y
 * pasaron los 7 segundos. En escritorio este chunk no se pide nunca. El porqué
 * está explicado en el gate.
 *
 * Todo lo que decide *si* la barra existe vive allá. Acá adentro solo está
 * cómo se ve y cómo se comporta una vez que ya se decidió mostrarla.
 *
 * ── Por qué es una barra y no un modal ─────────────────────────────────────
 *
 * Google penaliza en resultados de búsqueda móvil los intersticiales que tapan
 * el contenido. La regla real que aplican es sobre cuánto de la pantalla se
 * come y si se puede seguir leyendo abajo; un banner discreto y fácil de
 * descartar está explícitamente permitido.
 *
 * De ahí salen tres decisiones que no son cosméticas y conviene no revertir
 * sin pensarlo:
 *
 *   - Alto chico y contenido en una sola fila.
 *   - Nada de fondo oscurecido detrás ni de bloqueo del scroll: la página se
 *     sigue leyendo y se sigue scrolleando con la barra puesta.
 *   - Mientras está, se le suma padding al `<body>` igual al alto real de la
 *     barra. Es fija, así que sin eso taparía los últimos píxeles de la página
 *     —el pie, justamente— y "no tapa contenido" dejaría de ser cierto. Se
 *     mide con `offsetHeight` en vez de hardcodear un número porque el texto
 *     puede cortar en dos líneas en pantallas angostas.
 */

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.glynbox.app'

/** Cuánto tarda en subir. Suave, sin rebote: no tiene que sobresaltar a nadie. */
const SLIDE_MS = 320
const SLIDE_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'

export interface AppDownloadBarProps {
  /**
   * Se llama cuando la barra se va, con el motivo.
   *
   * El gate la desmonta y no la vuelve a montar en toda la vida de la página;
   * lo de "nunca más en este navegador" ya lo resolvió él marcando el storage
   * antes de montarla. Ver el comentario allá sobre por qué se marca al
   * mostrar y no al cerrar.
   */
  onClose: (motivo: 'cerrar' | 'click') => void
}

export default function AppDownloadBar({ onClose }: AppDownloadBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null)

  /**
   * Arranca abajo y sube en el frame siguiente.
   *
   * Tiene que ser en dos pasos: si el elemento naciera ya con `translateY(0)`
   * no habría transición ninguna, porque el navegador no anima entre "no
   * existía" y un valor. El primer render lo pone fuera de pantalla, el
   * `requestAnimationFrame` cambia el estado, y esa segunda pintura sí es una
   * transición desde un valor anterior real.
   */
  const [visible, setVisible] = useState(false)

  /** Al irse baja de nuevo, y recién ahí el gate la desmonta. */
  const [leaving, setLeaving] = useState(false)

  // Un solo aviso de salida, pase lo que pase. Sin esto, tocar el botón y la X
  // casi al mismo tiempo dispararía dos eventos y dos `onClose`.
  const closedRef = useRef(false)

  /**
   * Se lee una vez, al inicializar el estado, y no en un efecto.
   *
   * Tiene que estar resuelto para la **primera** pintura: es el frame donde se
   * decide si hay transición o no. Un efecto corre después de esa pintura, así
   * que a quien pidió menos movimiento le llegaría igual el primer frame
   * animado. Y no puede ser un ref porque se lee durante el render.
   *
   * Este componente solo se monta desde un `import()` en el navegador, nunca en
   * el servidor, pero el guard de `window` queda igual: cuesta nada y evita que
   * mover este archivo de lugar rompa el build.
   */
  const [reducedMotion] = useState(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
    } catch {
      return false
    }
  })

  useEffect(() => {
    // El evento de impresión sale acá y no en el gate: el gate decide mostrarla,
    // este efecto confirma que se montó de verdad.
    track('app_banner_shown')

    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  /**
   * Padding al `<body>` mientras la barra está puesta, para no tapar el pie.
   *
   * Se guarda el valor anterior y se restaura al desmontar en vez de escribir
   * `''` a lo bruto: hoy nadie más toca ese estilo inline, pero restaurar lo
   * que había es lo correcto y cuesta una línea.
   */
  useEffect(() => {
    const el = barRef.current
    if (!el) return

    const previo = document.body.style.paddingBottom
    try {
      document.body.style.paddingBottom = `${el.offsetHeight}px`
    } catch { /* silencio */ }

    return () => {
      try { document.body.style.paddingBottom = previo } catch { /* silencio */ }
    }
  }, [])

  const cerrar = useCallback((motivo: 'cerrar' | 'click') => {
    if (closedRef.current) return
    closedRef.current = true

    if (motivo === 'cerrar') {
      track('app_banner_dismissed')
    } else {
      track('app_banner_clicked')
      // El click se lleva la página a Play Store. `track()` encola y manda de a
      // lotes cada 5 segundos, así que sin esto el evento más importante de los
      // tres es justo el que se pierde. `flushAnalytics` usa `sendBeacon`, que
      // es lo único que el navegador garantiza que sale con la página muriendo.
      flushAnalytics()
    }

    setLeaving(true)

    setTimeout(() => onClose(motivo), reducedMotion ? 0 : SLIDE_MS)
  }, [onClose, reducedMotion])

  const escondida = !visible || leaving

  return (
    <div
      ref={barRef}
      role="complementary"
      aria-label="Descargar la app de Glynbox"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#2A2A3A] bg-[#12121A]/95 backdrop-blur-sm md:hidden"
      style={{
        // El translate de salida usa píxeles de más para que el borde superior
        // y la sombra también salgan de cuadro.
        transform: escondida ? 'translateY(calc(100% + 8px))' : 'translateY(0)',
        transition: reducedMotion ? 'none' : `transform ${SLIDE_MS}ms ${SLIDE_EASE}`,
        // Los teléfonos con gesto de home tienen barra propia abajo. Sin esto la
        // X y el botón quedan justo debajo de ella y no se pueden tocar.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.35)',
      }}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt=""
          aria-hidden="true"
          width={40}
          height={40}
          className="h-10 w-10 flex-shrink-0 rounded-[9px]"
        />

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight text-white">
            Glynbox va mejor en la app
          </p>
          <p className="mt-0.5 text-[11px] leading-tight text-[#A0A0B0]">
            Bajala gratis y llevate tus listas al celular.
          </p>
        </div>

        <a
          href={PLAY_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => cerrar('click')}
          className="flex-shrink-0 rounded-full bg-[#FFFD02] px-4 py-2 text-[13px] font-semibold text-[#0A0A0F] transition-opacity active:opacity-80"
        >
          Bajar
        </a>

        {/*
          40x40 y no un ícono de 16: es el área de toque mínima que recomienda
          Google para móvil. Una X chiquita al lado de un botón amarillo grande
          es la forma clásica de que la gente toque el botón sin querer, y eso
          convierte un cierre en un click en la métrica.
        */}
        <button
          type="button"
          onClick={() => cerrar('cerrar')}
          aria-label="Cerrar"
          className="-mr-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[#A0A0B0] transition-colors active:bg-[#2A2A3A] active:text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
