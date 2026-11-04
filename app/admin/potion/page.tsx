'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle, AlertTriangle, Loader2, TrendingDown, Coins, Heart, Swords, Ticket, Users, UserPlus,
  PlayCircle, Clock, Undo2, Lightbulb, FlaskRound,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'
import type { PotionPanel, PotionCohorte, PotionDuelos, PotionNivelEmbudo } from '@/app/api/admin/potion/route'
import type { PotionTiendas } from '@/lib/potion-tiendas'
import { RANGOS, RANGO_POR_DEFECTO, ETIQUETA_RANGO, LANZAMIENTO, type Rango } from '@/lib/potion-panel'
import { fmtDuracion } from '@/lib/format-duracion'
import { RefrescoControl, useRefrescoAlVolver } from '@/app/admin/_components/Refresco'
import { TarjetasArriba, DondeEsta } from './_partes/Arriba'
import { Crecimiento } from './_partes/Crecimiento'
import { Ganancia } from './_partes/Ganancia'
import {
  Bloque, Plegable, Subtitulo, Dato, SinDatos, TablaDeslizable, numero, pct, dec, diaCorto, tooltipStyle,
} from './_partes/piezas'

/**
 * Las estadísticas del juego Potion Bottle: Water Sort.
 *
 * Orden de arriba hacia abajo, pensado para entenderse de un vistazo:
 *
 *   1. Cinco tarjetas grandes (descargas, tienen la app, jugaron hoy,
 *      jugando ahora, nuevos hoy), siempre desde el lanzamiento.
 *   2. Dónde está el juego: países con banderas.
 *   3. Bloques con una pregunta cada uno: ¿Crece o se achica?, ¿Vuelven a
 *      jugar?, ¿Dónde abandonan?, ¿Cuánto genera?, Ayudas y pase. Lo que no
 *      es lo principal de cada uno queda plegado en "Ver detalle": no se
 *      sacó ningún dato de los que había antes.
 *
 * Los datos del juego vienen de OTRO proyecto de Supabase, el del juego, por
 * `/api/admin/potion` (clave secreta del lado del servidor). Los de Google
 * Play, App Store y AdMob salen del Supabase de Glynbox.
 *
 * Un `—` es "todavía no se puede saber", nunca un cero disfrazado.
 */

const NOMBRE_COMODIN: Record<string, string> = {
  botella: 'Botella extra',
  deshacer: 'Deshacer',
  pista: 'Pista',
}

const ICONO_COMODIN: Record<string, React.ReactNode> = {
  botella: <FlaskRound size={12} />,
  deshacer: <Undo2 size={12} />,
  pista: <Lightbulb size={12} />,
}

// ── Retención ──────────────────────────────────────────────────────────────

/**
 * Umbrales del semáforo, por día: volver al día siguiente es mucho más fácil
 * que volver al mes, y con un umbral único el día 30 estaría siempre en rojo.
 * Son los de referencia de los juegos de ingenio para celular.
 */
const UMBRAL: Record<'d1' | 'd3' | 'd7' | 'd30', { verde: number; amarillo: number }> = {
  d1: { verde: 40, amarillo: 25 },
  d3: { verde: 25, amarillo: 15 },
  d7: { verde: 15, amarillo: 8 },
  d30: { verde: 8, amarillo: 4 },
}

type Dia = keyof typeof UMBRAL

function colorRetencion(dia: Dia, v: number) {
  const u = UMBRAL[dia]
  return v >= u.verde ? 'verde' : v >= u.amarillo ? 'amarillo' : 'rojo'
}

const TONO = {
  verde: { texto: 'text-emerald-400', fondo: 'bg-emerald-500/10 border-emerald-500/40', luz: 'bg-emerald-400' },
  amarillo: { texto: 'text-amber-400', fondo: 'bg-amber-500/10 border-amber-500/40', luz: 'bg-amber-400' },
  rojo: { texto: 'text-red-400', fondo: 'bg-red-500/10 border-red-500/40', luz: 'bg-red-400' },
}

/**
 * La retención de todas las cohortes que ya cumplieron el plazo, juntas:
 * volvieron / llegaron. No es el promedio de los porcentajes de cada día, que
 * le daría el mismo peso a un día con 2 jugadores que a uno con 50.
 */
function retencionJunta(cohortes: PotionCohorte[], dia: Dia): { pct: number | null; llegaron: number } {
  const clavePct = `${dia}Pct` as const
  let volvieron = 0
  let llegaron = 0
  for (const c of cohortes) {
    if (c[clavePct] === null) continue
    volvieron += c[dia]
    llegaron += c.llegaron
  }
  return { pct: llegaron > 0 ? Math.round((volvieron / llegaron) * 1000) / 10 : null, llegaron }
}

function Semaforo({ dia, titulo, cohortes }: { dia: Dia; titulo: string; cohortes: PotionCohorte[] }) {
  const r = retencionJunta(cohortes, dia)
  const color = r.pct === null ? null : colorRetencion(dia, r.pct)
  const t = color ? TONO[color] : null
  return (
    <div className={`rounded-xl border px-4 py-3 ${t ? t.fondo : 'border-[#2A2A3A] bg-[#0A0A0F]'}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-3 h-3 rounded-full shrink-0 ${t ? t.luz : 'bg-zinc-600'}`} />
        <p className="text-xs text-white font-semibold">{titulo}</p>
      </div>
      <p className={`text-3xl font-black tabular-nums ${t ? t.texto : 'text-zinc-500'}`}>{pct(r.pct)}</p>
      <p className="text-[11px] text-zinc-500 mt-0.5">
        {r.pct === null ? 'Todavía no pasó el tiempo' : `de ${numero(r.llegaron)} jugadores`}
      </p>
    </div>
  )
}

function CeldaRetencion({ dia, valor, pctValor }: { dia: Dia; valor: number; pctValor: number | null }) {
  if (pctValor === null) {
    return (
      <td className="py-2 px-2 text-right">
        <span className="text-zinc-600" title="Todavía no pasó ese día">—</span>
      </td>
    )
  }
  return (
    <td className="py-2 px-2 text-right tabular-nums">
      <span className={`font-semibold ${TONO[colorRetencion(dia, pctValor)].texto}`}>{pctValor}%</span>
      <span className="text-zinc-600 text-[11px] ml-1">({valor})</span>
    </td>
  )
}

function TablaRetencion({ cohortes }: { cohortes: PotionCohorte[] }) {
  if (cohortes.length === 0) return <SinDatos texto="Nadie llegó en este período." />
  return (
    <TablaDeslizable alto>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[#0A0A0F]">
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
              <CeldaRetencion dia="d1" valor={c.d1} pctValor={c.d1Pct} />
              <CeldaRetencion dia="d3" valor={c.d3} pctValor={c.d3Pct} />
              <CeldaRetencion dia="d7" valor={c.d7} pctValor={c.d7Pct} />
              <CeldaRetencion dia="d30" valor={c.d30} pctValor={c.d30Pct} />
            </tr>
          ))}
        </tbody>
      </table>
    </TablaDeslizable>
  )
}

// ── Abandono ───────────────────────────────────────────────────────────────

interface NivelAbandono { nivel: number; cantidad: number; pct: number | null }

/**
 * Los 3 niveles donde más gente deja de jugar, con el mismo criterio que el
 * principal de la ruta (`abandonoPrincipal`): primero los que se fueron de
 * verdad (7 días sin aparecer); si nadie cumple eso todavía, donde más gente
 * está parada, sin contar el último nivel al que llegó alguien.
 */
function tresAbandonos(embudo: PotionNivelEmbudo[]): { niveles: NivelAbandono[]; confirmado: boolean } {
  const confirmado = embudo.some(e => e.seFueron > 0)
  const tope = embudo.length > 0 ? embudo[embudo.length - 1].nivel : null
  const clave = confirmado ? 'seFueron' : 'quedaron'
  const niveles = embudo
    .filter(e => e[clave] > 0 && (confirmado || e.nivel !== tope))
    .sort((a, b) => b[clave] - a[clave] || a.nivel - b.nivel)
    .slice(0, 3)
    .map(e => ({
      nivel: e.nivel,
      cantidad: e[clave],
      pct: e.jugadores > 0 ? Math.round((e[clave] / e.jugadores) * 1000) / 10 : null,
    }))
  return { niveles, confirmado }
}

// ── Duelos ─────────────────────────────────────────────────────────────────

function TarjetasDuelos({ titulo, d }: { titulo: string; d: PotionDuelos }) {
  return (
    <div>
      <p className="text-xs font-semibold text-white mb-2">{titulo}</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Dato label="Jugadores" value={numero(d.jugadores)} />
        <Dato label="Empezados" value={numero(d.empezados)} />
        <Dato label="Terminados" value={numero(d.terminados)} />
        <Dato label="Ganados" value={numero(d.ganados)} sub={`${pct(d.pctGanados)} de los terminados`} />
        <Dato label="Abandonados" value={numero(d.abandonados)} sub={`${numero(d.conElBoton)} con el botón de salir`} />
      </div>
    </div>
  )
}

// ── Vacío ──────────────────────────────────────────────────────────────────

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
  const [tiendas, setTiendas] = useState<PotionTiendas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null)

  /** Sólo se pinta la respuesta del último pedido: cambiar el filtro rápido no la pisa con una vieja. */
  const ultimoPedido = useRef(0)

  /** Sube con cada refresco a mano o al volver a la pestaña: los bloques con fetch propio lo escuchan. */
  const [recarga, setRecarga] = useState(0)
  function actualizar() {
    setRecarga(v => v + 1)
    void cargar()
    void cargarTiendas()
  }

  async function cargarTiendas() {
    try {
      const res = await fetch('/api/admin/potion/tiendas', { cache: 'no-store' })
      if (res.ok) setTiendas(await res.json())
    } catch { /* las tarjetas muestran — */ }
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
  useEffect(() => { void cargarTiendas() }, [])
  useRefrescoAlVolver(actualizar, actualizadoEn)

  const r = datos?.resumen
  const desde = lanzamiento ? LANZAMIENTO.slice(0, 10) : undefined
  const ok = datos && datos.disponible && r
  const etiquetaRango = ETIQUETA_RANGO[rango].toLowerCase()

  const maxEmbudo = datos?.embudo.reduce((m, e) => Math.max(m, e.jugadores), 0) ?? 0
  const abandonos = datos ? tresAbandonos(datos.embudo) : { niveles: [], confirmado: false }
  const enRojo = new Set(abandonos.niveles.map(n => n.nivel))

  return (
    <div className="min-h-screen pb-20">
      {/* Encabezado */}
      <div className="bg-[#13131A] border-b border-[#2A2A3A] px-4 sm:px-6 py-4 sm:py-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/potion-icono.png" alt="" width={40} height={40} className="w-10 h-10 rounded-xl shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-white">Potion Bottle</h1>
            <p className="text-sm text-[#A0A0B0] mt-0.5">Water Sort · cómo le va al juego</p>
          </div>
        </div>
        <RefrescoControl actualizadoEn={actualizadoEn} cargando={cargando} onActualizar={actualizar} />
      </div>

      <div className="px-4 sm:px-6 py-5 sm:py-6 space-y-6 max-w-6xl">

        {/* 1. Las cinco tarjetas */}
        <TarjetasArriba tiendas={tiendas} />

        {/* 2. Países */}
        <DondeEsta tiendas={tiendas} />

        {/* 3. Crecimiento: Google Play, con su propio 7 / 30 días */}
        <Crecimiento recarga={recarga} desde={desde} />

        {/* El período de los bloques que siguen */}
        <div className="rounded-2xl border border-[#2A2A3A] bg-[#13131A] px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-sm text-white font-semibold">Período</p>
          <div className="flex rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] p-1">
            {RANGOS.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setRango(v)}
                aria-pressed={rango === v}
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
            Sólo desde el lanzamiento (13/10/2026)
          </label>
          <p className="text-[11px] text-zinc-500 w-full">
            Cambia ¿Vuelven a jugar?, ¿Dónde abandonan?, Ayudas y pase y el detalle de compras. La casilla también
            recorta Google Play y los anuncios. Días de Argentina.
          </p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {!datos && cargando && (
          <div className="py-16 flex items-center justify-center">
            <Loader2 size={28} className="animate-spin text-[#FFFD02]" />
          </div>
        )}

        {datos && !datos.disponible && <Vacio motivo={datos.motivo} />}

        {ok && (
          <div className={`space-y-6 transition-opacity ${cargando ? 'opacity-60' : ''}`}>

            {/* 4. Retención */}
            <Bloque
              titulo="¿Vuelven a jugar?"
              frase="De los que lo probaron, cuántos volvieron a abrirlo 1, 3, 7 y 30 días después. Verde es bueno, rojo es para preocuparse."
            >
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Semaforo dia="d1" titulo="Al día siguiente" cohortes={datos.retencion} />
                <Semaforo dia="d3" titulo="A los 3 días" cohortes={datos.retencion} />
                <Semaforo dia="d7" titulo="A la semana" cohortes={datos.retencion} />
                <Semaforo dia="d30" titulo="Al mes" cohortes={datos.retencion} />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                <Dato icono={<Users size={12} />} tono="text-[#FFFD02]" label="Jugadores"
                  value={numero(r.jugadores)} sub={`jugaron en: ${etiquetaRango}`} />
                <Dato icono={<UserPlus size={12} />} tono="text-teal-400" label="Nuevos en 7 días" value={numero(r.nuevos7d)} />
                <Dato icono={<PlayCircle size={12} />} tono="text-purple-400" label="Partidas abiertas hoy"
                  value={numero(r.sesionesHoy)} sub="cada vez que alguien abre el juego" />
                <Dato icono={<Clock size={12} />} tono="text-[#FFFD02]" label="Cuánto dura cada vez"
                  value={fmtDuracion(r.duracionMediaSeg)}
                  sub={r.sesionesMedidas > 0 ? `promedio con el juego en pantalla, de ${numero(r.sesionesMedidas)} medidas` : 'con el juego en pantalla'} />
              </div>

              <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
                Semáforo al día siguiente: verde desde 40%, amarillo desde 25%. A los 3 días: 25% / 15%. A la semana:
                15% / 8%. Al mes: 8% / 4%. Suma todos los días de llegada que ya cumplieron el plazo.
              </p>

              <Plegable>
                <p className="text-xs text-[#A0A0B0] leading-relaxed">
                  Por día de llegada: de los que jugaron por primera vez ese día, qué porcentaje volvió a jugar
                  exactamente al día 1, 3, 7 y 30. Un guión es que todavía no pasó ese día, no un cero.
                </p>
                <TablaRetencion cohortes={datos.retencion} />
              </Plegable>
            </Bloque>

            {/* 5. Embudo */}
            <Bloque
              titulo="¿Dónde abandonan?"
              frase="Cuántos jugadores llegaron a cada nivel. En rojo, los 3 niveles donde más gente deja de jugar."
            >
              {datos.embudo.length === 0 ? <SinDatos /> : (
                <>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={datos.embudo} margin={{ top: 5, right: 6, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" vertical={false} />
                        <XAxis dataKey="nivel" tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={12} />
                        <YAxis tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false}
                          allowDecimals={false} domain={[0, Math.max(1, maxEmbudo)]} />
                        <Tooltip {...tooltipStyle} labelStyle={{ color: '#FFFD02' }} labelFormatter={v => `Nivel ${v}`} />
                        <Bar dataKey="jugadores" name="Jugadores" radius={[3, 3, 0, 0]} minPointSize={2}>
                          {datos.embudo.map(e => (
                            <Cell key={e.nivel} fill={enRojo.has(e.nivel) ? '#EF4444' : '#FFFD02'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {abandonos.niveles.length === 0 ? (
                    <p className="mt-4 text-xs text-zinc-500">Todavía no hay un nivel donde la gente se quede.</p>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {abandonos.niveles.map((n, i) => (
                        <div key={n.nivel} className="rounded-xl border border-red-900/60 bg-red-500/10 px-4 py-3 flex items-start gap-3">
                          <TrendingDown size={18} className="text-red-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm text-white font-semibold">{i + 1}.º · Nivel {n.nivel}</p>
                            <p className="text-xs text-[#A0A0B0] mt-0.5">
                              {abandonos.confirmado
                                ? <>{numero(n.cantidad)} {n.cantidad === 1 ? 'llegó hasta acá y hace 7 días o más que no juega' : 'llegaron hasta acá y hace 7 días o más que no juegan'} ({pct(n.pct)} de los que llegaron).</>
                                : <>{numero(n.cantidad)} {n.cantidad === 1 ? 'está parado' : 'están parados'} acá ({pct(n.pct)} de los que llegaron).</>}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {abandonos.niveles.length > 0 && !abandonos.confirmado && (
                    <p className="mt-2 text-[11px] text-zinc-500">
                      Nadie lleva todavía 7 días sin jugar, así que algunos pueden seguir avanzando.
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-zinc-500">
                    Cuenta jugadores distintos que empezaron cada nivel; volver a jugar uno ya ganado no suma.
                  </p>
                </>
              )}

              <Plegable titulo="Ver los niveles más difíciles">
                <p className="text-xs text-[#A0A0B0] leading-relaxed">
                  Ordenados por cuántos intentos hacen falta para ganar cada nivel, del más difícil al más fácil.
                  Un intento es un tablero en el que se movió al menos una vez. Sólo niveles con 3 intentos o más.
                  &quot;Sin salida&quot; es cuando el tablero quedó trabado.
                </p>
                {datos.niveles.length === 0 ? <SinDatos texto="Ningún nivel tiene 3 intentos en este período." /> : (
                  <TablaDeslizable alto>
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-[#0A0A0F]">
                        <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
                          <th className="text-left  font-medium py-2 pr-3">Nivel</th>
                          <th className="text-right font-medium py-2 px-2">Intentos para ganar</th>
                          <th className="text-right font-medium py-2 px-2">Intentos</th>
                          <th className="text-right font-medium py-2 px-2">Ganados</th>
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
                  </TablaDeslizable>
                )}
              </Plegable>
            </Bloque>
          </div>
        )}

        {/* 6. Ganancia: fuera de `datos`, se ve aunque falle la conexión con el juego */}
        <Ganancia recarga={recarga} desde={desde} rango={rango} lanzamiento={lanzamiento} />

        {ok && (
          <div className={`transition-opacity ${cargando ? 'opacity-60' : ''}`}>
            {/* 7. Ayudas y pase */}
            <Bloque
              titulo="Ayudas y pase"
              frase="Qué ayudas usan, cuántas veces se quedan sin monedas o sin vidas, y cómo va el pase de temporada y los duelos."
            >
              <Subtitulo>Comodines usados</Subtitulo>
              {datos.comodines.length === 0 ? <SinDatos texto="Nadie usó un comodín en este período." /> : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {datos.comodines.map(c => (
                    <Dato key={c.cual} icono={ICONO_COMODIN[c.cual]} tono="text-[#FFFD02]"
                      label={NOMBRE_COMODIN[c.cual] ?? c.cual} value={numero(c.usos)}
                      sub={`${numero(c.porVideo)} mirando un video · ${numero(c.jugadores)} jugadores`} />
                  ))}
                </div>
              )}

              <div className="mt-6">
                <Subtitulo>Se quedaron sin…</Subtitulo>
                <div className="grid grid-cols-2 gap-3">
                  <Dato icono={<Coins size={12} />} tono="text-amber-400" label="Sin monedas"
                    value={numero(datos.paneles.sinMonedas)} sub={`veces · ${numero(datos.paneles.sinMonedasJugadores)} jugadores`} />
                  <Dato icono={<Heart size={12} />} tono="text-red-400" label="Sin vidas"
                    value={numero(datos.paneles.sinVidas)} sub={`veces · ${numero(datos.paneles.sinVidasJugadores)} jugadores`} />
                </div>
                {datos.paneles.sinMonedasPorComodin.length > 0 && (
                  <p className="text-[11px] text-zinc-500 mt-2">
                    Sin monedas al querer usar:{' '}
                    {datos.paneles.sinMonedasPorComodin
                      .map(x => `${NOMBRE_COMODIN[x.cual] ?? x.cual} (${numero(x.veces)})`)
                      .join(' · ')}
                  </p>
                )}
              </div>

              <div className="mt-6">
                <p className="text-[11px] uppercase tracking-wide text-[#A0A0B0] mb-2 flex items-center gap-1.5">
                  <Ticket size={12} className="text-[#FFFD02]" />Pase de temporada
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Dato label="Lo abrieron" value={numero(datos.pase.abrieron)} sub={`${numero(datos.pase.aperturas)} veces`} />
                  <Dato label="Subieron algún escalón" value={numero(datos.pase.subieron)}
                    sub={`${numero(datos.pase.escalones)} escalones · ${dec(datos.pase.escalonesPorJugador)} por jugador`} />
                  <Dato label="Lo completaron" value={numero(datos.pase.completaron)} sub={`${pct(datos.pase.pctCompletan)} de los que lo conocen`} />
                  <Dato label="Tocaron “próximamente”" value={numero(datos.pase.proximamente)} sub="el pase pago" />
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <p className="text-[11px] uppercase tracking-wide text-[#A0A0B0] flex items-center gap-1.5">
                  <Swords size={12} className="text-[#FFFD02]" />Desafío (duelos)
                </p>
                <TarjetasDuelos titulo="Duelos" d={datos.duelos.partidas} />
                <TarjetasDuelos titulo="Práctica" d={datos.duelos.practica} />
              </div>

              <p className="text-[11px] text-zinc-500 mt-4">
                Jugadores distintos, salvo donde dice otra cosa. El pase suma todas las temporadas del período.
              </p>
            </Bloque>
          </div>
        )}
      </div>
    </div>
  )
}
