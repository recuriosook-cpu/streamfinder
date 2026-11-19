'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MousePointerClick, Info } from 'lucide-react'
import type { DescargarPotion, ToqueDescargar } from '@/lib/potion-descargar'
import type { Jugador } from '@/lib/potion-tablero'
import { numero, diaCorto, TablaDeslizable } from './piezas'

/**
 * Cuántas personas tocaron el juego en glynbox.com/descargar: el banner o
 * "Jugar" de la sección, los badges de la computadora o la tira de arriba.
 * Por día y por aparato. Sale de `/api/admin/potion/descargar`.
 *
 * Se pide aparte del tablero: si esto falla, el resto de la pestaña sigue.
 * `recarga` cambia cuando la página se actualiza, para pedirlo de nuevo.
 */
/** Cuánto después del toque puede empezar a jugar alguien para contarlo. */
const VENTANA_CRUCE_MS = 3 * 3600_000

/**
 * Cuántos de los que tocaron pueden haber terminado jugando. No hay un hilo
 * que una el toque con la instalación (la tienda no pasa nada al juego), así
 * que es un cruce: un toque de Android o iPhone se queda con un jugador real
 * nuevo del mismo aparato que empezó dentro de las 3 horas siguientes y, si
 * los dos tienen país, del mismo país. Cada jugador se usa una vez. Es un
 * techo: ese jugador pudo haber llegado por otro lado.
 */
function cruzar(toques: ToqueDescargar[], reales: Jugador[]): Map<string, number> {
  const usados = new Set<string>()
  const porDia = new Map<string, number>()
  const ordenados = toques.filter(t => t.aparato !== 'desktop').sort((a, b) => (a.en < b.en ? -1 : 1))
  for (const t of ordenados) {
    const desde = Date.parse(t.en)
    const j = reales
      .filter(r => r.plataforma === t.aparato && !usados.has(r.id))
      .filter(r => { const d = Date.parse(r.desde); return d >= desde && d <= desde + VENTANA_CRUCE_MS })
      .filter(r => !t.pais || !r.pais || r.pais === t.pais)
      .sort((a, b) => (a.desde < b.desde ? -1 : 1))[0]
    if (!j) continue
    usados.add(j.id)
    porDia.set(t.dia, (porDia.get(t.dia) ?? 0) + 1)
  }
  return porDia
}

export function DesdeGlynbox({ recarga, reales }: { recarga: unknown; reales: Jugador[] }) {
  const [datos, setDatos] = useState<DescargarPotion | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/potion/descargar', { cache: 'no-store' })
      if (!res.ok) throw new Error(`el servidor contestó ${res.status}`)
      setDatos(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error desconocido')
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar, recarga])

  const cabecera = (
    <div className="flex items-center gap-2 mb-1">
      <span className="w-8 h-8 rounded-lg bg-[#FFFD02]/10 text-[#FFFD02] flex items-center justify-center shrink-0">
        <MousePointerClick size={16} />
      </span>
      <h2 className="text-sm font-semibold text-white leading-tight">Lo tocaron en glynbox.com/descargar</h2>
    </div>
  )

  if (error || (datos && !datos.disponible)) {
    return (
      <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4">
        {cabecera}
        <p className="text-sm text-amber-400 mt-2">
          sin dato · {error ? `no se pudo leer: ${error}` : 'la consulta a los eventos de Glynbox falló'}
        </p>
      </section>
    )
  }

  if (!datos) {
    return (
      <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4">
        {cabecera}
        <div className="py-6 flex justify-center"><Loader2 size={20} className="animate-spin text-[#FFFD02]" /></div>
      </section>
    )
  }

  const v = datos.ventana
  const jugaron = cruzar(datos.toques ?? [], reales)
  const jugaronTotal = [...jugaron.values()].reduce((a, b) => a + b, 0)
  const d = datos.descartados ?? { automaticas: 0, admin: 0, propios: 0 }
  const fuera = d.automaticas + d.admin + d.propios
  const desde = datos.medidoDesde && datos.medidoDesde > datos.inicioVentana ? datos.medidoDesde : datos.inicioVentana

  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4">
      {cabecera}
      <p className="text-[11px] text-zinc-500 mb-3 sm:ml-10">
        Personas que tocaron &quot;Jugar&quot;, el banner o la tira de Potion. Por día de Argentina, más nuevo arriba.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 sm:ml-10">
        <div>
          <p className="text-[11px] font-semibold text-white">Tocaron (personas)</p>
          <p className="text-2xl font-black text-white tabular-nums">{numero(datos.quedan ?? v.total)}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-[#FFFD02]">Pueden haber jugado</p>
          <p className="text-2xl font-black text-white tabular-nums">{numero(jugaronTotal)}</p>
          <p className="text-[11px] text-zinc-500 leading-snug">como mucho, cruzando con el juego</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[11px] font-semibold text-zinc-400">Descartados</p>
          <p className="text-2xl font-black text-zinc-400 tabular-nums">{numero(fuera)}</p>
          <p className="text-[11px] text-zinc-500 leading-snug">
            {numero(d.automaticas)} pruebas automáticas · {numero(d.admin)} sesiones de admin · {numero(d.propios)} aparatos tuyos
          </p>
        </div>
      </div>

      {datos.dias.length === 0 ? (
        <p className="text-sm text-[#A0A0B0] py-4">Nadie lo tocó en los últimos 30 días.</p>
      ) : (
        <TablaDeslizable alto>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] text-right">
                <th className="text-left font-semibold py-1.5 pr-3">Día</th>
                <th className="font-semibold py-1.5 px-2 text-emerald-400">Android</th>
                <th className="font-semibold py-1.5 px-2 text-sky-400">iPhone</th>
                <th className="font-semibold py-1.5 px-2 text-violet-300">Compu</th>
                <th className="font-semibold py-1.5 pl-2 text-white">Total</th>
                <th className="font-semibold py-1.5 pl-3 normal-case tracking-normal text-zinc-500">por la tira</th>
                <th className="font-semibold py-1.5 pl-3 normal-case tracking-normal text-[#FFFD02]">jugaron?</th>
              </tr>
            </thead>
            <tbody>
              {datos.dias.map(d => (
                <tr key={d.dia} className={`border-t border-[#2A2A3A] text-right ${d.total === 0 ? 'text-zinc-600' : 'text-white'}`}>
                  <td className="text-left py-1.5 pr-3 text-[#A0A0B0]">{diaCorto(d.dia)}</td>
                  <td className="py-1.5 px-2">{numero(d.android)}</td>
                  <td className="py-1.5 px-2">{numero(d.ios)}</td>
                  <td className="py-1.5 px-2">{numero(d.desktop)}</td>
                  <td className="py-1.5 pl-2 font-bold">{numero(d.total)}</td>
                  <td className="py-1.5 pl-3 text-zinc-500">{numero(d.tira)}</td>
                  <td className="py-1.5 pl-3">{numero(jugaron.get(d.dia) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#2A2A3A] text-right text-white font-semibold">
                <td className="text-left py-2 pr-3 text-[#A0A0B0] font-normal">Desde el {diaCorto(desde)}</td>
                <td className="py-2 px-2">{numero(v.android)}</td>
                <td className="py-2 px-2">{numero(v.ios)}</td>
                <td className="py-2 px-2">{numero(v.desktop)}</td>
                <td className="py-2 pl-2 font-black">{numero(v.total)}</td>
                <td />
                <td className="py-2 pl-3">{numero(jugaronTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </TablaDeslizable>
      )}

      <p className="text-[11px] text-zinc-500 mt-3 flex items-start gap-1.5 leading-snug">
        <Info size={12} className="shrink-0 mt-0.5" />
        Una persona es un navegador (o una cuenta de Glynbox): si toca la tira y después &quot;Jugar&quot;, cuenta una vez.
        La fila de abajo es de personas distintas en todo el período, no la suma de los días. &quot;Por la tira&quot; dice
        cuántas de las del día llegaron tocando el aviso de arriba. Tocar no es instalar: en la compu sólo despliega
        los botones de las tiendas. No cuentan los robots, las pruebas automáticas, los navegadores que abrieron el
        admin ni tus aparatos (para marcar uno, abrí glynbox.com/descargar?propio=1 desde ese aparato).
        &quot;Jugaron?&quot; es un techo: un jugador real nuevo del mismo aparato (y país, si se sabe) que empezó a jugar
        dentro de las 3 horas siguientes al toque. Pudo haber llegado por otro lado.
        {datos.medidoDesde && datos.medidoDesde > datos.inicioVentana && <> Se mide desde el {diaCorto(datos.medidoDesde)}.</>}
      </p>
    </section>
  )
}
