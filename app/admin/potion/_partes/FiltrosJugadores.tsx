'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, SlidersHorizontal, X } from 'lucide-react'
import { nombrePais } from '@/app/admin/_components/GrillasMetricas'
import type { Jugador } from '@/lib/potion-tablero'

/**
 * Filtros y orden de "Jugadores reales" en `/admin/potion`. Todo se hace en
 * el navegador: la lista entera ya llega con el tablero.
 *
 * Filtros y orden viven en la dirección (`?pais=AR&orden=nivel&dir=asc`),
 * así que sobreviven a una recarga y se pueden pasar como enlace. Se
 * escriben con `history.replaceState`: cambiar un filtro no suma una entrada
 * al "atrás" del navegador.
 */

const ZONA = 'America/Argentina/Buenos_Aires'

// ── Tipos y dirección ──────────────────────────────────────────────────────

export type Columna = 'pais' | 'aparato' | 'desde' | 'nivel' | 'ultimo' | 'dias'
export type Direccion = 'asc' | 'desc'
export interface Orden { col: Columna; dir: Direccion }

export type Ultima = '' | 'hoy' | 'semana' | 'mes' | 'mas_de_un_mes'

export interface Filtros {
  /** Código de país; `-`: sin dato; vacío: todos. */
  pais: string
  plataforma: '' | 'android' | 'ios'
  version: string
  nivelDesde: string
  nivelHasta: string
  /** `YYYY-MM-DD`, día de Argentina. */
  empezoDesde: string
  empezoHasta: string
  diasDesde: string
  diasHasta: string
  ultima: Ultima
}

const SIN_FILTROS: Filtros = {
  pais: '', plataforma: '', version: '', nivelDesde: '', nivelHasta: '',
  empezoDesde: '', empezoHasta: '', diasDesde: '', diasHasta: '', ultima: '',
}
const ORDEN_INICIAL: Orden = { col: 'ultimo', dir: 'desc' }

/** Nombre de cada filtro en la dirección. */
const PARAM: Record<keyof Filtros, string> = {
  pais: 'pais', plataforma: 'plataforma', version: 'version',
  nivelDesde: 'nivel_desde', nivelHasta: 'nivel_hasta',
  empezoDesde: 'empezo_desde', empezoHasta: 'empezo_hasta',
  diasDesde: 'dias_desde', diasHasta: 'dias_hasta', ultima: 'ultima',
}
const COLUMNAS: Columna[] = ['pais', 'aparato', 'desde', 'nivel', 'ultimo', 'dias']
const ULTIMAS: Ultima[] = ['hoy', 'semana', 'mes', 'mas_de_un_mes']
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const NUM_RE = /^\d+$/

export function leerDireccion(): { filtros: Filtros; orden: Orden } {
  if (typeof window === 'undefined') return { filtros: SIN_FILTROS, orden: ORDEN_INICIAL }
  const q = new URLSearchParams(window.location.search)
  const f: Filtros = { ...SIN_FILTROS }
  const texto = (k: keyof Filtros) => (q.get(PARAM[k]) ?? '').trim()
  const pais = texto('pais')
  f.pais = pais === '-' ? '-' : /^[A-Za-z]{2}$/.test(pais) ? pais.toUpperCase() : ''
  const plat = texto('plataforma')
  f.plataforma = plat === 'android' || plat === 'ios' ? plat : ''
  f.version = texto('version').slice(0, 20)
  for (const k of ['nivelDesde', 'nivelHasta', 'diasDesde', 'diasHasta'] as const) f[k] = NUM_RE.test(texto(k)) ? texto(k) : ''
  for (const k of ['empezoDesde', 'empezoHasta'] as const) f[k] = FECHA_RE.test(texto(k)) ? texto(k) : ''
  const u = texto('ultima') as Ultima
  f.ultima = ULTIMAS.includes(u) ? u : ''
  const col = q.get('orden') as Columna | null
  const dir = q.get('dir')
  const orden: Orden = col && COLUMNAS.includes(col)
    ? { col, dir: dir === 'asc' || dir === 'desc' ? dir : direccionInicial(col) }
    : ORDEN_INICIAL
  return { filtros: f, orden }
}

function escribirDireccion(filtros: Filtros, orden: Orden) {
  const q = new URLSearchParams(window.location.search)
  for (const k of Object.keys(PARAM) as (keyof Filtros)[]) {
    if (filtros[k]) q.set(PARAM[k], filtros[k]); else q.delete(PARAM[k])
  }
  if (orden.col === ORDEN_INICIAL.col && orden.dir === ORDEN_INICIAL.dir) { q.delete('orden'); q.delete('dir') }
  else { q.set('orden', orden.col); q.set('dir', orden.dir) }
  const s = q.toString()
  const nueva = `${window.location.pathname}${s ? `?${s}` : ''}${window.location.hash}`
  if (nueva !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, '', nueva)
  }
}

/** Fechas y números, de lo más nuevo o más grande; país y aparato, de la A a la Z. */
function direccionInicial(col: Columna): Direccion {
  return col === 'pais' || col === 'aparato' ? 'asc' : 'desc'
}

/** Filtros y orden, guardados en la dirección. */
export function useFiltrosJugadores() {
  const [estado, setEstado] = useState(leerDireccion)
  useEffect(() => { escribirDireccion(estado.filtros, estado.orden) }, [estado])

  const cambiar = useCallback(<K extends keyof Filtros>(k: K, v: Filtros[K]) => {
    setEstado(e => ({ ...e, filtros: { ...e.filtros, [k]: v } }))
  }, [])
  const limpiar = useCallback(() => setEstado(e => ({ ...e, filtros: SIN_FILTROS })), [])
  const ordenarPor = useCallback((col: Columna) => {
    setEstado(e => ({
      ...e,
      orden: e.orden.col === col
        ? { col, dir: e.orden.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: direccionInicial(col) },
    }))
  }, [])
  const invertir = useCallback(() => {
    setEstado(e => ({ ...e, orden: { ...e.orden, dir: e.orden.dir === 'asc' ? 'desc' : 'asc' } }))
  }, [])

  return { filtros: estado.filtros, orden: estado.orden, cambiar, limpiar, ordenarPor, invertir }
}

// ── Filtrar y ordenar ──────────────────────────────────────────────────────

function diaAR(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONA })
}

/** `1.1.2 (5)` → `1.1.2`. */
export function nombreDeVersion(v: string | null | undefined): string {
  return (v ?? '').split(' (')[0].trim()
}

function compararVersiones(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

const num = (s: string): number | null => (s === '' ? null : Number(s))

export function cuantosFiltros(f: Filtros): number {
  return [
    f.pais, f.plataforma, f.version, f.nivelDesde || f.nivelHasta,
    f.empezoDesde || f.empezoHasta, f.diasDesde || f.diasHasta, f.ultima,
  ].filter(Boolean).length
}

export function filtrar(jugadores: Jugador[], f: Filtros): Jugador[] {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: ZONA })
  const nMin = num(f.nivelDesde), nMax = num(f.nivelHasta)
  const dMin = num(f.diasDesde), dMax = num(f.diasHasta)
  return jugadores.filter(j => {
    if (f.pais === '-' ? j.pais !== null : f.pais && j.pais !== f.pais) return false
    if (f.plataforma && j.plataforma !== f.plataforma) return false
    if (f.version && nombreDeVersion(j.version) !== f.version) return false
    if (nMin !== null || nMax !== null) {
      if (j.nivelActual === null) return false
      if (nMin !== null && j.nivelActual < nMin) return false
      if (nMax !== null && j.nivelActual > nMax) return false
    }
    if (f.empezoDesde || f.empezoHasta) {
      const d = diaAR(j.desde)
      if (f.empezoDesde && d < f.empezoDesde) return false
      if (f.empezoHasta && d > f.empezoHasta) return false
    }
    if (dMin !== null && j.dias < dMin) return false
    if (dMax !== null && j.dias > dMax) return false
    if (f.ultima) {
      const n = Math.round((Date.parse(hoy) - Date.parse(diaAR(j.ultimo))) / 86_400_000)
      if (f.ultima === 'hoy' && n > 0) return false
      if (f.ultima === 'semana' && n > 6) return false
      if (f.ultima === 'mes' && n > 29) return false
      if (f.ultima === 'mas_de_un_mes' && n < 30) return false
    }
    return true
  })
}

const PLATAFORMAS = ['android', 'ios', 'web']

/** Compara dos valores presentes; los `null` se resuelven afuera. */
function compararPor(col: Columna, a: Jugador, b: Jugador): number | null {
  switch (col) {
    case 'pais':
      return a.pais === null || b.pais === null ? null : nombrePais(a.pais).localeCompare(nombrePais(b.pais), 'es')
    case 'aparato':
      return (PLATAFORMAS.indexOf(a.plataforma) - PLATAFORMAS.indexOf(b.plataforma))
        || compararVersiones(nombreDeVersion(a.version), nombreDeVersion(b.version))
    case 'desde':
      return a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0
    case 'ultimo':
      return a.ultimo < b.ultimo ? -1 : a.ultimo > b.ultimo ? 1 : 0
    case 'dias':
      return a.dias - b.dias
    case 'nivel':
      return a.nivelActual === null || b.nivelActual === null
        ? null
        : (a.nivelActual - b.nivelActual) || (Number(a.termino) - Number(b.termino))
  }
}

function faltaDato(col: Columna, j: Jugador): boolean {
  return (col === 'pais' && j.pais === null) || (col === 'nivel' && j.nivelActual === null)
}

export function ordenar(jugadores: Jugador[], o: Orden): Jugador[] {
  const signo = o.dir === 'asc' ? 1 : -1
  return [...jugadores].sort((a, b) => {
    // Los "sin dato" van al final, para cualquier lado que se ordene.
    const fa = faltaDato(o.col, a), fb = faltaDato(o.col, b)
    if (fa !== fb) return fa ? 1 : -1
    const c = fa ? 0 : (compararPor(o.col, a, b) ?? 0)
    if (c !== 0) return c * signo
    // Empate: el que jugó más recién, primero.
    return a.ultimo < b.ultimo ? 1 : a.ultimo > b.ultimo ? -1 : 0
  })
}

// ── Pantalla ───────────────────────────────────────────────────────────────

export const NOMBRE_COLUMNA: Record<Columna, string> = {
  pais: 'País', aparato: 'Aparato', desde: 'Juega desde', nivel: 'Nivel', ultimo: 'Último día', dias: 'Días jugados',
}

/** Encabezado de la tabla que ordena al tocarlo. */
export function Encabezado({
  col, orden, onOrdenar, derecha = false,
}: { col: Columna; orden: Orden; onOrdenar: (c: Columna) => void; derecha?: boolean }) {
  const activo = orden.col === col
  const Flecha = !activo ? ArrowUpDown : orden.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      className={`py-2 pr-3 font-medium ${derecha ? 'text-right' : ''}`}
      aria-sort={activo ? (orden.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onOrdenar(col)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-white ${activo ? 'text-white' : ''}`}
      >
        {NOMBRE_COLUMNA[col]}
        <Flecha size={11} className={activo ? 'text-[#FFFD02]' : 'opacity-40'} />
      </button>
    </th>
  )
}

const CAMPO = 'w-full rounded-lg border border-[#2A2A3A] bg-[#0A0A0F] px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-500 [color-scheme:dark]'

function Etiqueta({ texto, children }: { texto: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11px] text-zinc-500 mb-1">{texto}</span>
      {children}
    </label>
  )
}

function Rango({
  texto, tipo, desde, hasta, onDesde, onHasta,
}: {
  texto: string; tipo: 'number' | 'date'; desde: string; hasta: string
  onDesde: (v: string) => void; onHasta: (v: string) => void
}) {
  const limpio = (v: string) => (tipo === 'number' ? v.replace(/\D/g, '') : v)
  return (
    <fieldset className="min-w-0">
      <legend className="block text-[11px] text-zinc-500 mb-1">{texto}</legend>
      <div className="flex items-center gap-1.5">
        <input
          type={tipo} inputMode={tipo === 'number' ? 'numeric' : undefined} min={tipo === 'number' ? 0 : undefined}
          aria-label={`${texto}: desde`} placeholder="desde" value={desde}
          onChange={e => onDesde(limpio(e.target.value))} className={CAMPO}
        />
        <span className="text-zinc-600 text-xs">a</span>
        <input
          type={tipo} inputMode={tipo === 'number' ? 'numeric' : undefined} min={tipo === 'number' ? 0 : undefined}
          aria-label={`${texto}: hasta`} placeholder="hasta" value={hasta}
          onChange={e => onHasta(limpio(e.target.value))} className={CAMPO}
        />
      </div>
    </fieldset>
  )
}

export function PanelFiltros({
  jugadores, filtros, orden, cambiar, limpiar, ordenarPor, invertir,
}: {
  jugadores: Jugador[]
  filtros: Filtros
  orden: Orden
  cambiar: <K extends keyof Filtros>(k: K, v: Filtros[K]) => void
  limpiar: () => void
  ordenarPor: (c: Columna) => void
  invertir: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const n = cuantosFiltros(filtros)

  const { paises, haySinPais, versiones } = useMemo(() => {
    const codigos = new Set<string>()
    const vers = new Set<string>()
    let sinPais = false
    for (const j of jugadores) {
      if (j.pais) codigos.add(j.pais); else sinPais = true
      const v = nombreDeVersion(j.version)
      if (v) vers.add(v)
    }
    // Si la dirección trae un filtro que hoy no tiene a nadie, igual se ve elegido.
    if (filtros.pais && filtros.pais !== '-') codigos.add(filtros.pais)
    if (filtros.version) vers.add(filtros.version)
    return {
      paises: [...codigos].sort((a, b) => nombrePais(a).localeCompare(nombrePais(b), 'es')),
      haySinPais: sinPais || filtros.pais === '-',
      versiones: [...vers].sort((a, b) => compararVersiones(b, a)),
    }
  }, [jugadores, filtros.pais, filtros.version])

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setAbierto(a => !a)}
          aria-expanded={abierto}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            n > 0 ? 'border-[#FFFD02]/60 text-[#FFFD02]' : 'border-[#2A2A3A] text-[#A0A0B0]'
          }`}
        >
          <SlidersHorizontal size={13} /> Filtros{n > 0 ? ` (${n})` : ''}
        </button>
        <select
          aria-label="Ordenar por"
          value={orden.col}
          onChange={e => ordenarPor(e.target.value as Columna)}
          className="ml-auto rounded-lg border border-[#2A2A3A] bg-[#0A0A0F] px-2 py-1.5 text-xs text-white"
        >
          {COLUMNAS.map(c => <option key={c} value={c}>{NOMBRE_COLUMNA[c]}</option>)}
        </select>
        <button
          type="button"
          onClick={invertir}
          aria-label={orden.dir === 'asc' ? 'Orden ascendente; tocar para invertir' : 'Orden descendente; tocar para invertir'}
          className="rounded-lg border border-[#2A2A3A] p-1.5 text-white"
        >
          {orden.dir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        </button>
      </div>

      <div className={`${abierto ? 'block' : 'hidden'} md:block mt-3 md:mt-0 rounded-xl border border-[#2A2A3A] bg-[#0A0A0F]/60 p-3`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Etiqueta texto="País">
            <select value={filtros.pais} onChange={e => cambiar('pais', e.target.value)} className={CAMPO}>
              <option value="">Todos</option>
              {paises.map(c => <option key={c} value={c}>{nombrePais(c)}</option>)}
              {haySinPais && <option value="-">Sin dato</option>}
            </select>
          </Etiqueta>
          <Etiqueta texto="Plataforma">
            <select value={filtros.plataforma} onChange={e => cambiar('plataforma', e.target.value as Filtros['plataforma'])} className={CAMPO}>
              <option value="">Todas</option>
              <option value="android">Android</option>
              <option value="ios">iPhone</option>
            </select>
          </Etiqueta>
          <Etiqueta texto="Versión del juego">
            <select value={filtros.version} onChange={e => cambiar('version', e.target.value)} className={CAMPO}>
              <option value="">Todas</option>
              {versiones.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Etiqueta>
          <Etiqueta texto="Última vez que jugó">
            <select value={filtros.ultima} onChange={e => cambiar('ultima', e.target.value as Ultima)} className={CAMPO}>
              <option value="">Cuando sea</option>
              <option value="hoy">Hoy</option>
              <option value="semana">Esta semana (últimos 7 días)</option>
              <option value="mes">Este mes (últimos 30 días)</option>
              <option value="mas_de_un_mes">Hace más de un mes</option>
            </select>
          </Etiqueta>
          <Rango texto="Nivel" tipo="number" desde={filtros.nivelDesde} hasta={filtros.nivelHasta}
            onDesde={v => cambiar('nivelDesde', v)} onHasta={v => cambiar('nivelHasta', v)} />
          <div className="sm:col-span-2">
            <Rango texto="Empezó a jugar" tipo="date" desde={filtros.empezoDesde} hasta={filtros.empezoHasta}
              onDesde={v => cambiar('empezoDesde', v)} onHasta={v => cambiar('empezoHasta', v)} />
          </div>
          <Rango texto="Días jugados" tipo="number" desde={filtros.diasDesde} hasta={filtros.diasHasta}
            onDesde={v => cambiar('diasDesde', v)} onHasta={v => cambiar('diasHasta', v)} />
        </div>
        {n > 0 && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={limpiar}
              className="inline-flex items-center gap-1 rounded-lg border border-[#2A2A3A] px-2.5 py-1 text-[11px] text-[#A0A0B0] hover:text-white hover:border-zinc-500"
            >
              <X size={12} /> Limpiar filtros
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
