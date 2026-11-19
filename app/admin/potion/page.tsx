'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { PotionTablero } from '@/lib/potion-tablero'
import { RefrescoControl, useRefrescoAlVolver } from '@/app/admin/_components/Refresco'
import { Jugadores, Prueba, ErrorTablero } from './_partes/Tablero'
import { Analisis } from './_partes/Analisis'
import { DesdeGlynbox } from './_partes/DesdeGlynbox'

/**
 * Potion Bottle: Water Sort, en tres pestañas.
 *
 *   - Jugadores: lo de todos los días. Descargas, cuántos lo tienen, quién
 *     jugó hoy y en la semana (Android e iPhone por separado, cada número
 *     con la fecha de su último dato), alertas y el listado de jugadores
 *     reales. Sale de `/api/admin/potion/tablero` (`lib/potion-tablero.ts`).
 *   - Prueba y robots: los aparatos que no cuentan, con el porqué. No se
 *     borra nada; se pueden pasar de una pestaña a la otra.
 *   - Análisis: lo que era el panel hasta el 16/11 (retención, niveles,
 *     ganancia, Google Play). Todavía cuenta a los de prueba.
 *
 * Regla: un dato que no se pudo leer dice "sin dato" y por qué, nunca 0.
 */

type Pestana = 'jugadores' | 'prueba' | 'analisis'

export default function PotionPage() {
  const [pestana, setPestana] = useState<Pestana>('jugadores')
  const [t, setT] = useState<PotionTablero | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null)
  const pedido = useRef(0)

  const cargar = useCallback(async () => {
    const este = ++pedido.current
    setCargando(true)
    try {
      const res = await fetch('/api/admin/potion/tablero', { cache: 'no-store' })
      if (!res.ok) throw new Error(res.status === 401 ? 'No autorizado.' : `El servidor contestó ${res.status}.`)
      const json: PotionTablero = await res.json()
      if (este !== pedido.current) return
      setT(json)
      setError(null)
      setActualizadoEn(new Date())
    } catch (e) {
      if (este !== pedido.current) return
      // Lo que ya estaba en pantalla queda; arriba dice que no se pudo actualizar.
      setError(`No se pudo cargar el tablero: ${e instanceof Error ? e.message : 'error desconocido'}`)
    } finally {
      if (este === pedido.current) setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])
  useRefrescoAlVolver(cargar, actualizadoEn)

  const mover = useCallback(async (id: string, clase: 'prueba' | 'real' | null) => {
    const res = await fetch('/api/admin/potion/aparatos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, clase }),
    })
    if (!res.ok) {
      setError('No se pudo mover el aparato. Probá de nuevo.')
      return
    }
    await cargar()
  }, [cargar])

  const pestanas: { id: Pestana; texto: string }[] = [
    { id: 'jugadores', texto: 'Jugadores' },
    { id: 'prueba', texto: `Prueba y robots${t ? ` · ${t.prueba.length}` : ''}` },
    { id: 'analisis', texto: 'Análisis' },
  ]

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-[#13131A] border-b border-[#2A2A3A] px-4 sm:px-6 pt-4 sm:pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/potion-icono.png" alt="" width={40} height={40} className="w-10 h-10 rounded-xl shrink-0" />
            <div>
              <h1 className="text-xl font-bold text-white">Potion Bottle</h1>
              <p className="text-sm text-[#A0A0B0] mt-0.5">Water Sort · cómo le va al juego</p>
            </div>
          </div>
          {pestana !== 'analisis' && (
            <RefrescoControl actualizadoEn={actualizadoEn} cargando={cargando} onActualizar={() => void cargar()} />
          )}
        </div>
        <nav className="flex gap-1 mt-4 -mb-px overflow-x-auto" aria-label="Secciones">
          {pestanas.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPestana(p.id)}
              aria-current={pestana === p.id ? 'page' : undefined}
              className={`px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                pestana === p.id ? 'border-[#FFFD02] text-white' : 'border-transparent text-[#A0A0B0] hover:text-white'
              }`}
            >
              {p.texto}
            </button>
          ))}
        </nav>
      </div>

      <div className="px-4 sm:px-6 py-5 sm:py-6 max-w-6xl space-y-5">
        {error && <ErrorTablero texto={error} />}

        {pestana === 'analisis' ? (
          <Analisis />
        ) : !t ? (
          cargando && (
            <div className="py-16 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-[#FFFD02]" />
            </div>
          )
        ) : (
          <div className={`transition-opacity ${cargando ? 'opacity-60' : ''}`}>
            {pestana === 'jugadores' ? (
              <div className="space-y-5">
                <Jugadores t={t} onMover={mover} />
                <DesdeGlynbox recarga={actualizadoEn} />
              </div>
            ) : <Prueba t={t} onMover={mover} />}
          </div>
        )}
      </div>
    </div>
  )
}
