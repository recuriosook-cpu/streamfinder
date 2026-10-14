'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Users, UserPlus, Activity, PlayCircle, Clock, AlertCircle, AlertTriangle,
  Loader2, TrendingDown, Coins, Heart, Swords, Ticket,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'
import type { PotionPanel, PotionCohorte, PotionDuelos } from '@/app/api/admin/potion/route'
import { RANGOS, RANGO_POR_DEFECTO, ETIQUETA_RANGO, LANZAMIENTO, type Rango } from '@/lib/potion-panel'
import { fmtDuracion } from '@/lib/format-duracion'
import { RefrescoControl, useRefrescoAlVolver } from '@/app/admin/_components/Refresco'
import { GooglePlayPanel } from '@/app/admin/_components/GooglePlayPanel'

/**
 * Las estadísticas del juego Potion Bottle: Water Sort.
 *
 * Los datos vienen de OTRO proyecto de Supabase, el del juego, y la página no
 * lo toca: pide `/api/admin/potion`, que consulta del lado del servidor con la
 * clave secreta y devuelve los números ya calculados. La puerta es la misma
 * del resto del panel: `app/admin/layout.tsx` y el chequeo de la ruta.
 *
 * Un `—` acá, como en la retención de Glynbox, es "todavía no se puede
 * saber", nunca un cero disfrazado.
 */

const numero = (n: number) => n.toLocaleString('es-AR')
const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('es-AR')}%`)
const dec = (v: number | null) => (v === null ? '—' : v.toLocaleString('es-AR'))

/** `2026-10-13` → `13/10`. */
function diaCorto(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${Number(d)}/${Number(m)}`
}

const NOMBRE_COMODIN: Record<string, string> = {
  botella: 'Botella extra',
  deshacer: 'Deshacer',
  pista: 'Pista',
}

const tooltipStyle = {
  contentStyle: { background: '#1C1C27', border: '1px solid #2A2A3A', borderRadius: 8, color: '#fff', fontSize: 12 },
  cursor: { fill: 'rgba(255,253,2,0.04)' },
}

// ── Piezas ─────────────────────────────────────────────────────────────────

function Tarjeta({
  icon, label, value, sub, color = 'yellow',
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string
  color?: 'yellow' | 'blue' | 'purple' | 'green' | 'teal'
}) {
  const styles = {
    yellow: 'text-[#FFFD02] bg-[#FFFD02]/10',
    blue:   'text-blue-400 bg-blue-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    green:  'text-emerald-400 bg-emerald-500/10',
    teal:   'text-teal-400 bg-teal-500/10',
  }
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${styles[color]}`}>{icon}</div>
      <p className="text-3xl font-black text-white tabular-nums">{value}</p>
      <p className="text-sm text-[#A0A0B0] mt-1 font-medium">{label}</p>
      {sub && <p className="text-xs text-[#A0A0B0]/70 mt-1">{sub}</p>}
    </div>
  )
}

function Seccion({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-white mb-1">{titulo}</h2>
      {nota && <p className="text-xs text-[#A0A0B0] mb-4 leading-relaxed">{nota}</p>}
      {children}
    </section>
  )
}

function SinDatos({ texto = 'Sin datos en este rango.' }: { texto?: string }) {
  return <p className="text-[#A0A0B0] text-sm py-6 text-center">{texto}</p>
}

/** Un número chico con su etiqueta, para las secciones de economía y pase. */
function Dato({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] px-4 py-3">
      <p className="text-2xl font-black text-white tabular-nums">{value}</p>
      <p className="text-xs text-[#A0A0B0] mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

/**
 * Celda de retención con color por umbral fijo, como la de Glynbox: un color
 * relativo pintaría de verde el mejor número aunque fuera malo.
 */
function CeldaRetencion({ valor, pctValor }: { valor: number; pctValor: number | null }) {
  if (pctValor === null) {
    return (
      <td className="py-2 px-2 text-right">
        <span className="text-zinc-600" title="La cohorte todavía no cumplió el plazo">—</span>
      </td>
    )
  }
  const tono =
    pctValor >= 40 ? 'text-emerald-400' :
    pctValor >= 20 ? 'text-amber-400' :
    'text-red-400'
  return (
    <td className="py-2 px-2 text-right tabular-nums">
      <span className={`font-semibold ${tono}`}>{pctValor}%</span>
      <span className="text-zinc-600 text-[11px] ml-1">({valor})</span>
    </td>
  )
}

function TablaRetencion({ cohortes }: { cohortes: PotionCohorte[] }) {
  if (cohortes.length === 0) return <SinDatos texto="Nadie llegó en este rango." />
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
            <th className="text-left  font-medium py-2 pr-3">Llegaron el</th>
            <th className="text-right font-medium py-2 px-2">Jugadores</th>
            <th className="text-right font-medium py-2 px-2">Día 1</th>
            <th className="text-right font-medium py-2 px-2">Día 3</th>
            <th className="text-right font-medium py-2 px-2">Día 7</th>
            <th className="text-right font-medium py-2 px-2">Día 30</th>
          </tr>
        </thead>
        <tbody>
          {cohortes.map(c => (
            <tr key={c.dia} className="border-b border-[#2A2A3A]/60 last:border-0">
              <td className="py-2 pr-3 text-white tabular-nums">{diaCorto(c.dia)}</td>
              <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(c.llegaron)}</td>
              <CeldaRetencion valor={c.d1}  pctValor={c.d1Pct} />
              <CeldaRetencion valor={c.d3}  pctValor={c.d3Pct} />
              <CeldaRetencion valor={c.d7}  pctValor={c.d7Pct} />
              <CeldaRetencion valor={c.d30} pctValor={c.d30Pct} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FilaDuelos({ titulo, d }: { titulo: string; d: PotionDuelos }) {
  return (
    <tr className="border-b border-[#2A2A3A]/60 last:border-0">
      <td className="py-2 pr-3 text-white">{titulo}</td>
      <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(d.jugadores)}</td>
      <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(d.empezados)}</td>
      <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(d.terminados)}</td>
      <td className="py-2 px-2 text-right tabular-nums text-zinc-300">
        {numero(d.ganados)} <span className="text-zinc-600 text-[11px]">({pct(d.pctGanados)})</span>
      </td>
      <td className="py-2 px-2 text-right tabular-nums text-zinc-300">
        {numero(d.abandonados)} <span className="text-zinc-600 text-[11px]">({numero(d.conElBoton)} con el botón)</span>
      </td>
    </tr>
  )
}

function Vacio({ motivo }: { motivo: PotionPanel['motivo'] }) {
  const textos: Record<string, { titulo: string; detalle: React.ReactNode }> = {
    sin_configurar: {
      titulo: 'Falta configurar la conexión con el juego.',
      detalle: <>Definí <code className="text-zinc-400">POTION_SUPABASE_URL</code> y{' '}
        <code className="text-zinc-400">POTION_SUPABASE_SECRET</code> en Vercel.</>,
    },
    sin_migracion: {
      titulo: 'Falta correr la función en la base del juego.',
      detalle: <>Pegá <code className="text-zinc-400">potion-panel.sql</code> en el SQL Editor del
        proyecto de Supabase <strong>del juego</strong> y recargá.</>,
    },
    error: {
      titulo: 'La consulta falló.',
      detalle: 'El detalle está en los logs de Vercel, con el prefijo [admin/potion].',
    },
  }
  const t = textos[motivo ?? 'error'] ?? textos.error
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl py-12 px-6 text-center">
      <p className="text-[#A0A0B0] text-sm">{t.titulo}</p>
      <p className="text-xs text-zinc-500 mt-1.5">{t.detalle}</p>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────────

export default function PotionPage() {
  const [rango, setRango] = useState<Rango>(RANGO_POR_DEFECTO)
  /** Arranca prendida: lo de antes del 13 de octubre es de los testers. */
  const [lanzamiento, setLanzamiento] = useState(true)

  const [datos, setDatos] = useState<PotionPanel | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null)

  /** Sólo se pinta la respuesta del último pedido: cambiar el filtro rápido no la pisa con una vieja. */
  const ultimoPedido = useRef(0)

  /** Sube con cada refresco a mano o al volver a la pestaña: el panel de Play lo escucha. */
  const [recargaPlay, setRecargaPlay] = useState(0)
  function actualizar() {
    setRecargaPlay(v => v + 1)
    void cargar()
  }

  async function cargar() {
    const pedido = ++ultimoPedido.current
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/potion?rango=${rango}&lanzamiento=${lanzamiento ? 1 : 0}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(res.status === 401 ? 'No autorizado.' : `Error ${res.status}`)
      const json: PotionPanel = await res.json()
      if (pedido !== ultimoPedido.current) return
      setDatos(json)
      setActualizadoEn(new Date())
    } catch (e) {
      if (pedido !== ultimoPedido.current) return
      setError(e instanceof Error ? e.message : 'No se pudo cargar.')
    } finally {
      if (pedido === ultimoPedido.current) setCargando(false)
    }
  }

  useEffect(() => { cargar() }, [rango, lanzamiento]) // eslint-disable-line react-hooks/exhaustive-deps
  useRefrescoAlVolver(actualizar, actualizadoEn)

  const r = datos?.resumen
  const maxEmbudo = datos?.embudo.reduce((m, e) => Math.max(m, e.jugadores), 0) ?? 0

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#13131A] border-b border-[#2A2A3A] px-6 py-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/potion-icono.png" alt="" width={40} height={40} className="w-10 h-10 rounded-xl shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-white">Potion Bottle</h1>
            <p className="text-sm text-[#A0A0B0] mt-0.5">Water Sort · estadísticas del juego</p>
          </div>
        </div>
        <RefrescoControl actualizadoEn={actualizadoEn} cargando={cargando} onActualizar={actualizar} />
      </div>

      <div className="px-6 py-6 space-y-6 max-w-6xl">

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex rounded-xl border border-[#2A2A3A] bg-[#13131A] p-1">
            {RANGOS.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setRango(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  rango === v ? 'bg-[#FFFD02] text-black' : 'text-[#A0A0B0] hover:text-white'
                }`}
              >
                {ETIQUETA_RANGO[v]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-[#A0A0B0] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={lanzamiento}
              onChange={e => setLanzamiento(e.target.checked)}
              className="accent-[#FFFD02] w-4 h-4"
            />
            Solo desde el lanzamiento (13/10/2026)
          </label>
          <span className="text-[11px] text-zinc-500">Días de Argentina · fecha de llegada al servidor</span>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Google Play: descargas, desinstalaciones y dispositivos con el juego.
            Va fuera de `datos` a propósito: sale del Supabase de Glynbox y no
            del juego, así que se ve aunque la conexión con el juego falle.
            Tiene su propio filtro de 7 y 30 días; del de arriba sólo toma el
            del lanzamiento. */}
        <GooglePlayPanel
          app="potion"
          recarga={recargaPlay}
          desde={lanzamiento ? LANZAMIENTO.slice(0, 10) : undefined}
          tablaDiaria
          tablaPaises
        />

        {!datos && cargando && (
          <div className="py-24 flex items-center justify-center">
            <Loader2 size={28} className="animate-spin text-[#FFFD02]" />
          </div>
        )}

        {datos && !datos.disponible && <Vacio motivo={datos.motivo} />}

        {datos && datos.disponible && r && (
          <div className={`space-y-6 transition-opacity ${cargando ? 'opacity-60' : ''}`}>

            {/* 1. Resumen */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <Tarjeta icon={<Users size={20} />} label="Jugadores" value={numero(r.jugadores)}
                sub={`${ETIQUETA_RANGO[datos.rango]} · ${numero(r.eventos)} eventos`} color="yellow" />
              <Tarjeta icon={<UserPlus size={20} />} label="Nuevos hoy" value={numero(r.nuevosHoy)} color="green" />
              <Tarjeta icon={<UserPlus size={20} />} label="Nuevos en 7 días" value={numero(r.nuevos7d)} color="teal" />
              <Tarjeta icon={<Activity size={20} />} label="Activos hoy" value={numero(r.activosHoy)} color="blue" />
              <Tarjeta icon={<PlayCircle size={20} />} label="Sesiones hoy" value={numero(r.sesionesHoy)} color="purple" />
              <Tarjeta icon={<Clock size={20} />} label="Duración media de sesión"
                value={fmtDuracion(r.duracionMediaSeg)}
                sub={r.sesionesMedidas > 0 ? `En pantalla · ${numero(r.sesionesMedidas)} sesiones medidas` : 'En pantalla'}
                color="yellow" />
            </div>

            {/* 2. Retención */}
            <Seccion
              titulo="Retención"
              nota="Por día de llegada: de los que jugaron por primera vez ese día, qué porcentaje volvió a jugar exactamente al día 1, 3, 7 y 30. Un guión es que todavía no pasó ese día, no un cero."
            >
              <TablaRetencion cohortes={datos.retencion} />
            </Seccion>

            {/* 3. Embudo */}
            <Seccion
              titulo="Embudo de niveles"
              nota="Jugadores distintos que empezaron cada nivel. No cuenta volver a jugar uno ya ganado."
            >
              {datos.embudo.length === 0 ? <SinDatos /> : (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={datos.embudo} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" vertical={false} />
                      <XAxis dataKey="nivel" tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false}
                        allowDecimals={false} domain={[0, Math.max(1, maxEmbudo)]} />
                      <Tooltip {...tooltipStyle} labelStyle={{ color: '#FFFD02' }} labelFormatter={v => `Nivel ${v}`} />
                      <Bar dataKey="jugadores" name="Jugadores" radius={[3, 3, 0, 0]}>
                        {datos.embudo.map(e => (
                          <Cell key={e.nivel} fill={e.nivel === datos.abandono?.nivel ? '#EF4444' : '#FFFD02'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  {datos.abandono ? (
                    <div className="mt-4 rounded-xl border border-red-900/60 bg-red-500/10 px-4 py-3 flex items-start gap-3">
                      <TrendingDown size={18} className="text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-white font-semibold">
                          Donde más gente deja de jugar: nivel {datos.abandono.nivel}
                        </p>
                        <p className="text-xs text-[#A0A0B0] mt-0.5">
                          {datos.abandono.confirmado
                            ? <>{numero(datos.abandono.cantidad)} jugadores llegaron hasta acá y llevan 7 días o más sin abrir el juego ({pct(datos.abandono.pct)} de los que llegaron).</>
                            : <>{numero(datos.abandono.cantidad)} jugadores se quedaron en este nivel ({pct(datos.abandono.pct)} de los que llegaron). Nadie lleva todavía 7 días sin jugar, así que algunos pueden seguir avanzando.</>}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-4 text-xs text-zinc-500">Todavía no hay un nivel donde la gente se quede.</p>
                  )}
                </>
              )}
            </Seccion>

            {/* 4. Niveles que echan gente */}
            <Seccion
              titulo="Niveles que echan gente"
              nota="Ordenados por intentos por victoria, de peor a mejor. Un intento es un tablero con al menos un vertido. Solo niveles con 3 intentos o más."
            >
              {datos.niveles.length === 0 ? <SinDatos texto="Ningún nivel tiene 3 intentos en este rango." /> : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#13131A]">
                      <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
                        <th className="text-left  font-medium py-2 pr-3">Nivel</th>
                        <th className="text-right font-medium py-2 px-2">Intentos por victoria</th>
                        <th className="text-right font-medium py-2 px-2">Intentos</th>
                        <th className="text-right font-medium py-2 px-2">Victorias</th>
                        <th className="text-right font-medium py-2 px-2">Reinicios</th>
                        <th className="text-right font-medium py-2 px-2">Sin salida</th>
                        <th className="text-right font-medium py-2 px-2">Jugadores</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.niveles.map(l => (
                        <tr key={l.nivel} className="border-b border-[#2A2A3A]/60 last:border-0">
                          <td className="py-2 pr-3 text-white tabular-nums">{l.nivel}</td>
                          <td className="py-2 px-2 text-right tabular-nums">
                            {l.intentosPorVictoria === null
                              ? <span className="text-red-400 font-semibold flex items-center justify-end gap-1"><AlertTriangle size={11} />nadie lo ganó</span>
                              : <span className={`font-semibold ${l.intentosPorVictoria >= 3 ? 'text-red-400' : l.intentosPorVictoria >= 1.8 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {dec(l.intentosPorVictoria)}
                                </span>}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(l.intentos)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(l.victorias)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(l.reinicios)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(l.sinSalida)}</td>
                          <td className="py-2 px-2 text-right tabular-nums text-zinc-500">{numero(l.jugadores)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Seccion>

            {/* 5. Economía */}
            <Seccion titulo="Economía y ayudas">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div>
                  <h3 className="text-xs font-semibold text-white mb-2">Comodines usados</h3>
                  {datos.comodines.length === 0 ? <SinDatos texto="Nadie usó un comodín en este rango." /> : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
                          <th className="text-left  font-medium py-2 pr-3">Comodín</th>
                          <th className="text-right font-medium py-2 px-2">Usos</th>
                          <th className="text-right font-medium py-2 px-2">Por video</th>
                          <th className="text-right font-medium py-2 px-2">Jugadores</th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.comodines.map(c => (
                          <tr key={c.cual} className="border-b border-[#2A2A3A]/60 last:border-0">
                            <td className="py-2 pr-3 text-white">{NOMBRE_COMODIN[c.cual] ?? c.cual}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(c.usos)}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(c.porVideo)}</td>
                            <td className="py-2 px-2 text-right tabular-nums text-zinc-500">{numero(c.jugadores)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-white mb-2">Paneles de bloqueo</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] px-4 py-3">
                      <p className="text-xs text-amber-400 flex items-center gap-1.5 mb-1"><Coins size={12} />Sin monedas</p>
                      <p className="text-2xl font-black text-white tabular-nums">{numero(datos.paneles.sinMonedas)}</p>
                      <p className="text-[11px] text-zinc-500">veces · {numero(datos.paneles.sinMonedasJugadores)} jugadores</p>
                    </div>
                    <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] px-4 py-3">
                      <p className="text-xs text-red-400 flex items-center gap-1.5 mb-1"><Heart size={12} />Sin vidas</p>
                      <p className="text-2xl font-black text-white tabular-nums">{numero(datos.paneles.sinVidas)}</p>
                      <p className="text-[11px] text-zinc-500">veces · {numero(datos.paneles.sinVidasJugadores)} jugadores</p>
                    </div>
                  </div>
                  {datos.paneles.sinMonedasPorComodin.length > 0 && (
                    <p className="text-[11px] text-zinc-500">
                      Sin monedas al querer usar:{' '}
                      {datos.paneles.sinMonedasPorComodin
                        .map(x => `${NOMBRE_COMODIN[x.cual] ?? x.cual} (${numero(x.veces)})`)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            </Seccion>

            {/* 6. Pase y Desafío */}
            <Seccion titulo="Pase de temporada y Desafío" nota="Jugadores distintos, salvo donde dice otra cosa. El pase suma todas las temporadas del rango.">
              <h3 className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5"><Ticket size={13} className="text-[#FFFD02]" />Pase de temporada</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <Dato label="Lo abrieron" value={numero(datos.pase.abrieron)} sub={`${numero(datos.pase.aperturas)} aperturas`} />
                <Dato label="Subieron algún escalón" value={numero(datos.pase.subieron)}
                  sub={`${numero(datos.pase.escalones)} escalones · ${dec(datos.pase.escalonesPorJugador)} por jugador`} />
                <Dato label="Lo completaron" value={numero(datos.pase.completaron)} sub={`${pct(datos.pase.pctCompletan)} de los que lo conocen`} />
                <Dato label="Tocaron “próximamente”" value={numero(datos.pase.proximamente)} sub="El carril pago" />
              </div>

              <h3 className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5"><Swords size={13} className="text-[#FFFD02]" />Desafío (duelos)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
                      <th className="text-left  font-medium py-2 pr-3"></th>
                      <th className="text-right font-medium py-2 px-2">Jugadores</th>
                      <th className="text-right font-medium py-2 px-2">Empezados</th>
                      <th className="text-right font-medium py-2 px-2">Terminados</th>
                      <th className="text-right font-medium py-2 px-2">Ganados</th>
                      <th className="text-right font-medium py-2 px-2">Abandonados</th>
                    </tr>
                  </thead>
                  <tbody>
                    <FilaDuelos titulo="Duelos" d={datos.duelos.partidas} />
                    <FilaDuelos titulo="Práctica" d={datos.duelos.practica} />
                  </tbody>
                </table>
              </div>
            </Seccion>
          </div>
        )}
      </div>
    </div>
  )
}
