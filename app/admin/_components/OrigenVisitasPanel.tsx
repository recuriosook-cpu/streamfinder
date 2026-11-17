'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { OrigenVisitasResumen } from '@/app/api/admin/origen-visitas/route'
import { VENTANAS, VENTANA_POR_DEFECTO, type Ventana } from '@/lib/metricas-ventanas'
import { NOMBRE_DE_ORIGEN } from '@/lib/origen-visitas'

/**
 * De dónde vienen las visitas web: por origen, cuántas entraron a
 * `/descargar` y cuántas tocaron el botón de la tienda. Datos de
 * `/api/admin/origen-visitas`.
 *
 * Una visita es una sesión de los eventos (30 minutos sin actividad abren
 * otra), sin bots, en celular y computadora. "Tienda" cuenta visitas, no
 * toques: la que tocó dos veces cuenta una.
 */

const numero = (n: number) => n.toLocaleString('es-AR')
const pct = (n: number, de: number) => (de > 0 ? `${Math.round((n / de) * 1000) / 10}%` : '—')

export function OrigenVisitasPanel({ recarga = 0 }: { recarga?: number }) {
  const [dias, setDias] = useState<Ventana>(VENTANA_POR_DEFECTO)
  const [datos, setDatos] = useState<OrigenVisitasResumen | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async (ventana: Ventana) => {
    setCargando(true)
    try {
      const r = await fetch(`/api/admin/origen-visitas?dias=${ventana}`, { cache: 'no-store' })
      setDatos(r.ok ? ((await r.json()) as OrigenVisitasResumen) : null)
    } catch {
      setDatos(null)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar(dias) }, [dias, cargar, recarga])

  const conDato = datos?.filas.filter(f => f.origen !== 'sin_dato') ?? []
  const sinDato = datos?.filas.find(f => f.origen === 'sin_dato')
  const total = conDato.reduce(
    (t, f) => ({
      visitas: t.visitas + f.visitas,
      celular: t.celular + f.celular,
      aDescargar: t.aDescargar + f.aDescargar,
      tiendaDescargar: t.tiendaDescargar + f.tiendaDescargar,
      tiendaAviso: t.tiendaAviso + f.tiendaAviso,
    }),
    { visitas: 0, celular: 0, aDescargar: 0, tiendaDescargar: 0, tiendaAviso: 0 },
  )
  const maxVisitas = Math.max(1, ...conDato.map(f => f.visitas))

  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-white">De dónde vienen las visitas web</h2>
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
        Visitas (sesiones) sin bots, por la página de entrada · TikTok, Instagram y Facebook también cuentan su navegador interno y el clic de anuncio
        {datos && <> · con origen desde el {new Date(`${datos.desde}T12:00:00`).toLocaleDateString('es-AR')}</>}
      </p>

      {cargando ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-[#FFFD02]" /></div>
      ) : !datos || datos.estado === 'error' ? (
        <p className="text-sm text-[#A0A0B0] py-6 text-center">No se pudieron traer los datos.</p>
      ) : datos.estado === 'sin_migracion' ? (
        <p className="text-sm text-[#A0A0B0] py-6 text-center">
          Falta correr <code className="text-zinc-400">supabase-origen-visitas-2026-11.sql</code> en la base.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-[#A0A0B0] text-left">
                <th className="font-semibold py-1.5">Origen</th>
                <th className="font-semibold py-1.5 text-right">Visitas</th>
                <th className="font-semibold py-1.5 text-right">Celular</th>
                <th className="font-semibold py-1.5 text-right">Entraron a /descargar</th>
                <th className="font-semibold py-1.5 text-right">Tienda en /descargar</th>
                <th className="font-semibold py-1.5 text-right">Tienda desde el aviso</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {conDato.map(f => (
                <tr key={f.origen} className="border-t border-[#2A2A3A] text-white">
                  <td className="py-2 pr-3">
                    <div className="font-semibold">{NOMBRE_DE_ORIGEN[f.origen]}</div>
                    <div className="mt-1 h-1.5 w-full max-w-[160px] rounded bg-[#1C1C27]">
                      <div className="h-full rounded bg-[#FFFD02]/70" style={{ width: `${(f.visitas / maxVisitas) * 100}%` }} />
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    {numero(f.visitas)} <span className="text-[#A0A0B0]">{pct(f.visitas, total.visitas)}</span>
                  </td>
                  <td className="py-2 text-right text-[#C8C8D2]">{pct(f.celular, f.visitas)}</td>
                  <td className="py-2 text-right">
                    {numero(f.aDescargar)} <span className="text-[#A0A0B0]">{pct(f.aDescargar, f.visitas)}</span>
                  </td>
                  <td className="py-2 text-right">
                    {numero(f.tiendaDescargar)} <span className="text-[#FFFD02]">{pct(f.tiendaDescargar, f.aDescargar)}</span>
                  </td>
                  <td className="py-2 text-right">{numero(f.tiendaAviso)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-[#2A2A3A] text-white font-semibold">
                <td className="py-2">Total con origen</td>
                <td className="py-2 text-right">{numero(total.visitas)}</td>
                <td className="py-2 text-right">{pct(total.celular, total.visitas)}</td>
                <td className="py-2 text-right">{numero(total.aDescargar)} <span className="text-[#A0A0B0] font-normal">{pct(total.aDescargar, total.visitas)}</span></td>
                <td className="py-2 text-right">{numero(total.tiendaDescargar)} <span className="text-[#FFFD02] font-normal">{pct(total.tiendaDescargar, total.aDescargar)}</span></td>
                <td className="py-2 text-right">{numero(total.tiendaAviso)}</td>
              </tr>
              {sinDato && sinDato.visitas > 0 && (
                <tr className="border-t border-[#2A2A3A] text-[#A0A0B0]">
                  <td className="py-2" title="Visitas de antes de que se midiera el origen, o sin página de entrada registrada">Sin dato</td>
                  <td className="py-2 text-right">{numero(sinDato.visitas)}</td>
                  <td className="py-2 text-right">{pct(sinDato.celular, sinDato.visitas)}</td>
                  <td className="py-2 text-right">{numero(sinDato.aDescargar)}</td>
                  <td className="py-2 text-right">{numero(sinDato.tiendaDescargar)}</td>
                  <td className="py-2 text-right">{numero(sinDato.tiendaAviso)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-[10px] text-[#A0A0B0] mt-3">
            % de visitas sobre el total con origen · /descargar sobre las visitas de ese origen · tienda en /descargar sobre las que entraron a /descargar.
            {' '}“Sin dato”: visitas anteriores a la medición del origen; deja de aparecer cuando la ventana queda entera después de esa fecha.
          </p>
        </div>
      )}
    </section>
  )
}
