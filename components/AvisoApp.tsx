'use client'

import { useEffect, useRef } from 'react'
import { Bell, Layers } from 'lucide-react'
import { flushAnalytics, track } from '@/lib/analytics'
import { MARCA_AVISO, urlDeTienda, type Tienda } from '@/lib/tiendas'

/**
 * El aviso de pantalla completa para bajar la app, en Android y iPhone. Lo
 * monta `AvisoAppGate`, que decide cuándo (una vez por visita, nunca a un
 * buscador ni dentro de la app); acá sólo se dibuja y se mide.
 *
 * Eventos: `aviso_app_mostrado`, `aviso_app_descargar`, `aviso_app_seguir_web`,
 * todos con `{ tienda, entrada }`. Los cuenta el panel de Métricas.
 */

export interface AvisoAppProps {
  tienda: Tienda
  /** `buscador`: llegó desde Google o Bing y el aviso le sale en la segunda página. */
  entrada: 'directa' | 'buscador'
  onClose: () => void
}

const NOMBRE_TIENDA: Record<Tienda, string> = { app_store: 'el App Store', play_store: 'Google Play' }

export default function AvisoApp({ tienda, entrada, onClose }: AvisoAppProps) {
  const caja = useRef<HTMLDivElement>(null)
  const medido = useRef(false)

  useEffect(() => {
    if (!medido.current) {
      medido.current = true
      track('aviso_app_mostrado', { tienda, entrada })
    }
    // Sin scroll de fondo mientras está abierto.
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // El foco al aviso (no al botón: se dibujaría el anillo de foco apenas abre).
    caja.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') seguirEnLaWeb() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = antes
      window.removeEventListener('keydown', onKey)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function descargar() {
    track('aviso_app_descargar', { tienda, entrada })
    flushAnalytics()
    // El link sigue solo a la tienda. Se cierra igual: en iPhone el App Store
    // se abre aparte y al volver a Safari el aviso ya no tiene que estar.
    setTimeout(onClose, 300)
  }

  function seguirEnLaWeb() {
    track('aviso_app_seguir_web', { tienda, entrada })
    onClose()
  }

  return (
    <div
      ref={caja}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="aviso-app-titulo"
      className="fixed inset-0 z-[100] flex flex-col bg-[#0A0A0F] text-white outline-none"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[60%]"
        style={{ background: 'radial-gradient(ellipse 120% 70% at 50% 0%, rgba(255,253,2,0.16) 0%, rgba(255,253,2,0.04) 40%, rgba(10,10,15,0) 75%)' }}
      />

      <div className="relative flex flex-1 flex-col items-center justify-center px-7 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon-192.png"
          alt=""
          width={96}
          height={96}
          className="h-24 w-24 rounded-[26px] shadow-[0_12px_40px_rgba(255,253,2,0.18)] ring-1 ring-white/10"
        />
        <h2 id="aviso-app-titulo" className="mt-7 text-[1.9rem] font-bold leading-tight tracking-tight text-balance">
          Glynbox es mejor en la app
        </h2>

        <ul className="mt-7 w-full max-w-xs space-y-4 text-left">
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFFD02]/10 text-[#FFFD02]">
              <Bell size={18} />
            </span>
            <span className="text-[0.95rem] leading-snug text-[#C8C8D2]">
              Te avisamos cuando algo de tu lista llega a tus plataformas
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFFD02]/10 text-[#FFFD02]">
              <Layers size={18} />
            </span>
            <span className="text-[0.95rem] leading-snug text-[#C8C8D2]">
              Encontrá qué ver deslizando, en segundos
            </span>
          </li>
        </ul>
      </div>

      <div className="relative px-6 pb-6">
        <a
          href={urlDeTienda(tienda, MARCA_AVISO)}
          onClick={descargar}
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#FFFD02] text-[1.05rem] font-bold text-[#0A0A0F] active:scale-[0.98] transition-transform"
        >
          Descargar la app
        </a>
        <p className="mt-2 text-center text-xs text-[#A0A0B0]">Gratis en {NOMBRE_TIENDA[tienda]}</p>
        <button
          type="button"
          onClick={seguirEnLaWeb}
          className="mx-auto mt-4 block px-4 py-2 text-sm text-[#A0A0B0] underline-offset-4 hover:text-white hover:underline"
        >
          Seguir en la web
        </button>
      </div>
    </div>
  )
}
