'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle, AlertCircle, Download, Smartphone, CalendarDays, Trophy, Sparkles,
  Info, Bot, FlaskConical, Undo2, Loader2, Layers,
} from 'lucide-react'
import {
  useFiltrosJugadores, filtrar, ordenar, cuantosFiltros, PanelFiltros, Encabezado, NOMBRE_COLUMNA, estadoDe,
  type Orden, type Columna, type Estado,
} from './FiltrosJugadores'
import { FlagCircle } from '@/components/CountrySelector'
import { nombrePais } from '@/app/admin/_components/GrillasMetricas'
import type { PotionTablero, Dato, Jugador, Alerta, Plataforma, Separacion } from '@/lib/potion-tablero'
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

const COLOR: Record<Plataforma, string> = { android: 'text-emerald-400', ios: 'text-sky-400' }

// ── Las tres tarjetas de arriba ────────────────────────────────────────────
//
// Con la forma de las del Resumen de Glynbox: un número grande, qué es, el
// detalle renglón por renglón y, al final, las aclaraciones en gris chico.

function diasDeAtraso(dia: string): number {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
  return Math.round((Date.parse(hoy) - Date.parse(dia)) / 86_400_000)
}

/** "último día que mandó: 11/11 · 8 días de atraso" o "contado hoy a las 01:07". */
function deCuando(d: Dato): string {
  if (!d.fecha) return ''
  if (d.tipoFecha === 'momento') {
    const hora = new Date(d.fecha).toLocaleTimeString('es-AR', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false })
    return haceDias(d.fecha) === 'hoy' ? `Contado hoy a las ${hora}` : `Contado el ${fecha(d.fecha, true)}`
  }
  const n = diasDeAtraso(d.fecha)
  return `Último día que mandó: ${diaDeDato(d.fecha)} · ${n <= 0 ? 'al día' : n === 1 ? '1 día de atraso' : `${n} días de atraso`}`
}

/** "al 17/11 (5 días de atraso)": el atraso sólo si es más que el normal. */
function alDia(d: Dato): string {
  if (!d.fecha) return ''
  if (d.tipoFecha === 'momento') return `al ${fecha(d.fecha, true)}`
  const n = diasDeAtraso(d.fecha)
  return `al ${diaDeDato(d.fecha)}${d.atrasado ? ` (${n} días de atraso)` : ''}`
}

/** Android más iPhone. Si falta uno, "sin dato" con el porqué: nunca una suma a medias. */
function suma(a: Dato, b: Dato): { valor: number | null; motivo?: string } {
  if (a.valor === null || b.valor === null) {
    return { valor: null, motivo: `Falta el dato de ${a.valor === null ? 'Android' : 'iPhone'}: no se puede sumar.` }
  }
  return { valor: a.valor + b.valor }
}

/** Un renglón de la tarjeta: el número en blanco y qué es. */
function Renglon({ n, children }: { n: number | null; children: React.ReactNode }) {
  return (
    <li>
      {n === null ? <span className="text-amber-400">sin dato</span> : <span className="text-white">{numero(n)}</span>} {children}
    </li>
  )
}

function TarjetaResumen({
  icono, color, valor, motivo, porcentaje, titulo, children, notas,
}: {
  icono: React.ReactNode
  color: string
  valor: number | null
  motivo?: string
  porcentaje?: number | null
  titulo: string
  children: React.ReactNode
  notas: (string | false | null | undefined)[]
}) {
  const visibles = notas.filter((n): n is string => Boolean(n))
  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6 flex flex-col min-w-0">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${color}`}>{icono}</div>
      {valor === null ? (
        <p className="text-3xl font-black text-amber-400">sin dato</p>
      ) : (
        <p className="text-3xl font-black text-white tabular-nums">
          {numero(valor)}
          {porcentaje != null && <span className="text-base font-bold text-emerald-400 ml-2">{porcentaje}%</span>}
        </p>
      )}
      <h2 className="text-sm text-[#A0A0B0] mt-1 font-medium">{titulo}</h2>
      {valor === null && motivo && <p className="text-xs text-amber-300 mt-0.5">{motivo}</p>}
      <ul className="mt-2 space-y-0.5 text-xs text-[#A0A0B0] tabular-nums">{children}</ul>
      {visibles.length > 0 && (
        <div className="mt-auto pt-3 space-y-1">
          {visibles.map(n => <p key={n} className="text-[11px] leading-snug text-[#6B6B80]">{n}</p>)}
        </div>
      )}
    </section>
  )
}

function TarjetasDeArriba({ t }: { t: PotionTablero }) {
  const { descargas, tienen, borraron: b, mes, semana, hoy } = t.tarjetas
  const bajadas = suma(descargas.android, descargas.ios)
  const loTienen = suma(tienen.android, tienen.ios)
  const jugaron = suma(mes.android, mes.ios)
  const porcentaje = loTienen.valor !== null && bajadas.valor ? Math.round((loTienen.valor / bajadas.valor) * 100) : null
  const sinDato = (d: Dato, donde: string) => d.valor === null && `${donde}: ${d.motivo}`

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <TarjetaResumen
        icono={<Download size={20} />} color="text-[#FFFD02] bg-[#FFFD02]/10"
        valor={bajadas.valor} motivo={bajadas.motivo} titulo="Se bajaron el juego"
        notas={[
          'Desde el lanzamiento (13/10). Google publica con 2 o 3 días de atraso; Apple, con uno.',
          sinDato(descargas.android, 'Android'),
          sinDato(descargas.ios, 'iPhone'),
        ]}
      >
        <Renglon n={descargas.android.valor}>en Android, según Google{descargas.android.fecha && ` · ${alDia(descargas.android)}`}</Renglon>
        <Renglon n={descargas.ios.valor}>en iPhone, según Apple{descargas.ios.fecha && ` · ${alDia(descargas.ios)}`}</Renglon>
      </TarjetaResumen>

      <TarjetaResumen
        icono={<Smartphone size={20} />} color="text-emerald-400 bg-emerald-500/10"
        valor={loTienen.valor} motivo={loTienen.motivo} porcentaje={porcentaje} titulo="Todavía lo tienen"
        notas={[
          porcentaje !== null && 'El porcentaje es sobre las descargas.',
          'Apple no informa cuántos tienen la app: en iPhone contamos los que abrieron el juego en los últimos 30 días.',
          'Las desinstalaciones de Google son eventos, no aparatos (quien lo borra dos veces cuenta dos), e incluyen los aparatos de la prueba cerrada.',
          b.fecha && `Datos de Google ${alDia({ valor: 0, fecha: b.fecha, tipoFecha: 'dia', atrasado: b.atrasado })}.`,
          b.faltan > 0 && `A ${b.faltan === 1 ? 'un día le falta' : `${b.faltan} días les falta`} el dato de desinstalaciones de Google: no se cuenta${b.faltan === 1 ? '' : 'n'}.`,
          sinDato(tienen.android, 'Android'),
          sinDato(tienen.ios, 'iPhone'),
          b.valor === null && `Desinstalaciones: ${b.motivo}`,
        ]}
      >
        <Renglon n={tienen.android.valor}>en Android, según Google</Renglon>
        <Renglon n={tienen.ios.valor}>en iPhone, abrieron en 30 días</Renglon>
        <Renglon n={b.valor}>lo desinstalaron (Android, según Google)</Renglon>
        {b.valor !== null && b.fecha && (
          <li className="pl-3 text-[11px] text-[#6B6B80]">
            {b.ult7 ?? 'sin dato'} en los últimos 7 días · {b.ult30 ?? 'sin dato'} en los últimos 30 (hasta el {diaDeDato(b.fecha)})
          </li>
        )}
      </TarjetaResumen>

      <TarjetaResumen
        icono={<CalendarDays size={20} />} color="text-blue-400 bg-blue-500/10"
        valor={jugaron.valor} motivo={jugaron.motivo} titulo="Jugaron en los últimos 30 días"
        notas={[
          'Jugadores reales, sin robots ni aparatos de prueba: Android e iPhone, según el juego.',
          mes.android.fecha && deCuando(mes.android),
        ]}
      >
        <Renglon n={suma(semana.android, semana.ios).valor}>en los últimos 7 días</Renglon>
        <Renglon n={suma(hoy.android, hoy.ios).valor}>hoy</Renglon>
      </TarjetaResumen>
    </div>
  )
}

function PersonasYRobots({ s }: { s: Separacion }) {
  const cuando = s.fecha ? deCuando({ valor: 0, fecha: s.fecha, tipoFecha: 'momento' }) : ''
  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
        <Bot size={15} className="text-[#FFFD02]" /> Personas y robots
      </h2>
      <p className="text-[12px] text-zinc-400 mt-1 leading-snug">
        Lo cuenta el propio juego: cada instalación que lo abrió al menos una vez{cuando ? ` (${cuando.toLowerCase()})` : ''}. Los
        robots de Google prueban cada versión nueva el día que sale; Google no los mete en sus números de arriba.
      </p>
      {s.android === null || s.ios === null ? (
        <p className="text-sm text-amber-300 mt-3">sin dato: {s.motivo}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
            {[
              { t: 'Android · personas', v: s.android.personas, c: COLOR.android, grande: true },
              { t: 'Android · robots de Google', v: s.android.robots, c: 'text-zinc-400', grande: false },
              { t: 'Android · prueba', v: s.android.prueba, c: 'text-zinc-400', grande: false },
              { t: 'iPhone · personas', v: s.ios.personas, c: COLOR.ios, grande: true },
              { t: 'iPhone · TestFlight y Apple', v: s.ios.prueba, c: 'text-zinc-400', grande: false },
            ].map(x => (
              <div key={x.t} className="min-w-0">
                <p className={`text-[11px] font-semibold leading-tight ${x.c}`}>{x.t}</p>
                <p className={`font-black tabular-nums mt-1 ${x.grande ? 'text-2xl text-white' : 'text-xl text-zinc-400'}`}>{numero(x.v)}</p>
              </div>
            ))}
          </div>
          {s.robotsPorVersion.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] text-zinc-500 mb-1.5">Robots por versión y el día que llegaron</p>
              <ul className="flex flex-wrap gap-1.5">
                {s.robotsPorVersion.map(r => (
                  <li key={r.version} className="rounded-full border border-[#2A2A3A] bg-[#0A0A0F] px-2.5 py-1 text-[11px] text-zinc-300 tabular-nums">
                    {r.version} · {diaDeDato(r.dia)} · <span className="text-white font-semibold">{r.cantidad}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-[11px] text-zinc-500 mt-3 leading-snug">
            Las personas no tienen por qué coincidir con las descargas de Google: acá sólo aparece quien abrió el juego, y
            quien lo borra y lo vuelve a bajar cuenta dos veces. El detalle, aparato por aparato, está en Prueba y robots.
          </p>
        </>
      )}
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

/**
 * La tabla de niveles de `lib/potion-tablero.ts` quedó vieja. Va arriba de
 * todo y en cualquier pestaña: se sube de nivel casi todas las semanas.
 */
export function AvisoNiveles({ avisos }: { avisos: Alerta[] }) {
  if (avisos.length === 0) return null
  const hayError = avisos.some(a => a.nivel === 'error')
  return (
    <div
      role="alert"
      className={`rounded-2xl border-2 px-4 py-4 ${hayError ? 'bg-red-950/60 border-red-500' : 'bg-amber-950/50 border-amber-400'}`}
    >
      <p className={`text-base font-bold flex items-center gap-2 ${hayError ? 'text-red-200' : 'text-amber-200'}`}>
        <Layers size={18} className="shrink-0" />
        Falta actualizar la tabla de niveles
      </p>
      <ul className="mt-2 space-y-2">
        {avisos.map((a, i) => (
          <li key={i} className="text-[13px] leading-snug flex gap-2">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${a.nivel === 'error' ? 'bg-red-400' : 'bg-amber-400'}`} />
            <span className={a.nivel === 'error' ? 'text-red-50' : 'text-amber-50'}>{a.texto}</span>
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

const ESTADO: Record<Estado, { texto: string; clase: string }> = {
  jugando: { texto: 'jugando', clase: 'border-emerald-500/50 text-emerald-300' },
  dormido: { texto: 'dormido', clase: 'border-sky-500/50 text-sky-300' },
  borro: { texto: 'seguro lo borró', clase: 'border-zinc-500/60 text-zinc-400' },
  termino: { texto: 'terminó', clase: 'border-amber-500/50 text-amber-300' },
}

const AYUDA_ESTADO = 'Estimación nuestra con la última vez que jugó (el teléfono no avisa si lo borró): '
  + 'jugando, en los últimos 7 días; dormido, hace entre 7 y 30; seguro lo borró, hace más de 30. '
  + 'Quien llegó al último nivel dice "terminó".'

/** Borde punteado y "≈": se tiene que notar que es una estimación. */
function EstadoJugador({ j }: { j: Jugador }) {
  const e = ESTADO[estadoDe(j)]
  return (
    <span
      title={AYUDA_ESTADO}
      className={`inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-[11px] whitespace-nowrap cursor-help ${e.clase}`}
    >
      {estadoDe(j) === 'termino' ? '' : '≈ '}{e.texto}
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
  jugadores, conMotivo, conEstado = false, onMover, vacio, orden, onOrdenar,
}: {
  jugadores: Jugador[]
  conMotivo: boolean
  /** La columna de estado estimado: jugando, dormido, seguro lo borró. */
  conEstado?: boolean
  onMover: (id: string, clase: 'prueba' | 'real' | null) => Promise<void>
  vacio: string
  /** Con estos dos, los encabezados ordenan la lista. */
  orden?: Orden
  onOrdenar?: (c: Columna) => void
}) {
  if (jugadores.length === 0) return <p className="text-sm text-[#A0A0B0] py-6 text-center">{vacio}</p>
  const th = (col: Columna, derecha = false) => orden && onOrdenar
    ? <Encabezado col={col} orden={orden} onOrdenar={onOrdenar} derecha={derecha} />
    : <th className={`py-2 pr-3 font-medium ${derecha ? 'text-right' : ''}`}>{NOMBRE_COLUMNA[col]}</th>
  return (
    <>
      {/* Compu: tabla */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-zinc-500 border-b border-[#2A2A3A]">
              {th('pais')}
              {th('aparato')}
              {th('desde')}
              {th('nivel')}
              {th('ultimo')}
              {conEstado && th('estado')}
              {th('dias', true)}
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
                {conEstado && <td className="py-2.5 pr-3"><EstadoJugador j={j} /></td>}
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
            <div className="mt-2.5 flex items-end justify-between gap-2">
              <Nivel j={j} />
              {conEstado && <EstadoJugador j={j} />}
            </div>
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
  const f = useFiltrosJugadores()
  const lista = useMemo(() => ordenar(filtrar(t.reales, f.filtros), f.orden), [t.reales, f.filtros, f.orden])
  const filtrando = cuantosFiltros(f.filtros) > 0
  const terminaron = lista.filter(j => j.termino).length
  return (
    <div className="space-y-5">
      <TarjetasDeArriba t={t} />

      <Avisos avisos={t.avisos} />

      <PersonasYRobots s={t.separacion} />


      <Alertas alertas={t.alertas} />

      <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-white">
            Jugadores reales{' '}
            <span className="text-zinc-500 font-normal">
              · {filtrando ? <><span className="text-white">{numero(lista.length)}</span> de {numero(t.reales.length)}</> : numero(t.reales.length)}
            </span>
          </h2>
          {terminaron > 0 && (
            <p className="text-[11px] text-zinc-500">
              {numero(terminaron)} {filtrando ? 'de estos ' : ''}terminaron el juego
            </p>
          )}
        </div>
        <PanelFiltros jugadores={t.reales} {...f} />
        <Listado
          jugadores={lista} conMotivo={false} conEstado onMover={onMover} orden={f.orden} onOrdenar={f.ordenarPor}
          vacio={t.reales.length === 0 ? 'Todavía no hay jugadores reales.' : 'Nadie cumple con estos filtros.'}
        />
        <p className="text-[11px] text-zinc-500 mt-3 flex items-start gap-1.5 leading-snug">
          <Info size={12} className="shrink-0 mt-0.5" />
          Un jugador es una instalación del juego: si alguien lo borra y lo vuelve a bajar, aparece dos veces. El país
          se anota desde el 16/11, cuando el jugador vuelve a abrir el juego. El nivel es hasta dónde llegó, sobre los
          niveles de la versión que tiene. El estado es una estimación nuestra con la última vez que jugó, no un
          dato del teléfono: jugando, en los últimos 7 días; dormido, hace entre 7 y 30; seguro lo borró, hace más
          de 30. Quien llegó al último nivel dice &ldquo;terminó&rdquo;.
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
