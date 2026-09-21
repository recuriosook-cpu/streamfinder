'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { Loader2, Download, Trash2, Users, Eye } from 'lucide-react'
import { VENTANAS, VENTANA_POR_DEFECTO, type Ventana } from '@/lib/metricas-ventanas'
import type { PlayResumen } from '@/app/api/admin/play/route'

/**
 * El panel de Google Play.
 *
 * Va al lado del de la landing `/descargar` a propósito, y eso es todo el
 * punto: el de la izquierda cuenta cuánta gente tocó el botón de Play Store y
 * este cuenta cuánta terminó instalando. Son las dos mitades de la misma
 * pregunta y hasta ahora sólo se veía una.
 *
 * Los dos comparten el filtro de 7 y 30 días (`lib/metricas-ventanas.ts`), así
 * que se pueden leer juntos sin riesgo de comparar ventanas distintas. Cada uno
 * mantiene el suyo, eso sí: son dos fetch separados y el panel de al lado no se
 * recarga al cambiar este.
 *
 * ── Lo que NO se puede cruzar ─────────────────────────────────────────────
 *
 * Los clicks de la landing y las instalaciones de Play no se pueden unir fila
 * por fila: cuando alguien se va a Play Store sale del sitio y Google no dice
 * de dónde vino. Se pueden mirar las dos series y ver si se mueven juntas, que
 * es lo que permite tenerlas al lado, pero no atribuir una instalación a un
 * click. Cualquier número que dijera eso sería inventado.
 *
 * ── De dónde salen los datos ──────────────────────────────────────────────
 *
 * De `play_install_stats`, que llena el cron diario desde el bucket de Cloud
 * Storage de Play. No se le pega a Google desde acá: son CSVs mensuales en
 * UTF-16 que cambian una vez por día.
 */

const numero = (n: number) => n.toLocaleString('es-AR')

/** `2026-09-20` → `20/9`, que es lo que entra en un eje. */
function etiquetaFecha(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}

function Tile({
  icono, label, valor, hint, tono = 'normal',
}: {
  icono: React.ReactNode
  label: string
  valor: string
  hint: string
  tono?: 'normal' | 'destacado'
}) {
  return (
    <div className={`rounded-xl border p-3.5 ${
      tono === 'destacado'
        ? 'border-[#FFFD02]/30 bg-[#FFFD02]/5'
        : 'border-[#2A2A3A] bg-[#0A0A0F]'
    }`}>
      <div className="flex items-center gap-1.5 text-[#A0A0B0] mb-1.5">
        {icono}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className={`text-xl font-black tabular-nums ${
        tono === 'destacado' ? 'text-[#FFFD02]' : 'text-white'
      }`}>
        {valor}
      </p>
      <p className="text-[10px] text-[#A0A0B0] mt-1">{hint}</p>
    </div>
  )
}

const ejeComun = {
  stroke: '#A0A0B0',
  fontSize: 10,
  tickLine: false,
  axisLine: false,
}

const tooltipStyle = {
  contentStyle: {
    background: '#1C1C27', border: '1px solid #2A2A3A',
    borderRadius: 8, color: '#fff', fontSize: 12,
  },
  cursor: { fill: 'rgba(255,253,2,0.04)' },
}

// ── Panel ──────────────────────────────────────────────────────────────────

export function GooglePlayPanel() {
  const [dias, setDias] = useState<Ventana>(VENTANA_POR_DEFECTO)
  const [datos, setDatos] = useState<PlayResumen | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async (ventana: Ventana) => {
    setCargando(true)
    try {
      const r = await fetch(`/api/admin/play?dias=${ventana}`)
      setDatos(r.ok ? ((await r.json()) as PlayResumen) : null)
    } catch {
      setDatos(null)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void cargar(dias) }, [dias, cargar])

  const serie = (datos?.serie ?? []).map(d => ({
    ...d,
    etiqueta: etiquetaFecha(d.fecha),
  }))

  return (
    <section className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">

      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-white">Google Play</h2>

        <div className="flex rounded-lg border border-[#2A2A3A] overflow-hidden shrink-0">
          {VENTANAS.map(opcion => (
            <button
              key={opcion}
              type="button"
              onClick={() => setDias(opcion)}
              aria-pressed={dias === opcion}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                dias === opcion
                  ? 'bg-[#FFFD02] text-[#0A0A0F]'
                  : 'text-[#A0A0B0] hover:text-white hover:bg-[#1C1C27]'
              }`}
            >
              {opcion} días
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-[#A0A0B0] mb-5">
        Informes oficiales de Play Console
        {datos?.actualizadoEn && (
          <> · al {new Date(datos.actualizadoEn).toLocaleDateString('es-AR')}</>
        )}
      </p>

      {cargando ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-[#FFFD02]" />
        </div>
      ) : !datos || !datos.disponible ? (
        <VacioPlay datos={datos} dias={dias} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <Tile
              icono={<Download size={13} />}
              label="Instalaciones"
              valor={numero(datos.totales.instalaciones)}
              hint={`${numero(datos.totales.desinstalaciones)} desinstalaciones`}
            />
            <Tile
              icono={<Eye size={13} />}
              label="Conversión de la ficha"
              valor={
                datos.totales.conversionFichaPct === null
                  ? '—'
                  : `${datos.totales.conversionFichaPct}%`
              }
              hint={`de ${numero(datos.totales.visitantes)} visitantes`}
              tono="destacado"
            />
            <Tile
              icono={<Users size={13} />}
              label="Base instalada"
              valor={datos.totales.baseInstalada === null ? '—' : numero(datos.totales.baseInstalada)}
              hint={
                datos.totales.baseInstaladaVariacion === null
                  ? 'dispositivos activos'
                  : `${datos.totales.baseInstaladaVariacion >= 0 ? '+' : ''}${numero(datos.totales.baseInstaladaVariacion)} en el período`
              }
            />
            <Tile
              icono={<Trash2 size={13} />}
              label="Neto"
              valor={`${datos.totales.neto >= 0 ? '+' : ''}${numero(datos.totales.neto)}`}
              hint="instalaciones menos bajas"
            />
          </div>

          {/* ── Instalaciones vs. desinstalaciones ────────────────────── */}
          <p className="text-[11px] uppercase tracking-wide text-[#A0A0B0] mb-2">
            Instalaciones y desinstalaciones
          </p>
          <div className="h-44 mb-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeComun} interval="preserveStartEnd" minTickGap={18} />
                <YAxis {...ejeComun} width={38} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="instalaciones" name="Instalaciones" fill="#FFFD02" radius={[2, 2, 0, 0]} />
                <Bar dataKey="desinstalaciones" name="Desinstalaciones" fill="#EF4444" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Visitantes de la ficha ────────────────────────────────── */}
          <p className="text-[11px] uppercase tracking-wide text-[#A0A0B0] mb-2">
            Visitantes de la ficha
          </p>
          <div className="h-36 mb-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gradVisitantes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#60A5FA" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeComun} interval="preserveStartEnd" minTickGap={18} />
                <YAxis {...ejeComun} width={38} />
                <Tooltip {...tooltipStyle} />
                {/* `connectNulls={false}`: un día sin dato tiene que verse como un
                    hueco. Uniendo los puntos, un informe que todavía no llegó se
                    dibujaría como una línea recta que parece un dato real. */}
                <Area
                  type="monotone" dataKey="visitantes" name="Visitantes"
                  stroke="#60A5FA" strokeWidth={2} fill="url(#gradVisitantes)"
                  connectNulls={false} dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* ── Base instalada ────────────────────────────────────────── */}
          <p className="text-[11px] uppercase tracking-wide text-[#A0A0B0] mb-2">
            Base instalada
          </p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="gradBase" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#22C55E" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#22C55E" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeComun} interval="preserveStartEnd" minTickGap={18} />
                {/* Dominio sobre los datos y no desde cero: la base instalada se
                    mueve de a poco sobre un número grande, y forzando el cero la
                    línea queda plana y no se ve nada. */}
                <YAxis {...ejeComun} width={38} domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip {...tooltipStyle} />
                <Area
                  type="monotone" dataKey="baseInstalada" name="Base instalada"
                  stroke="#22C55E" strokeWidth={2} fill="url(#gradBase)"
                  connectNulls={false} dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <p className="text-[10px] text-[#A0A0B0] mt-4 leading-relaxed">
            Play no dice de dónde vino cada instalación, así que estas series no se
            pueden cruzar fila por fila con los clics de la landing: se miran juntas
            para ver si se mueven igual, no para atribuir.
          </p>
        </>
      )}
    </section>
  )
}

// ── Vacío ──────────────────────────────────────────────────────────────────

function VacioPlay({ datos, dias }: { datos: PlayResumen | null; dias: Ventana }) {
  if (!datos) {
    return <p className="text-[#A0A0B0] text-sm py-8 text-center">No se pudo cargar el panel.</p>
  }

  if (datos.motivo === 'sin_migracion') {
    return (
      <div className="py-8 text-center">
        <p className="text-[#A0A0B0] text-sm">Falta correr la migración.</p>
        <p className="text-xs text-zinc-500 mt-1.5">
          Pegá <code className="text-zinc-400">supabase-play-stats.sql</code> en el SQL
          Editor de Supabase y recargá.
        </p>
      </div>
    )
  }

  return (
    <div className="py-8 text-center">
      <div className="flex justify-center mb-2 text-zinc-600"><Download size={20} /></div>
      <p className="text-[#A0A0B0] text-sm">
        Todavía no hay informes de los últimos {dias} días.
      </p>
      <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
        El cron corre a las 9:30 UTC. Para no esperar:<br />
        <code className="text-zinc-400">
          curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; /api/cron/play-stats
        </code>
      </p>
    </div>
  )
}
