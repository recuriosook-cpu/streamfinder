'use client'

import { useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'

/**
 * Refresco de las pantallas del panel.
 *
 * Las pantallas piden los datos una vez al montarse. Con la pestaña abierta
 * todo el día, los números quedaban congelados en la hora en que se abrió, y
 * eso se leía como "las estadísticas no se actualizan".
 *
 * A propósito NO hay un intervalo: cada pedido es una invocación de función, y
 * una pestaña olvidada en segundo plano pediría datos que no mira nadie. Se
 * refresca cuando la pestaña vuelve al frente, y sólo si lo que muestra tiene
 * más de un minuto. El minuto es el caché del servidor de
 * `/api/admin/overview`: pedir antes devolvería lo mismo.
 */
const UMBRAL_MS = 60_000

/**
 * Llama a `recargar` cuando la pestaña vuelve a estar visible y la última
 * carga (`actualizadoEn`) tiene más de un minuto.
 *
 * `recargar` va por ref: las pantallas le pasan su función de carga tal cual,
 * que cierra sobre los filtros del render actual, y el listener tiene que
 * llamar a la última versión sin volver a suscribirse en cada render.
 */
export function useRefrescoAlVolver(recargar: () => void, actualizadoEn: Date | null) {
  const recargarRef = useRef(recargar)
  const actualizadoRef = useRef(actualizadoEn)
  useEffect(() => {
    recargarRef.current = recargar
    actualizadoRef.current = actualizadoEn
  })

  useEffect(() => {
    function alCambiar() {
      if (document.visibilityState !== 'visible') return
      const ultima = actualizadoRef.current
      // Sin carga previa terminada no se dispara: la inicial está en curso.
      if (!ultima || Date.now() - ultima.getTime() < UMBRAL_MS) return
      recargarRef.current()
    }
    document.addEventListener('visibilitychange', alCambiar)
    return () => document.removeEventListener('visibilitychange', alCambiar)
  }, [])
}

function hora(d: Date): string {
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Botón "Actualizar" con la hora de la última carga al lado. */
export function RefrescoControl({
  actualizadoEn,
  cargando,
  onActualizar,
}: {
  actualizadoEn: Date | null
  cargando: boolean
  onActualizar: () => void
}) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      {actualizadoEn && (
        <span className="text-xs text-zinc-500 tabular-nums">
          Actualizado a las {hora(actualizadoEn)}
        </span>
      )}
      <button
        type="button"
        onClick={onActualizar}
        disabled={cargando}
        className="flex items-center gap-1.5 rounded-lg border border-[#2A2A3A] px-3 py-1.5 text-xs font-semibold text-[#A0A0B0] hover:text-white hover:border-[#3A3A4A] transition-colors disabled:opacity-40"
      >
        <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} />
        Actualizar
      </button>
    </div>
  )
}
