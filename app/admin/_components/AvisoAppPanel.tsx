'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Eye, Download, Globe, MinusCircle } from 'lucide-react'
import type { AvisoAppResumen } from '@/app/api/admin/aviso-app/route'
import { VENTANAS, VENTANA_POR_DEFECTO, type Ventana } from '@/lib/metricas-ventanas'

/**
 * El aviso de pantalla completa para bajar la app (celular, una vez por
 * visita). Datos de `/api/admin/aviso-app`; eventos `aviso_app_*`.
 *
 * Los porcentajes son sobre las veces que se mostró. "Sin respuesta" es la
 * gente que se fue o recargó sin tocar ningún botón. Lo que pasa en la tienda
 * (si instaló) no se ve desde acá: eso está en Google Play y App Store Connect,
 * con la campaña `aviso` (Play) y `aviso-web` (Apple).
 */

const numero = (n: number) => n.toLocaleString('es-AR')
const pct = (n: number, de: number) => (de > 0 ? `${Math.round((n / de) * 1000) / 10}%` : '—')

function Tile({ icono, label, valor, detalle }: { icono: React.ReactNode; label: string; valor: string; detalle: string }) {
  return (
    <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] p-4">
      <div className="flex items-center gap-1.5 text-[#A0A0B0] mb-2">
        {icono}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-black tabular-nums text-white">{valor}</p>
      <p className="text-[10px] text-[#A0A0B0] mt-1">{detalle}</p>
    </div>
  )
}

export function AvisoAppPanel({ recarga = 0 }: { recarga?: number }) {
  const [dias, setDias] = useState<Ventana>(VENTANA_POR_DEFECTO)
  const [datos, setDatos] = useState<AvisoAppResumen | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async (ventana: Ventana) => {
    setCargando(true)
    try {
      const r = await fetch(`/api/admin/aviso-app?dias=${ventana}`, { cache: 'no-store' })
      setDatos(r.ok ? ((await r.json()) as AvisoAppResumen) : null)
    } catch {
      setDatos(null)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar(dias) }, [dias, cargar, recarga])

  const m = datos?.mostrado.veces ?? 0
  const sinRespuesta = datos ? Math.max(0, m - datos.descargar.veces - datos.seguirWeb.veces) : 0
  const maxDia = Math.max(1, ...(datos?.serie.map(f => f.mostrado) ?? [0]))

  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-white">Aviso de la app (celular)</h2>
        <div className="flex rounded-lg border border-[#2A2A3A] overflow-hidden shrink-0">
          {VENTANAS.map(opcion => (
            <button
              key={opcion}
              type="button"
              onClick={() => setDias(opcion)}
              aria-pressed={dias === opcion}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                dias === opcion ? 'bg-[#FFFD02] text-[#0A0A0F]' : 'text-[#A0A0B0] hover:text-white hover:bg-[#1C1C27]'
              }`}
            >
              {opcion} días
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-[#A0A0B0] mb-5">
        Pantalla completa en Android y iPhone, una vez por visita, sin bots
        {datos?.desde && <> · desde el {new Date(`${datos.desde}T12:00:00`).toLocaleDateString('es-AR')}</>}
        {' · '}se actualiza cada hora
      </p>

      {cargando ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-[#FFFD02]" /></div>
      ) : !datos ? (
        <p className="text-sm text-[#A0A0B0] py-6 text-center">No se pudieron traer los datos.</p>
      ) : m === 0 ? (
        <p className="text-sm text-[#A0A0B0] py-6 text-center">Todavía no se mostró en esta ventana.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Tile icono={<Eye size={13} />} label="Se mostró" valor={numero(m)}
              detalle={`${numero(datos.mostrado.personas)} personas-día`} />
            <Tile icono={<Download size={13} />} label="Descargar la app" valor={numero(datos.descargar.veces)}
              detalle={`${pct(datos.descargar.veces, m)} de las veces · fue a la tienda`} />
            <Tile icono={<Globe size={13} />} label="Seguir en la web" valor={numero(datos.seguirWeb.veces)}
              detalle={`${pct(datos.seguirWeb.veces, m)} de las veces`} />
            <Tile icono={<MinusCircle size={13} />} label="Sin respuesta" valor={numero(sinRespuesta)}
              detalle={`${pct(sinRespuesta, m)} · se fue o recargó sin tocar`} />
          </div>

          <div className="overflow-x-auto mb-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#A0A0B0] text-left">
                  <th className="font-semibold py-1.5">Tienda</th>
                  <th className="font-semibold py-1.5 text-right">Se mostró</th>
                  <th className="font-semibold py-1.5 text-right">Descargar</th>
                  <th className="font-semibold py-1.5 text-right">Seguir en la web</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {([['play_store', 'Android · Google Play'], ['app_store', 'iPhone · App Store']] as const).map(([k, nombre]) => {
                  const t = datos.porTienda[k]
                  return (
                    <tr key={k} className="border-t border-[#2A2A3A] text-white">
                      <td className="py-2">{nombre}</td>
                      <td className="py-2 text-right">{numero(t.mostrado)}</td>
                      <td className="py-2 text-right">{numero(t.descargar)} <span className="text-[#FFFD02]">{pct(t.descargar, t.mostrado)}</span></td>
                      <td className="py-2 text-right">{numero(t.seguirWeb)} <span className="text-[#A0A0B0]">{pct(t.seguirWeb, t.mostrado)}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Por día: la barra gris es cuántas veces se mostró; la amarilla, cuántas tocaron "Descargar". */}
          <div>
            <p className="text-[11px] text-[#A0A0B0] mb-2">Por día — gris: se mostró · amarillo: descargar</p>
            <div className="flex items-end gap-1 h-24">
              {datos.serie.map(f => (
                <div key={f.dia} className="flex-1 h-full flex flex-col justify-end relative group" title={`${f.dia}: ${f.mostrado} mostrado, ${f.descargar} descargar, ${f.seguirWeb} web`}>
                  <div className="w-full rounded-t bg-[#2A2A3A]" style={{ height: `${(f.mostrado / maxDia) * 100}%` }} />
                  <div className="absolute bottom-0 inset-x-0 rounded-t bg-[#FFFD02]" style={{ height: `${(f.descargar / maxDia) * 100}%` }} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
