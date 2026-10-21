'use client'

import { FlagCircle } from '@/components/CountrySelector'
import { COUNTRIES } from '@/lib/countries'
import type { AdminOverview } from '@/app/api/admin/overview/route'

/**
 * Las grillas de "Usuarios por país" y "Plataformas favoritas" de
 * `/admin/metricas`: un ícono (bandera o logo) con el número al lado, de mayor
 * a menor, y el nombre en el `title` del ícono.
 *
 * Reemplazan a dos gráficos de barras: con todos los países las barras no
 * entraban y el eje mostraba el nombre de uno de cada dos.
 */

/** La lista del sitio primero; para los países que no están ahí (Túnez,
 *  Filipinas…), el nombre en castellano del navegador. */
const nombresDeRegion = (() => {
  try { return new Intl.DisplayNames(['es'], { type: 'region' }) } catch { return null }
})()

export function nombrePais(code: string): string {
  const deLaLista = COUNTRIES.find(c => c.code === code)?.name
  if (deLaLista) return deLaLista
  try { return nombresDeRegion?.of(code) ?? code } catch { return code }
}

const celda = 'flex items-center rounded-lg bg-[#1C1C27] border border-[#2A2A3A] px-2.5 py-2'

export function GrillaPaises({ paises }: { paises: AdminOverview['paises'] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
      {paises.map(p => (
        <div key={p.country} className={`${celda} gap-2`}>
          <span title={nombrePais(p.country)} className="cursor-default">
            <FlagCircle code={p.country} size={24} />
          </span>
          <span className="text-sm font-semibold text-white tabular-nums">{p.count.toLocaleString('es-AR')}</span>
        </div>
      ))}
    </div>
  )
}

/** Los logos son los de la app (`LOGOS_TMDB` en lib/providers.ts). */
export function GrillaPlataformas({ plataformas }: { plataformas: AdminOverview['plataformasFavoritas'] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      {plataformas.map(pl => (
        <div key={pl.id} className={`${celda} gap-3`}>
          <span title={pl.provider} className="cursor-default shrink-0">
            {pl.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pl.logo} alt={pl.provider} width={36} height={36} className="w-9 h-9 rounded-lg object-cover" />
            ) : (
              <span className="w-9 h-9 rounded-lg bg-[#2A2A3A] flex items-center justify-center text-[9px] text-white text-center leading-tight p-0.5">
                {pl.provider}
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white tabular-nums">{pl.count.toLocaleString('es-AR')}</span>
            <span className="block text-[11px] text-[#A0A0B0] tabular-nums">{pl.pct}%</span>
          </span>
        </div>
      ))}
    </div>
  )
}
