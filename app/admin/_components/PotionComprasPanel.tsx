'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, ShoppingCart, DollarSign, FlaskConical, Ban } from 'lucide-react'
import type { PotionCompras, ResumenCompras } from '@/lib/potion-compras'
import { ETIQUETA_RANGO, type Rango } from '@/lib/potion-panel'

/**
 * La sección "Compras" de `/admin/potion`: lo que se vendió dentro del juego,
 * de `potion_compras` en el Supabase del juego.
 *
 * Sigue el rango y la casilla del lanzamiento de la página. Los dólares son
 * ESTIMADOS con el precio base de cada producto; el porqué y el criterio de
 * "válida" están en `lib/potion-compras.ts`. Las de prueba van aparte y no
 * suman.
 */

const numero = (n: number) => n.toLocaleString('es-AR')
const usd = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('es-AR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

/** `2026-10-13` → `13/10`. */
function diaCorto(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}

const NOMBRE_PRODUCTO: Record<string, string> = {
  combo_inicio: 'Combo de inicio',
  combo_oficial: 'Combo Oficial',
  combo_boticario: 'Combo Boticario',
  combo_maestro: 'Combo Maestro',
  combo_alquimista: 'Combo Alquimista',
  combo_leyenda: 'Combo Leyenda',
  monedas_punado: 'Monedas: puñado',
  monedas_bolsa: 'Monedas: bolsa',
  monedas_cofre: 'Monedas: cofre',
  monedas_arca: 'Monedas: arca',
  monedas_tesoro: 'Monedas: tesoro',
  pase_premium: 'Pase premium',
  suscripcion_mensual: 'Suscripción mensual (por mes)',
}

const nombre = (id: string) => NOMBRE_PRODUCTO[id] ?? id

function Dato({ icono, label, value, sub, tono }: {
  icono: React.ReactNode; label: string; value: string; sub?: string; tono: string
}) {
  return (
    <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] px-4 py-3">
      <p className={`text-xs flex items-center gap-1.5 mb-1 ${tono}`}>{icono}{label}</p>
      <p className="text-2xl font-black text-white tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

const th = 'text-right font-medium py-2 px-2'
const td = 'py-2 px-2 text-right tabular-nums text-zinc-300'

function TablaProductos({ r, vacio }: { r: ResumenCompras; vacio: string }) {
  if (r.porProducto.length === 0) return <p className="text-[#A0A0B0] text-sm py-6 text-center">{vacio}</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
          <th className="text-left font-medium py-2 pr-3">Producto</th>
          <th className={th}>Compras</th>
          <th className={th}>USD estimados</th>
        </tr>
      </thead>
      <tbody>
        {r.porProducto.map(p => (
          <tr key={p.producto} className="border-b border-[#2A2A3A]/60 last:border-0">
            <td className="py-2 pr-3 text-white">{nombre(p.producto)}</td>
            <td className={td}>{numero(p.compras)}</td>
            <td className={td}>{usd(p.usd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TablaDias({ r, vacio }: { r: ResumenCompras; vacio: string }) {
  if (r.porDia.length === 0) return <p className="text-[#A0A0B0] text-sm py-6 text-center">{vacio}</p>
  return (
    <div className="max-h-[320px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[#13131A]">
          <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
            <th className="text-left font-medium py-2 pr-3">Día</th>
            <th className={th}>Compras</th>
            <th className={th}>USD estimados</th>
          </tr>
        </thead>
        <tbody>
          {r.porDia.map(d => (
            <tr key={d.dia} className="border-b border-[#2A2A3A]/60 last:border-0">
              <td className="py-2 pr-3 text-white tabular-nums">{diaCorto(d.dia)}</td>
              <td className={td}>{numero(d.compras)}</td>
              <td className={td}>{usd(d.usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PotionComprasPanel({
  rango, lanzamiento, recarga = 0,
}: {
  rango: Rango
  lanzamiento: boolean
  /** Sube con cada refresco de la página. */
  recarga?: number
}) {
  const [datos, setDatos] = useState<PotionCompras | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const ultimoPedido = useRef(0)

  const cargar = useCallback(async () => {
    const pedido = ++ultimoPedido.current
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/potion/compras?rango=${rango}&lanzamiento=${lanzamiento ? 1 : 0}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(res.status === 401 ? 'No autorizado.' : `Error ${res.status}`)
      const json: PotionCompras = await res.json()
      if (pedido !== ultimoPedido.current) return
      setDatos(json)
    } catch (e) {
      if (pedido === ultimoPedido.current) setError(e instanceof Error ? e.message : 'No se pudo cargar.')
    } finally {
      if (pedido === ultimoPedido.current) setCargando(false)
    }
  }, [rango, lanzamiento])

  useEffect(() => { void cargar() }, [cargar, recarga])

  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-white mb-1 flex items-center gap-1.5">
        <ShoppingCart size={14} className="text-[#FFFD02]" />Compras
        {cargando && datos && <Loader2 size={12} className="animate-spin text-zinc-500" />}
      </h2>
      <p className="text-xs text-[#A0A0B0] mb-4 leading-relaxed">
        Compras dentro del juego verificadas con Google y Apple ({ETIQUETA_RANGO[rango].toLowerCase()}).
        Los dólares son estimados con el precio base de cada producto: lo cobrado de verdad cambia por país
        y la tienda descuenta su comisión. Cada mes de suscripción cuenta como una compra.
      </p>

      {!datos && cargando && (
        <div className="py-10 flex justify-center"><Loader2 size={22} className="animate-spin text-[#FFFD02]" /></div>
      )}

      {error && <p className="text-sm text-red-400 py-4">{error}</p>}

      {datos && !datos.disponible && (
        <p className="text-[#A0A0B0] text-sm py-6 text-center">
          {datos.motivo === 'sin_configurar'
            ? 'Falta configurar la conexión con el juego (POTION_SUPABASE_URL y POTION_SUPABASE_SECRET).'
            : 'La consulta falló. El detalle está en los logs de Vercel, con el prefijo [admin/potion/compras].'}
        </p>
      )}

      {datos && datos.disponible && (
        <div className={`transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <Dato icono={<ShoppingCart size={12} />} label="Compras válidas" tono="text-[#FFFD02]"
              value={numero(datos.reales.compras)} sub="Sin las de prueba" />
            <Dato icono={<DollarSign size={12} />} label="Ingresos estimados" tono="text-emerald-400"
              value={usd(datos.reales.usd)} sub="Precio base, antes de la comisión" />
            <Dato icono={<FlaskConical size={12} />} label="De prueba" tono="text-purple-400"
              value={numero(datos.prueba.compras)} sub={`${usd(datos.prueba.usd)} que no se cobraron`} />
            <Dato icono={<Ban size={12} />} label="No válidas" tono="text-red-400"
              value={numero(datos.noValidas)} sub="Inválidas, pendientes o reembolsadas" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <h3 className="text-xs font-semibold text-white mb-2">Por producto</h3>
              <TablaProductos r={datos.reales} vacio="Ninguna compra válida en este rango." />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-white mb-2">Por día</h3>
              <TablaDias r={datos.reales} vacio="Ninguna compra válida en este rango." />
            </div>
          </div>

          {datos.prueba.compras > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold text-white mb-1 flex items-center gap-1.5">
                <FlaskConical size={12} className="text-purple-400" />De prueba
              </h3>
              <p className="text-[11px] text-zinc-500 mb-2">
                Probadores de licencias de Google y sandbox de Apple: no se cobraron y no suman arriba.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <TablaProductos r={datos.prueba} vacio="" />
                <TablaDias r={datos.prueba} vacio="" />
              </div>
            </div>
          )}

          {datos.sinPrecio.length > 0 && (
            <p className="text-[11px] text-amber-400 mt-4">
              Sin precio conocido (suman 0 dólares): {datos.sinPrecio.join(', ')}. Agregalos en lib/potion-compras.ts.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
