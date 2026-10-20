'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { Loader2, DollarSign, Eye, Gauge, UserCheck } from 'lucide-react'
import { VENTANAS, VENTANA_POR_DEFECTO, type Ventana } from '@/lib/metricas-ventanas'
import type { AdMobResumen, GrupoAdMob } from '@/app/api/admin/admob/route'

/**
 * La sección de AdMob de `/admin/potion`: cuánto dejan los anuncios del juego.
 *
 * Mismo esquema que el panel de Google Play: un filtro propio de 7 y 30 días,
 * los datos de una tabla que llena un cron diario (`admob_stats`) y nada de
 * pedirle a Google al abrir la página.
 *
 * La ganancia es la ESTIMADA de AdMob: la definitiva sale a principio del mes
 * siguiente y suele diferir un poco.
 */

const numero = (n: number) => n.toLocaleString('es-AR')

/** Dinero con los decimales que hagan falta: centavos de dólar se ven con 4. */
function dinero(v: number | null, moneda: string, decimales = 2): string {
  if (v === null) return '—'
  return v.toLocaleString('es-AR', {
    style: 'currency', currency: moneda, minimumFractionDigits: decimales, maximumFractionDigits: decimales,
  })
}

/** `2026-09-20` → `20/9`. */
function etiquetaFecha(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}

const NOMBRE_FORMATO: Record<string, string> = {
  REWARDED: 'Recompensado',
  INTERSTITIAL: 'Intersticial',
  BANNER: 'Banner',
  REWARDED_INTERSTITIAL: 'Intersticial recompensado',
  APP_OPEN: 'Apertura de app',
  NATIVE: 'Nativo',
}

const nombresDePais = (() => {
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' })
  } catch {
    return null
  }
})()

function nombrePais(codigo: string): string {
  if (codigo === 'ZZ') return 'Sin país'
  try {
    return nombresDePais?.of(codigo) ?? codigo
  } catch {
    return codigo
  }
}

const ejeComun = { stroke: '#A0A0B0', fontSize: 10, tickLine: false, axisLine: false }

const tooltipStyle = {
  contentStyle: { background: '#1C1C27', border: '1px solid #2A2A3A', borderRadius: 8, color: '#fff', fontSize: 12 },
  cursor: { fill: 'rgba(255,253,2,0.04)' },
}

function Tile({
  icono, label, valor, hint, destacado = false,
}: {
  icono: React.ReactNode; label: string; valor: string; hint: string; destacado?: boolean
}) {
  return (
    <div className={`rounded-xl border p-3.5 ${destacado ? 'border-[#FFFD02]/30 bg-[#FFFD02]/5' : 'border-[#2A2A3A] bg-[#0A0A0F]'}`}>
      <div className="flex items-center gap-1.5 text-[#A0A0B0] mb-1.5">
        {icono}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className={`text-xl font-black tabular-nums ${destacado ? 'text-[#FFFD02]' : 'text-white'}`}>{valor}</p>
      <p className="text-[10px] text-[#A0A0B0] mt-1">{hint}</p>
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────

export function AdMobPanel({
  recarga = 0,
  desde,
}: {
  /** La sube la página al refrescar. */
  recarga?: number
  /** `YYYY-MM-DD`. Lo anterior no se cuenta. */
  desde?: string
}) {
  const [dias, setDias] = useState<Ventana>(VENTANA_POR_DEFECTO)
  const [datos, setDatos] = useState<AdMobResumen | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async (ventana: Ventana) => {
    setCargando(true)
    try {
      const params = new URLSearchParams({ dias: String(ventana) })
      if (desde) params.set('desde', desde)
      const r = await fetch(`/api/admin/admob?${params}`, { cache: 'no-store' })
      setDatos(r.ok ? ((await r.json()) as AdMobResumen) : null)
    } catch {
      setDatos(null)
    } finally {
      setCargando(false)
    }
  }, [desde])

  useEffect(() => { void cargar(dias) }, [dias, cargar, recarga])

  const moneda = datos?.moneda ?? 'USD'
  const serie = (datos?.serie ?? []).map(d => ({ ...d, etiqueta: etiquetaFecha(d.fecha) }))

  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-white">AdMob</h2>
        <div className="flex rounded-lg border border-[#2A2A3A] overflow-hidden shrink-0">
          {VENTANAS.map(opcion => (
            <button
              key={opcion}
              type="button"
              onClick={() => setDias(opcion)}
              aria-pressed={dias === opcion}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                dias === opcion ? 'bg-[#FFFD02] text-[#0A0A0F]' : 'text-[#A0A0B0] hover:text-white hover:bg-[#1C1C27]'
              }`}
            >
              {opcion} días
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-[#A0A0B0] mb-5">
        Ganancia estimada, en dólares
        {datos?.actualizadoEn && <> · al {new Date(datos.actualizadoEn).toLocaleDateString('es-AR')}</>}
      </p>

      {cargando ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-[#FFFD02]" />
        </div>
      ) : !datos || !datos.disponible ? (
        <VacioAdMob datos={datos} dias={dias} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <Tile
              icono={<DollarSign size={13} />} label="Ganancia" destacado
              valor={dinero(datos.totales.ganancia, moneda)} hint={`Últimos ${dias} días`}
            />
            <Tile
              icono={<Eye size={13} />} label="Impresiones"
              valor={numero(datos.totales.impresiones)} hint="Todos los formatos"
            />
            <Tile
              icono={<Gauge size={13} />} label="eCPM"
              valor={dinero(datos.totales.ecpm, moneda)} hint="Por mil impresiones"
            />
            <Tile
              icono={<UserCheck size={13} />} label="Por usuario por día"
              valor={dinero(datos.totales.gananciaPorUsuarioDia, moneda, 4)}
              hint={datos.totales.usuariosDia === null
                ? 'No se pudo consultar el juego'
                : `Sobre ${numero(datos.totales.usuariosDia)} usuarios-día`}
            />
          </div>

          <p className="text-[11px] uppercase tracking-wide text-[#A0A0B0] mb-2">Ganancia por día</p>
          <div className="h-44 mb-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeComun} interval="preserveStartEnd" minTickGap={18} />
                <YAxis {...ejeComun} width={44} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <Tooltip {...tooltipStyle} formatter={(v) => dinero(Number(v), moneda)} />
                <Bar dataKey="ganancia" name="Ganancia" fill="#FFFD02" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <TablaGrupos
            titulo={`Por tipo de anuncio · últimos ${dias} días`}
            columna="Formato"
            grupos={datos.formatos}
            nombre={k => NOMBRE_FORMATO[k] ?? k}
            moneda={moneda}
          />

          <TablaDiaria serie={datos.serie} moneda={moneda} />

          <TablaGrupos
            titulo={`Por país · últimos ${dias} días`}
            columna="País"
            grupos={datos.paises}
            nombre={k => nombrePais(k)}
            codigo
            moneda={moneda}
            alto
          />

          <p className="text-[10px] text-[#A0A0B0] mt-4 leading-relaxed">
            La ganancia es la estimada por AdMob; la definitiva sale a principio del mes siguiente.
            Los días son los de la zona horaria de la cuenta de AdMob. La ganancia por usuario cruza
            cada día con los usuarios que jugaron ese día según este panel, en días de Argentina, así
            que en los bordes del día hay unas horas de diferencia.
          </p>
        </>
      )}
    </section>
  )
}

// ── Tablas ─────────────────────────────────────────────────────────────────

function TablaGrupos({
  titulo, columna, grupos, nombre, moneda, codigo = false, alto = false,
}: {
  titulo: string
  columna: string
  grupos: GrupoAdMob[]
  nombre: (clave: string) => string
  moneda: string
  /** Mostrar la clave al lado del nombre (el código de país). */
  codigo?: boolean
  /** Con scroll propio: los países pueden ser muchos. */
  alto?: boolean
}) {
  return (
    <div className="mb-5">
      <p className="text-[11px] uppercase tracking-wide text-[#A0A0B0] mb-2">{titulo}</p>
      {grupos.length === 0 ? (
        <p className="text-xs text-zinc-500 py-4">Sin datos en esta ventana.</p>
      ) : (
        <div className={`overflow-x-auto ${alto ? 'max-h-[360px] overflow-y-auto' : ''}`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#13131A]">
              <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
                <th className="text-left  font-medium py-2 pr-3">{columna}</th>
                <th className="text-right font-medium py-2 px-2">Ganancia</th>
                <th className="text-right font-medium py-2 px-2">Impresiones</th>
                <th className="text-right font-medium py-2 px-2">eCPM</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(g => (
                <tr key={g.clave} className="border-b border-[#2A2A3A]/60 last:border-0">
                  <td className="py-2 pr-3 text-white">
                    {nombre(g.clave)}
                    {codigo && <span className="text-zinc-600 text-[11px] ml-1">{g.clave}</span>}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{dinero(g.ganancia, moneda)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(g.impresiones)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{dinero(g.ecpm, moneda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** El día más reciente arriba. */
function TablaDiaria({ serie, moneda }: { serie: AdMobResumen['serie']; moneda: string }) {
  return (
    <div className="mb-5">
      <p className="text-[11px] uppercase tracking-wide text-[#A0A0B0] mb-2">Ganancia por usuario por día</p>
      <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#13131A]">
            <tr className="text-[11px] uppercase tracking-wide text-[#A0A0B0] border-b border-[#2A2A3A]">
              <th className="text-left  font-medium py-2 pr-3">Día</th>
              <th className="text-right font-medium py-2 px-2">Ganancia</th>
              <th className="text-right font-medium py-2 px-2">Impresiones</th>
              <th className="text-right font-medium py-2 px-2">Usuarios</th>
              <th className="text-right font-medium py-2 px-2">Por usuario</th>
            </tr>
          </thead>
          <tbody>
            {[...serie].reverse().map(d => (
              <tr key={d.fecha} className="border-b border-[#2A2A3A]/60 last:border-0">
                <td className="py-2 pr-3 text-white tabular-nums">{etiquetaFecha(d.fecha)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{dinero(d.ganancia, moneda)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-zinc-300">{numero(d.impresiones)}</td>
                <td className="py-2 px-2 text-right tabular-nums text-zinc-300">
                  {d.usuarios === null ? '—' : numero(d.usuarios)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-white font-semibold">
                  {dinero(d.gananciaPorUsuario, moneda, 4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Vacío ──────────────────────────────────────────────────────────────────

function VacioAdMob({ datos, dias }: { datos: AdMobResumen | null; dias: Ventana }) {
  if (!datos) return <p className="text-[#A0A0B0] text-sm py-8 text-center">No se pudo cargar la sección.</p>

  if (datos.motivo === 'sin_migracion') {
    return (
      <div className="py-8 text-center">
        <p className="text-[#A0A0B0] text-sm">Falta correr la migración.</p>
        <p className="text-xs text-zinc-500 mt-1.5">
          Pegá <code className="text-zinc-400">supabase-admob-stats.sql</code> en el SQL Editor del
          proyecto de Supabase de Glynbox y recargá.
        </p>
      </div>
    )
  }

  return (
    <div className="py-8 text-center">
      <div className="flex justify-center mb-2 text-zinc-600"><DollarSign size={20} /></div>
      <p className="text-[#A0A0B0] text-sm">No hay datos de AdMob en esta ventana ({dias} días).</p>
      {datos.rango && (
        <p className="text-xs text-zinc-400 mt-1.5">
          Hay datos del {etiquetaFecha(datos.rango.desde)} al {etiquetaFecha(datos.rango.hasta)}.
        </p>
      )}
      <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
        El cron corre a las 10:00 UTC. Para no esperar:<br />
        <code className="text-zinc-400">
          curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; /api/cron/admob-stats
        </code>
      </p>
    </div>
  )
}
