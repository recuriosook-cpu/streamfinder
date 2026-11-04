'use client'

import { useEffect, useState } from 'react'
import { Download, Smartphone, CalendarCheck, Radio, UserPlus, Globe } from 'lucide-react'
import type { PotionVivo } from '@/app/api/admin/potion/vivo/route'
import type { PotionTiendas } from '@/lib/potion-tiendas'
import { FlagCircle } from '@/components/CountrySelector'
import { nombrePais } from '@/app/admin/_components/GrillasMetricas'
import { Bloque, Flecha, numero, diaCorto } from './piezas'

/**
 * Lo de arriba de `/admin/potion`: las 5 tarjetas grandes y "Dónde está el
 * juego".
 *
 * Las tarjetas de jugadores (jugaron hoy, jugando ahora, nuevos hoy) piden
 * `/api/admin/potion/vivo` cada 60 segundos mientras la pestaña está a la
 * vista. Las de las tiendas (descargas, tienen la app) y los países salen de
 * `/api/admin/potion/tiendas`, que la página pide al cargar y al refrescar:
 * Google y Apple publican una vez por día. Ninguna mira el período de abajo:
 * todo es desde el lanzamiento.
 */

const VIVO_MS = 60_000

function useVivo() {
  const [vivo, setVivo] = useState<PotionVivo | null>(null)
  const [fallo, setFallo] = useState(false)

  useEffect(() => {
    let cancelado = false
    async function cargar() {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/admin/potion/vivo', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const json: PotionVivo = await res.json()
        if (cancelado) return
        setVivo(json)
        setFallo(!json.disponible)
      } catch {
        if (!cancelado) setFallo(true)
      }
    }
    void cargar()
    const id = setInterval(cargar, VIVO_MS)
    document.addEventListener('visibilitychange', cargar)
    return () => {
      cancelado = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', cargar)
    }
  }, [])

  return { vivo, fallo }
}

function TarjetaGrande({
  icono, tono, titulo, valor, partes, fuente, flecha, ancha = false,
}: {
  icono: React.ReactNode
  tono: string
  titulo: string
  valor: string
  /** "Android 42 · iOS 0". */
  partes?: React.ReactNode
  /** De dónde sale el dato. */
  fuente: React.ReactNode
  flecha?: React.ReactNode
  /** En el celular ocupa las dos columnas. */
  ancha?: boolean
}) {
  return (
    <div className={`bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4 sm:p-5 flex flex-col min-w-0 ${ancha ? 'col-span-2 lg:col-span-1' : ''}`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tono}`}>{icono}</div>
        <p className="text-sm text-white font-semibold leading-tight">{titulo}</p>
      </div>
      <p className="text-4xl sm:text-5xl font-black text-white tabular-nums leading-none">{valor}</p>
      {partes && <p className="text-xs text-zinc-300 mt-2 tabular-nums">{partes}</p>}
      <div className="mt-auto pt-3 space-y-1">
        {flecha}
        <p className="text-[11px] text-zinc-500 leading-snug">{fuente}</p>
      </div>
    </div>
  )
}

function Partes({ android, ios }: { android: number | null; ios: number | null }) {
  const v = (n: number | null) => (n === null ? '—' : numero(n))
  return (
    <>
      <span className="text-emerald-400 font-semibold">Android</span> {v(android)}
      <span className="text-zinc-600"> · </span>
      <span className="text-sky-400 font-semibold">iOS</span> {v(ios)}
    </>
  )
}

export function TarjetasArriba({ tiendas }: { tiendas: PotionTiendas | null }) {
  const { vivo, fallo } = useVivo()
  const ok = vivo?.disponible === true
  const v = (x: number | undefined) => (ok && x !== undefined ? numero(x) : '—')

  const a = tiendas?.android
  const i = tiendas?.ios
  const iosAfuera = ok && vivo.ios.desde === null

  // 1. Descargas
  const descAndroid = a?.disponible ? a.total : null
  const descIos = i ? i.total : null
  const descTotal = descAndroid === null && descIos === null ? null : (descAndroid ?? 0) + (descIos ?? 0)
  const descUlt7 = (a?.ult7 ?? 0) + (i?.ult7 ?? 0)
  const descPrev7 = (a?.prev7 ?? 0) + (i?.prev7 ?? 0)

  // 2. Tienen la app
  const baseAndroid = a?.base ?? null
  const baseIos = ok ? vivo.ios.activos30 : null
  const tienen = baseAndroid === null && baseIos === null ? null : (baseAndroid ?? 0) + (baseIos ?? 0)
  const tienenAntes = a?.baseHace7 === null || a?.baseHace7 === undefined || !ok
    ? null
    : a.baseHace7 + vivo.ios.activos30Hace7

  const alPlay = a?.ultimaFecha ? `Google Play al ${diaCorto(a.ultimaFecha)}` : 'Google Play'
  const textoIosDescargas = !i?.configurado
    ? 'App Store todavía sin conectar'
    : i.primeraFecha ? `App Store desde el ${diaCorto(i.primeraFecha)}` : 'App Store: todavía sin descargas'
  const textoIosTienen = !ok
    ? 'iOS: sin datos del juego'
    : iosAfuera
      ? `iOS: todavía no salió${vivo.ios.dePrueba > 0 ? ` (${numero(vivo.ios.dePrueba)} iPhone de prueba no cuentan)` : ''}`
      : 'iOS: iPhone que abrieron el juego en los últimos 30 días (Apple no informa cuántos la tienen)'

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <TarjetaGrande
          ancha
          icono={<Download size={18} />} tono="text-[#FFFD02] bg-[#FFFD02]/10"
          titulo="Descargas totales"
          valor={descTotal === null ? '—' : numero(descTotal)}
          partes={<Partes android={descAndroid} ios={descIos} />}
          flecha={descTotal !== null && (
            <Flecha actual={descUlt7} antes={descPrev7} texto={`${numero(descUlt7)} en la última semana, ${numero(descPrev7)} la anterior`} />
          )}
          fuente={<>Desde el lanzamiento (13/10) · {alPlay} · {textoIosDescargas}</>}
        />
        <TarjetaGrande
          ancha
          icono={<Smartphone size={18} />} tono="text-emerald-400 bg-emerald-500/10"
          titulo="Tienen la app hoy"
          valor={tienen === null ? '—' : numero(tienen)}
          partes={<Partes android={baseAndroid} ios={baseIos} />}
          flecha={tienen !== null && (
            <Flecha actual={tienen} antes={tienenAntes} texto={`hace una semana: ${tienenAntes === null ? '—' : numero(tienenAntes)}`} />
          )}
          fuente={<>Android: aparatos con la app según {alPlay}. {textoIosTienen}.</>}
        />
        <TarjetaGrande
          icono={<CalendarCheck size={18} />} tono="text-blue-400 bg-blue-500/10"
          titulo="Jugaron hoy"
          valor={v(vivo?.jugaronHoy)}
          flecha={ok && <Flecha actual={vivo.jugaronHoy} antes={vivo.ayer.jugaron} texto={`ayer a esta hora: ${numero(vivo.ayer.jugaron)}`} />}
          fuente="Abrieron el juego desde las 0 h de Argentina"
        />
        <TarjetaGrande
          icono={<Radio size={18} />} tono="text-teal-400 bg-teal-500/10"
          titulo="Jugando ahora"
          valor={v(vivo?.jugandoAhora)}
          flecha={ok && <Flecha actual={vivo.jugandoAhora} antes={vivo.ayer.jugandoAhora} texto={`ayer a esta hora: ${numero(vivo.ayer.jugandoAhora)}`} />}
          fuente="Con el juego abierto en los últimos 15 minutos"
        />
        <TarjetaGrande
          ancha
          icono={<UserPlus size={18} />} tono="text-purple-400 bg-purple-500/10"
          titulo="Nuevos hoy"
          valor={v(vivo?.nuevosHoy)}
          flecha={ok && <Flecha actual={vivo.nuevosHoy} antes={vivo.ayer.nuevos} texto={`ayer a esta hora: ${numero(vivo.ayer.nuevos)}`} />}
          fuente="Jugaron por primera vez hoy"
        />
      </div>
      <p className="text-[11px] text-zinc-500 mt-2">
        Jugadores: se actualiza solo cada minuto
        {ok && <> · {new Date(vivo.generadoEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}</>}
        {fallo && <span className="text-red-400"> · no se pudo actualizar</span>}
        {' '}· Descargas: Google y Apple publican una vez por día, con uno o dos días de demora.
        {' '}Desde el lanzamiento: el total de jugadores es {v(vivo?.total)}.
      </p>
    </div>
  )
}

// ── Dónde está el juego ────────────────────────────────────────────────────

export function DondeEsta({ tiendas }: { tiendas: PotionTiendas | null }) {
  const paises = tiendas?.paises ?? []
  const max = paises.reduce((m, p) => Math.max(m, p.total), 0)
  const hayIos = paises.some(p => p.ios > 0)

  return (
    <Bloque
      titulo="Dónde está el juego"
      frase="Cuántos tienen la app en cada país, de más a menos."
    >
      {!tiendas ? (
        <p className="text-[#A0A0B0] text-sm py-6 text-center">Cargando…</p>
      ) : paises.length === 0 ? (
        <p className="text-[#A0A0B0] text-sm py-6 text-center">Todavía no hay datos por país.</p>
      ) : (
        <ul className="space-y-2.5">
          {paises.map(p => (
            <li key={p.pais} className="flex items-center gap-3">
              {p.pais === 'ZZ' ? (
                <span className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
                  <Globe size={15} className="text-zinc-300" />
                </span>
              ) : (
                <FlagCircle code={p.pais} size={28} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm text-white truncate">{p.pais === 'ZZ' ? 'Sin país' : nombrePais(p.pais)}</p>
                  <p className="text-sm font-bold text-white tabular-nums shrink-0">
                    {numero(p.total)}
                    {p.android > 0 && p.ios > 0 && (
                      <span className="text-[11px] font-normal text-zinc-500 ml-1.5">
                        Android {numero(p.android)} · iOS {numero(p.ios)}
                      </span>
                    )}
                    {!(p.android > 0 && p.ios > 0) && (
                      <span className="text-[11px] font-normal text-zinc-500 ml-1.5">{p.ios > 0 ? 'iOS' : 'Android'}</span>
                    )}
                  </p>
                </div>
                <div className="h-2 mt-1 rounded-full bg-[#1C1C27] overflow-hidden flex">
                  <div className="h-full bg-emerald-400" style={{ width: `${max > 0 ? (p.android / max) * 100 : 0}%` }} />
                  <div className="h-full bg-sky-400" style={{ width: `${max > 0 ? (p.ios / max) * 100 : 0}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-zinc-500 mt-4 leading-relaxed">
        <span className="text-emerald-400">■</span> Android: aparatos con la app
        {tiendas?.paisesFecha ? ` el ${diaCorto(tiendas.paisesFecha)}` : ''}, según Google Play.
        {' '}<span className="text-sky-400">■</span> iOS: descargas desde que salió en la App Store, porque Apple no dice cuántos la siguen teniendo
        {hayIos ? '.' : ' (todavía ninguna).'}
      </p>
    </Bloque>
  )
}
