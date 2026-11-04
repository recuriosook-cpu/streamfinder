'use client'

import { ChevronDown, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { VENTANAS, type Ventana } from '@/lib/metricas-ventanas'

/**
 * Las piezas que comparten los bloques de `/admin/potion`: el marco de cada
 * bloque, el "ver detalle" plegable, la flechita de comparación y el selector
 * de 7 / 30 días.
 */

export const numero = (n: number) => n.toLocaleString('es-AR')
export const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('es-AR')}%`)
export const dec = (v: number | null) => (v === null ? '—' : v.toLocaleString('es-AR'))
export const usd = (v: number | null, decimales = 2) =>
  v === null ? '—' : v.toLocaleString('es-AR', {
    style: 'currency', currency: 'USD', minimumFractionDigits: decimales, maximumFractionDigits: decimales,
  })

/** `2026-10-13` → `13/10`. */
export function diaCorto(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${Number(d)}/${Number(m)}`
}

export const tooltipStyle = {
  contentStyle: { background: '#1C1C27', border: '1px solid #2A2A3A', borderRadius: 8, color: '#fff', fontSize: 12 },
  cursor: { fill: 'rgba(255,253,2,0.04)' },
}

export const ejeComun = { stroke: '#A0A0B0', fontSize: 10, tickLine: false, axisLine: false }

/** Un bloque con su pregunta de título y una frase de qué mirar. */
export function Bloque({
  titulo, frase, derecha, children,
}: {
  titulo: string
  frase: string
  /** Lo que va arriba a la derecha: un selector de días, por ejemplo. */
  derecha?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-white">{titulo}</h2>
          <p className="text-sm text-[#A0A0B0] mt-0.5">{frase}</p>
        </div>
        {derecha}
      </div>
      {children}
    </section>
  )
}

/** Lo que no va a la vista: cerrado hasta tocar "Ver detalle". */
export function Plegable({ titulo = 'Ver detalle', children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <details className="group mt-5 rounded-xl border border-[#2A2A3A] bg-[#0A0A0F]">
      <summary className="cursor-pointer select-none list-none px-4 py-3 text-sm font-semibold text-[#FFFD02] flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        {titulo}
        <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-6">{children}</div>
    </details>
  )
}

/** Un subtítulo chico dentro de un bloque o de un plegable. */
export function Subtitulo({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] uppercase tracking-wide text-[#A0A0B0] mb-2">{children}</p>
}

/**
 * La flechita verde o roja: si `actual` es más que `antes`, para arriba.
 * `texto` dice contra qué se compara ("ayer a esta hora: 3"). `null` en
 * `antes` es que no hay con qué comparar: no se dibuja nada.
 */
export function Flecha({ actual, antes, texto }: { actual: number | null; antes: number | null; texto: string }) {
  if (actual === null || antes === null) return null
  const dif = actual - antes
  const tono = dif > 0 ? 'text-emerald-400' : dif < 0 ? 'text-red-400' : 'text-zinc-500'
  const Icono = dif > 0 ? ArrowUp : dif < 0 ? ArrowDown : Minus
  return (
    <p className={`text-xs font-semibold flex items-center gap-1 ${tono}`}>
      <Icono size={13} className="shrink-0" />
      <span>{dif > 0 ? '+' : ''}{numero(dif)}</span>
      <span className="font-normal text-[#A0A0B0]">· {texto}</span>
    </p>
  )
}

/** El selector de 7 / 30 días de los bloques con datos de las tiendas. */
export function SelectorDias({ valor, onCambiar }: { valor: Ventana; onCambiar: (v: Ventana) => void }) {
  return (
    <div className="flex rounded-lg border border-[#2A2A3A] overflow-hidden shrink-0">
      {VENTANAS.map(v => (
        <button
          key={v}
          type="button"
          onClick={() => onCambiar(v)}
          aria-pressed={valor === v}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
            valor === v ? 'bg-[#FFFD02] text-[#0A0A0F]' : 'text-[#A0A0B0] hover:text-white hover:bg-[#1C1C27]'
          }`}
        >
          {v} días
        </button>
      ))}
    </div>
  )
}

/** Un número chico con su etiqueta. */
export function Dato({
  label, value, sub, icono, tono = 'text-[#A0A0B0]',
}: {
  label: string; value: string; sub?: React.ReactNode; icono?: React.ReactNode; tono?: string
}) {
  return (
    <div className="rounded-xl border border-[#2A2A3A] bg-[#0A0A0F] px-4 py-3 min-w-0">
      <p className={`text-xs flex items-center gap-1.5 mb-1 ${tono}`}>{icono}{label}</p>
      <p className="text-2xl font-black text-white tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{sub}</p>}
    </div>
  )
}

export function SinDatos({ texto = 'Sin datos en este período.' }: { texto?: string }) {
  return <p className="text-[#A0A0B0] text-sm py-6 text-center">{texto}</p>
}

/** Una tabla ancha que en el celular se desliza de costado sin mover la página. */
export function TablaDeslizable({ children, alto = false }: { children: React.ReactNode; alto?: boolean }) {
  return (
    <div className={`overflow-x-auto -mx-1 px-1 ${alto ? 'max-h-[420px] overflow-y-auto' : ''}`}>
      {children}
    </div>
  )
}
