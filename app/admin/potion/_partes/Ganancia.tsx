'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { Loader2, Megaphone, ShoppingCart, UserCheck, Eye, Gauge } from 'lucide-react'
import { VENTANA_POR_DEFECTO, type Ventana } from '@/lib/metricas-ventanas'
import type { AdMobResumen } from '@/app/api/admin/admob/route'
import type { PotionCompras } from '@/lib/potion-compras'
import type { Rango } from '@/lib/potion-panel'
import {
  TablaGrupos, TablaDiaria as TablaDiariaAdMob, VacioAdMob, NOMBRE_FORMATO, nombrePais, dinero,
} from '@/app/admin/_components/AdMobPanel'
import { PotionComprasPanel } from '@/app/admin/_components/PotionComprasPanel'
import { Bloque, Plegable, SelectorDias, Subtitulo, Dato, numero, usd, diaCorto, tooltipStyle, ejeComun } from './piezas'

/**
 * "¿Cuánto genera?": lo de los anuncios (AdMob) y lo de las compras dentro
 * del juego, sumados en la misma ventana de 7 o 30 días.
 *
 * Para sumarlos pide las compras con `dias` (`/api/admin/potion/compras`),
 * no con el período de la página. El detalle de compras de siempre, que sí
 * sigue el período de la página (Hoy / 7 días / Todo), queda plegado abajo
 * tal cual estaba.
 *
 * Los días de AdMob son los de la zona de la cuenta y los de las compras son
 * de Argentina: en los bordes hay unas horas de diferencia.
 */
export function Ganancia({
  recarga, desde, rango, lanzamiento,
}: {
  recarga: number
  /** `YYYY-MM-DD` si la casilla del lanzamiento está prendida. */
  desde?: string
  rango: Rango
  lanzamiento: boolean
}) {
  const [dias, setDias] = useState<Ventana>(VENTANA_POR_DEFECTO)
  const [admob, setAdmob] = useState<AdMobResumen | null>(null)
  const [compras, setCompras] = useState<PotionCompras | null>(null)
  const [cargando, setCargando] = useState(true)
  const ultimo = useRef(0)

  const cargar = useCallback(async (ventana: Ventana) => {
    const pedido = ++ultimo.current
    const pA = new URLSearchParams({ dias: String(ventana) })
    if (desde) pA.set('desde', desde)
    const pC = new URLSearchParams({ rango: '7d', lanzamiento: lanzamiento ? '1' : '0', dias: String(ventana) })
    const pedir = (url: string) =>
      fetch(url, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
    try {
      setCargando(true)
      const [a, c] = await Promise.all([
        pedir(`/api/admin/admob?${pA}`),
        pedir(`/api/admin/potion/compras?${pC}`),
      ])
      if (pedido !== ultimo.current) return
      setAdmob(a as AdMobResumen | null)
      setCompras(c as PotionCompras | null)
    } finally {
      if (pedido === ultimo.current) setCargando(false)
    }
  }, [desde, lanzamiento])

  useEffect(() => { void cargar(dias) }, [dias, cargar, recarga])

  const moneda = admob?.moneda ?? 'USD'
  const anuncios = admob?.disponible ? admob.totales.ganancia : null
  const ventas = compras?.disponible ? compras.reales.usd : null
  const total = anuncios === null && ventas === null ? null : (anuncios ?? 0) + (ventas ?? 0)
  const usuariosDia = admob?.disponible ? admob.totales.usuariosDia : null
  const porJugador = total !== null && usuariosDia ? total / usuariosDia : null

  // Por día: anuncios y compras apiladas.
  const porDia = new Map<string, { fecha: string; anuncios: number; compras: number }>()
  for (const d of admob?.disponible ? admob.serie : []) {
    porDia.set(d.fecha, { fecha: d.fecha, anuncios: d.ganancia, compras: 0 })
  }
  for (const d of compras?.disponible ? compras.reales.porDia : []) {
    const f = porDia.get(d.dia) ?? { fecha: d.dia, anuncios: 0, compras: 0 }
    f.compras += d.usd
    porDia.set(d.dia, f)
  }
  const serie = [...porDia.values()].sort((x, y) => (x.fecha < y.fecha ? -1 : 1)).map(d => ({ ...d, etiqueta: diaCorto(d.fecha) }))

  return (
    <Bloque
      titulo="¿Cuánto genera?"
      frase="Lo que dejan los anuncios más lo que se vende dentro del juego, en dólares."
      derecha={<SelectorDias valor={dias} onCambiar={setDias} />}
    >
      {cargando && !admob && !compras ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-[#FFFD02]" /></div>
      ) : (
        <div className={`transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          <div className="rounded-2xl border border-[#FFFD02]/30 bg-[#FFFD02]/5 p-4 sm:p-5 mb-4">
            <p className="text-sm text-[#A0A0B0]">En los últimos {dias} días</p>
            <p className="text-4xl sm:text-5xl font-black text-[#FFFD02] tabular-nums mt-1">{dinero(total, moneda)}</p>
            <p className="text-xs text-zinc-300 mt-2">
              <Megaphone size={12} className="inline -mt-0.5 mr-1 text-[#FFFD02]" />Anuncios {dinero(anuncios, moneda)}
              <span className="text-zinc-600"> · </span>
              <ShoppingCart size={12} className="inline -mt-0.5 mr-1 text-emerald-400" />Compras {usd(ventas)}
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Dato icono={<UserCheck size={12} />} tono="text-emerald-400" label="Por jugador, por día"
              value={dinero(porJugador, moneda, 4)}
              sub={usuariosDia === null ? 'No se pudo consultar el juego'
                : `lo que deja en promedio cada jugador cada día que juega (${numero(usuariosDia)} días jugados)`} />
            <Dato icono={<ShoppingCart size={12} />} tono="text-emerald-400" label="Compras"
              value={compras?.disponible ? numero(compras.reales.compras) : '—'}
              sub="sin las de prueba" />
            <Dato icono={<Eye size={12} />} tono="text-[#A0A0B0]" label="Anuncios vistos"
              value={admob?.disponible ? numero(admob.totales.impresiones) : '—'} sub="todos los tipos" />
            <Dato icono={<Gauge size={12} />} tono="text-[#A0A0B0]" label="Lo que pagan cada 1000 anuncios"
              value={admob?.disponible ? dinero(admob.totales.ecpm, moneda) : '—'} sub="eCPM, en la jerga de AdMob" />
          </div>

          {serie.length > 0 && (
            <div className="mt-5">
              <Subtitulo>Por día</Subtitulo>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" vertical={false} />
                    <XAxis dataKey="etiqueta" {...ejeComun} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis {...ejeComun} width={44} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                    <Tooltip {...tooltipStyle} formatter={(v) => dinero(Number(v), moneda)} />
                    <Legend wrapperStyle={{ fontSize: 11, color: '#A0A0B0' }} iconSize={10} />
                    <Bar dataKey="anuncios" name="Anuncios" stackId="g" fill="#FFFD02" />
                    <Bar dataKey="compras" name="Compras" stackId="g" fill="#34D399" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
            Anuncios: ganancia estimada por AdMob
            {admob?.actualizadoEn && <> (al {new Date(admob.actualizadoEn).toLocaleDateString('es-AR')})</>}; la
            definitiva sale a principio del mes siguiente. Compras: estimadas con el precio de lista de cada
            producto, antes de la comisión de la tienda.
          </p>

          <Plegable titulo="Ver detalle de anuncios">
            {!admob || !admob.disponible ? <VacioAdMob datos={admob} dias={dias} /> : (
              <>
                <p className="text-xs text-[#A0A0B0]">
                  Sólo anuncios, por jugador por día:{' '}
                  <span className="text-white font-semibold tabular-nums">{dinero(admob.totales.gananciaPorUsuarioDia, moneda, 4)}</span>
                  {' '}· ganancia {dinero(admob.totales.ganancia, moneda)} · {numero(admob.totales.impresiones)} anuncios vistos.
                </p>
                <TablaGrupos
                  titulo={`Por tipo de anuncio · últimos ${dias} días`} columna="Tipo"
                  grupos={admob.formatos} nombre={k => NOMBRE_FORMATO[k] ?? k} moneda={moneda}
                />
                <TablaDiariaAdMob serie={admob.serie} moneda={moneda} />
                <TablaGrupos
                  titulo={`Por país · últimos ${dias} días`} columna="País"
                  grupos={admob.paises} nombre={k => nombrePais(k)} codigo moneda={moneda} alto
                />
                <p className="text-[10px] text-[#A0A0B0] leading-relaxed">
                  Impresiones son anuncios vistos; eCPM es lo que pagan cada 1000. La ganancia por usuario cruza
                  cada día con los usuarios que jugaron ese día, en días de Argentina; los días de AdMob son los de
                  la zona de la cuenta, así que en los bordes hay unas horas de diferencia.
                </p>
              </>
            )}
          </Plegable>

          <Plegable titulo="Ver detalle de compras">
            <p className="text-xs text-[#A0A0B0]">
              Este detalle sigue el período de la página (Hoy / 7 días / Todo), no el de arriba.
            </p>
            <PotionComprasPanel rango={rango} lanzamiento={lanzamiento} recarga={recarga} />
          </Plegable>
        </div>
      )}
    </Bloque>
  )
}
