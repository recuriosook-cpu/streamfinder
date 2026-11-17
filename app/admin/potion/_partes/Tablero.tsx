'use client'

import { useState } from 'react'
import {
  AlertTriangle, AlertCircle, Download, Smartphone, CalendarCheck, CalendarDays, Trophy, Sparkles,
  Info, Bot, FlaskConical, Undo2, Loader2,
} from 'lucide-react'
import { FlagCircle } from '@/components/CountrySelector'
import { nombrePais } from '@/app/admin/_components/GrillasMetricas'
import type { PotionTablero, Dato, Jugador, Alerta, Plataforma } from '@/lib/potion-tablero'
import { numero } from './piezas'

/**
 * Las pestañas "Jugadores" y "Prueba y robots" de `/admin/potion`. Los datos
 * los arma `lib/potion-tablero.ts` y llegan por `/api/admin/potion/tablero`.
 *
 * Regla de la pantalla: un número que no se pudo leer dice "sin dato" y por
 * qué. Nunca un 0. Y cada número dice de cuándo es.
 */

const ZONA = 'America/Argentina/Buenos_Aires'

function fecha(iso: string, conHora = false): string {
  const d = new Date(iso)
  return d.toLocaleString('es-AR', {
    timeZone: ZONA, day: 'numeric', month: 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  })
}

function diaDeDato(d: string): string {
  const [, m, dd] = d.split('-')
  return `${Number(dd)}/${Number(m)}`
}

function haceDias(iso: string): string {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
  const dia = new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONA })
  const n = Math.round((Date.parse(hoy) - Date.parse(dia)) / 86_400_000)
  return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`
}

const NOMBRE: Record<Plataforma, string> = { android: 'Android', ios: 'iPhone' }
const COLOR: Record<Plataforma, string> = { android: 'text-emerald-400', ios: 'text-sky-400' }

// ── Tarjetas ───────────────────────────────────────────────────────────────

function Valor({ plataforma, d }: { plataforma: Plataforma; d: Dato }) {
  return (
    <div className="min-w-0">
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${COLOR[plataforma]}`}>{NOMBRE[plataforma]}</p>
      {d.valor === null ? (
        <>
          <p className="text-xl font-bold text-amber-400 leading-tight mt-0.5">sin dato</p>
          <p className="text-[11px] text-amber-200/80 leading-snug mt-1 break-words">{d.motivo}</p>
        </>
      ) : (
        <>
          <p className="text-3xl sm:text-4xl font-black text-white tabular-nums leading-none mt-1">{numero(d.valor)}</p>
          <p className={`text-[11px] mt-1.5 leading-snug ${d.atrasado ? 'text-amber-400' : 'text-zinc-500'}`}>
            {d.fecha ? (d.tipoFecha === 'dia' ? `dato del ${diaDeDato(d.fecha)}` : `al ${fecha(d.fecha, true)}`) : '—'}
            {d.atrasado && <> · atrasado</>}
          </p>
        </>
      )}
    </div>
  )
}

function Tarjeta({ icono, titulo, par }: { icono: React.ReactNode; titulo: string; par: Record<Plataforma, Dato> }) {
  const nota = par.android.nota && par.android.nota === par.ios.nota ? par.android.nota : null
  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4 flex flex-col min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-lg bg-[#FFFD02]/10 text-[#FFFD02] flex items-center justify-center shrink-0">{icono}</span>
        <h2 className="text-sm font-semibold text-white leading-tight">{titulo}</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Valor plataforma="android" d={par.android} />
        <Valor plataforma="ios" d={par.ios} />
      </div>
      <div className="mt-auto pt-3 space-y-1">
        {nota ? <p className="text-[11px] text-zinc-500 leading-snug">{nota}</p> : (
          <>
            {par.android.nota && <p className="text-[11px] text-zinc-500 leading-snug"><span className={COLOR.android}>Android:</span> {par.android.nota}</p>}
            {par.ios.nota && <p className="text-[11px] text-zinc-500 leading-snug"><span className={COLOR.ios}>iPhone:</span> {par.ios.nota}</p>}
          </>
        )}
      </div>
    </section>
  )
}

// ── Avisos y alertas ───────────────────────────────────────────────────────

export function Avisos({ avisos }: { avisos: Alerta[] }) {
  if (avisos.length === 0) return null
  const hayError = avisos.some(a => a.nivel === 'error')
  return (
    <div
      role="alert"
      className={`rounded-2xl border px-4 py-3 ${hayError ? 'bg-red-950/40 border-red-800' : 'bg-amber-950/30 border-amber-800/70'}`}
    >
      <p className={`text-sm font-semibold flex items-center gap-2 ${hayError ? 'text-red-300' : 'text-amber-300'}`}>
        <AlertTriangle size={16} className="shrink-0" />
        {hayError ? 'Hay datos que no se pudieron leer o no están al día' : 'Hay datos atrasados'}
      </p>
      <ul className="mt-2 space-y-1.5">
        {avisos.map((a, i) => (
          <li key={i} className="text-[13px] leading-snug flex gap-2">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${a.nivel === 'error' ? 'bg-red-400' : 'bg-amber-400'}`} />
            <span className={a.nivel === 'error' ? 'text-red-100' : 'text-amber-100'}>{a.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Alertas({ alertas }: { alertas: Alerta[] }) {
  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-white mb-3">Alertas</h2>
      {alertas.length === 0 ? (
        <p className="text-sm text-[#A0A0B0]">
          Nada nuevo: nadie llegó al último nivel en los últimos 30 días y no hubo jugadores nuevos de iPhone esta semana.
        </p>
      ) : (
        <ul className="space-y-2">
          {alertas.map((a, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm">
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                a.tipo === 'ultimo_nivel' ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300'
              }`}>
                {a.tipo === 'ultimo_nivel' ? <Trophy size={14} /> : <Sparkles size={14} />}
              </span>
              <div className="min-w-0">
                <p className="text-white leading-snug">{a.texto}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  {a.fecha ? fecha(a.fecha, true) : ''}{a.jugador ? ` · ${a.jugador.slice(0, 8)}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Listado ────────────────────────────────────────────────────────────────

function Pais({ codigo }: { codigo: string | null }) {
  if (!codigo) return <span className="text-zinc-500 text-xs" title="Sin dato: el país se anota desde el 16/11, cuando el jugador vuelve a abrir el juego">sin dato</span>
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0" title={nombrePais(codigo)}>
      <FlagCircle code={codigo} size={18} />
      <span className="text-white text-xs truncate">{nombrePais(codigo)}</span>
    </span>
  )
}

function Aparato({ j }: { j: Jugador }) {
  const p = j.plataforma
  const nombre = p === 'ios' ? 'iPhone' : p === 'android' ? 'Android' : 'Web'
  const color = p === 'ios' ? 'text-sky-400' : p === 'android' ? 'text-emerald-400' : 'text-zinc-400'
  return (
    <span className="whitespace-nowrap">
      <span className={`${color} font-semibold text-xs`}>{nombre}</span>
      <span className="text-zinc-500 text-[11px] ml-1.5">{j.version || '—'}</span>
    </span>
  )
}

function Nivel({ j }: { j: Jugador }) {
  if (j.termino) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-[11px] font-bold text-amber-300 whitespace-nowrap">
        <Trophy size={11} /> Terminó · {j.totalNiveles} de {j.totalNiveles}
      </span>
    )
  }
  const actual = j.nivelActual
  const total = j.totalNiveles
  return (
    <span className="inline-flex flex-col gap-1 min-w-[92px]">
      <span className="text-xs text-white tabular-nums whitespace-nowrap">
        {actual === null ? '—' : numero(actual)}
        <span className="text-zinc-500"> de {total === null ? 'sin dato' : numero(total)}</span>
      </span>
      {actual !== null && total !== null && (
        <span className="h-1 rounded-full bg-[#1C1C27] overflow-hidden w-full">
          <span className="block h-full bg-[#FFFD02]/70" style={{ width: `${Math.min(100, (actual / total) * 100)}%` }} />
        </span>
      )}
    </span>
  )
}

function Mover({ j, onMover }: { j: Jugador; onMover: (id: string, clase: 'prueba' | 'real' | null) => Promise<void> }) {
  const [ocupado, setOcupado] = useState(false)
  const accion: { clase: 'prueba' | 'real' | null; texto: string; icono: React.ReactNode } =
    j.clase === 'real'
      ? { clase: 'prueba', texto: 'Pasar a prueba', icono: <FlaskConical size={12} /> }
      : j.marcado
        ? { clase: null, texto: 'Quitar marca', icono: <Undo2 size={12} /> }
        : { clase: 'real', texto: 'Es real', icono: <Undo2 size={12} /> }
  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={async () => { setOcupado(true); try { await onMover(j.id, accion.clase) } finally { setOcupado(false) } }}
      className="inline-flex items-center gap-1 rounded-lg border border-[#2A2A3A] px-2 py-1 text-[11px] text-[#A0A0B0] hover:text-white hover:border-zinc-500 disabled:opacity-50 whitespace-nowrap"
    >
      {ocupado ? <Loader2 size={12} className="animate-spin" /> : accion.icono}{accion.texto}
    </button>
  )
}

function Listado({
  jugadores, conMotivo, onMover, vacio,
}: {
  jugadores: Jugador[]
  conMotivo: boolean
  onMover: (id: string, clase: 'prueba' | 'real' | null) => Promise<void>
  vacio: string
}) {
  if (jugadores.length === 0) return <p className="text-sm text-[#A0A0B0] py-6 text-center">{vacio}</p>
  return (
    <>
      {/* Compu: tabla */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-zinc-500 border-b border-[#2A2A3A]">
              <th className="py-2 pr-3 font-medium">País</th>
              <th className="py-2 pr-3 font-medium">Aparato</th>
              <th className="py-2 pr-3 font-medium">Juega desde</th>
              <th className="py-2 pr-3 font-medium">Nivel</th>
              <th className="py-2 pr-3 font-medium">Último día</th>
              <th className="py-2 pr-3 font-medium text-right">Días jugados</th>
              {conMotivo && <th className="py-2 pr-3 font-medium">Por qué está acá</th>}
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {jugadores.map(j => (
              <tr key={j.id} className={`border-b border-[#1C1C27] align-middle ${j.termino ? 'bg-amber-500/[0.04]' : ''}`}>
                <td className="py-2.5 pr-3 max-w-[150px]"><Pais codigo={j.pais} /></td>
                <td className="py-2.5 pr-3">
                  <Aparato j={j} />
                  <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{j.id.slice(0, 8)}</p>
                </td>
                <td className="py-2.5 pr-3 text-xs text-white whitespace-nowrap">{fecha(j.desde)}</td>
                <td className="py-2.5 pr-3"><Nivel j={j} /></td>
                <td className="py-2.5 pr-3 text-xs whitespace-nowrap">
                  <span className="text-white">{fecha(j.ultimo)}</span>
                  <span className="text-zinc-500"> · {haceDias(j.ultimo)}</span>
                </td>
                <td className="py-2.5 pr-3 text-xs text-white tabular-nums text-right">{numero(j.dias)}</td>
                {conMotivo && (
                  <td className="py-2.5 pr-3 text-[11px] text-[#A0A0B0] max-w-[280px] leading-snug">
                    {j.clase === 'robot' && <Bot size={11} className="inline mr-1 -mt-0.5" />}{j.motivo}
                  </td>
                )}
                <td className="py-2.5 text-right"><Mover j={j} onMover={onMover} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular: tarjetas */}
      <ul className="md:hidden space-y-2.5">
        {jugadores.map(j => (
          <li key={j.id} className={`rounded-xl border p-3 ${j.termino ? 'border-amber-500/40 bg-amber-500/[0.05]' : 'border-[#2A2A3A] bg-[#0A0A0F]'}`}>
            <div className="flex items-center justify-between gap-2">
              <Pais codigo={j.pais} />
              <Aparato j={j} />
            </div>
            <div className="mt-2.5"><Nivel j={j} /></div>
            <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
              <div><dt className="text-zinc-500">Desde</dt><dd className="text-white">{fecha(j.desde)}</dd></div>
              <div><dt className="text-zinc-500">Último día</dt><dd className="text-white">{haceDias(j.ultimo)}</dd></div>
              <div><dt className="text-zinc-500">Días jugados</dt><dd className="text-white tabular-nums">{numero(j.dias)}</dd></div>
            </dl>
            {conMotivo && j.motivo && <p className="mt-2 text-[11px] text-[#A0A0B0] leading-snug">{j.motivo}</p>}
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-zinc-600 font-mono">{j.id.slice(0, 8)}</span>
              <Mover j={j} onMover={onMover} />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}

// ── Las dos pestañas ───────────────────────────────────────────────────────

export function Jugadores({ t, onMover }: { t: PotionTablero; onMover: (id: string, clase: 'prueba' | 'real' | null) => Promise<void> }) {
  const terminaron = t.reales.filter(j => j.termino).length
  return (
    <div className="space-y-5">
      <Avisos avisos={t.avisos} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Tarjeta icono={<Download size={16} />} titulo="Descargas totales" par={t.tarjetas.descargas} />
        <Tarjeta icono={<Smartphone size={16} />} titulo="Tienen el juego" par={t.tarjetas.tienen} />
        <Tarjeta icono={<CalendarCheck size={16} />} titulo="Jugaron hoy" par={t.tarjetas.hoy} />
        <Tarjeta icono={<CalendarDays size={16} />} titulo="Jugaron en la semana" par={t.tarjetas.semana} />
      </div>

      <Alertas alertas={t.alertas} />

      <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-white">
            Jugadores reales <span className="text-zinc-500 font-normal">· {numero(t.reales.length)}</span>
          </h2>
          <p className="text-[11px] text-zinc-500">
            {terminaron > 0 ? `${numero(terminaron)} terminaron el juego · ` : ''}el que jugó más recién, primero
          </p>
        </div>
        <Listado jugadores={t.reales} conMotivo={false} onMover={onMover} vacio="Todavía no hay jugadores reales." />
        <p className="text-[11px] text-zinc-500 mt-3 flex items-start gap-1.5 leading-snug">
          <Info size={12} className="shrink-0 mt-0.5" />
          Un jugador es una instalación del juego: si alguien lo borra y lo vuelve a bajar, aparece dos veces. El país
          se anota desde el 16/11, cuando el jugador vuelve a abrir el juego. El nivel es hasta dónde llegó, sobre los
          niveles de la versión que tiene.
        </p>
      </section>
    </div>
  )
}

export function Prueba({ t, onMover }: { t: PotionTablero; onMover: (id: string, clase: 'prueba' | 'real' | null) => Promise<void> }) {
  const robots = t.prueba.filter(j => j.clase === 'robot')
  const otros = t.prueba.filter(j => j.clase !== 'robot')
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[#2A2A3A] bg-[#13131A] px-4 py-3 text-[13px] text-[#A0A0B0] leading-relaxed">
        Estos aparatos no cuentan en ningún número de la pestaña Jugadores. No se borra nada: si alguno está mal
        puesto, tocá <span className="text-white">Es real</span> y pasa a contar.
        {t.versionesIos.length > 0 && (
          <> Versiones de iPhone en la App Store: {t.versionesIos.map(v => `${v.version} desde el ${fecha(v.desde)}`).join(', ')}.</>
        )}
      </div>
      <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <FlaskConical size={15} className="text-[#FFFD02]" />
          Aparatos de prueba <span className="text-zinc-500 font-normal">· {numero(otros.length)}</span>
        </h2>
        <Listado jugadores={otros} conMotivo onMover={onMover} vacio="Ninguno." />
      </section>
      <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Bot size={15} className="text-[#FFFD02]" />
          Robots de Google <span className="text-zinc-500 font-normal">· {numero(robots.length)}</span>
        </h2>
        <Listado jugadores={robots} conMotivo onMover={onMover} vacio="Ninguno." />
      </section>
    </div>
  )
}

export function ErrorTablero({ texto }: { texto: string }) {
  return (
    <div className="bg-red-900/30 border border-red-800 rounded-xl px-5 py-4 flex items-start gap-3">
      <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
      <p className="text-sm text-red-300">{texto}</p>
    </div>
  )
}
