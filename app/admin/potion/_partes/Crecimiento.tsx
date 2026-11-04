'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { Loader2 } from 'lucide-react'
import { VENTANA_POR_DEFECTO, type Ventana } from '@/lib/metricas-ventanas'
import type { PlayResumen } from '@/app/api/admin/play/route'
import { TablaCuadre, TablaDiaria, TablaPaises, VacioPlay } from '@/app/admin/_components/GooglePlayPanel'
import { Bloque, Plegable, SelectorDias, Subtitulo, Dato, numero, diaCorto, tooltipStyle, ejeComun } from './piezas'

/**
 * "¿Crece o se achica?": los aparatos con la app día por día, con las
 * instalaciones y desinstalaciones como barras. Datos de Google Play
 * (`/api/admin/play?app=potion`), con su propio 7 / 30 días. De la casilla
 * del lanzamiento toma sólo el `desde`, igual que antes.
 *
 * Todo lo que mostraba el panel de Google Play sigue acá: lo que no es el
 * gráfico queda en "Ver detalle".
 */
export function Crecimiento({ recarga, desde }: { recarga: number; desde?: string }) {
  const [dias, setDias] = useState<Ventana>(VENTANA_POR_DEFECTO)
  const [datos, setDatos] = useState<PlayResumen | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async (ventana: Ventana) => {
    setCargando(true)
    try {
      const params = new URLSearchParams({ dias: String(ventana), app: 'potion' })
      if (desde) params.set('desde', desde)
      const r = await fetch(`/api/admin/play?${params}`, { cache: 'no-store' })
      setDatos(r.ok ? ((await r.json()) as PlayResumen) : null)
    } catch {
      setDatos(null)
    } finally {
      setCargando(false)
    }
  }, [desde])

  useEffect(() => { void cargar(dias) }, [dias, cargar, recarga])

  const serie = (datos?.serie ?? []).map(d => ({
    ...d,
    etiqueta: diaCorto(d.fecha),
    // Las bajas para abajo: se lee de un vistazo qué pesa más.
    bajas: d.desinstalaciones === null ? null : -d.desinstalaciones,
  }))
  const t = datos?.totales
  const h = datos?.historico

  return (
    <Bloque
      titulo="¿Crece o se achica?"
      frase="Si la línea verde sube, cada vez más gente tiene el juego. Las barras amarillas son los que lo instalaron y las rojas los que lo borraron."
      derecha={<SelectorDias valor={dias} onCambiar={setDias} />}
    >
      {cargando && !datos ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-[#FFFD02]" /></div>
      ) : !datos || !datos.disponible || !t || !h ? (
        <>
          <VacioPlay datos={datos} dias={dias} />
          {/* Los países son otra tabla, con otros días: no se esconden porque
              la serie diaria no tenga nada en la ventana. */}
          {datos && datos.motivo !== 'sin_migracion' && (
            <Plegable>
              <TablaPaises paises={datos.paises} dias={dias} rango={datos.rangos?.paises ?? null} />
            </Plegable>
          )}
        </>
      ) : (
        <div className={`transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          <div className="h-60 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie} margin={{ top: 6, right: 6, bottom: 0, left: -18 }} stackOffset="sign">
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" vertical={false} />
                <XAxis dataKey="etiqueta" {...ejeComun} interval="preserveStartEnd" minTickGap={18} />
                <YAxis {...ejeComun} width={38} allowDecimals={false} tickFormatter={(v: number) => String(Math.abs(v))} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v, nombre) => [numero(Math.abs(Number(v))), nombre]}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#A0A0B0' }} iconSize={10} />
                <Bar dataKey="instalaciones" name="Instalaron" fill="#FFFD02" stackId="flujo" radius={[2, 2, 0, 0]} />
                <Bar dataKey="bajas" name="Borraron" fill="#EF4444" stackId="flujo" radius={[0, 0, 2, 2]} />
                <Line
                  type="monotone" dataKey="baseInstalada" name="Tienen la app"
                  stroke="#22C55E" strokeWidth={3} dot={false} connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <Dato label="Tienen la app" tono="text-emerald-400"
              value={t.baseInstalada === null ? '—' : numero(t.baseInstalada)}
              sub={t.baseInstaladaVariacion === null ? 'el último día con dato'
                : `${t.baseInstaladaVariacion >= 0 ? '+' : ''}${numero(t.baseInstaladaVariacion)} en estos ${dias} días`} />
            <Dato label="Lo instalaron" tono="text-[#FFFD02]" value={numero(t.instalaciones)} sub={`en ${dias} días`} />
            <Dato label="Lo borraron" tono="text-red-400"
              value={h.bajasInformadas ? numero(t.desinstalaciones) : '—'}
              sub={h.bajasInformadas ? `en ${dias} días` : 'Google no lo informa'} />
            <Dato label="Vieron la ficha y lo instalaron" tono="text-sky-400"
              value={t.conversionFichaPct === null ? '—' : `${t.conversionFichaPct}%`}
              sub={`de ${numero(t.visitantes)} que entraron a la ficha de Play`} />
          </div>

          <p className="text-[11px] text-zinc-500 mt-3">
            Datos de Google Play
            {datos.actualizadoEn && <> · copiados el {new Date(datos.actualizadoEn).toLocaleDateString('es-AR')}</>}
            {datos.serie.length > 0 && <> · último día con dato: {diaCorto(datos.serie[datos.serie.length - 1].fecha)}</>}
            . Google corrige los últimos días durante una semana.
          </p>

          <Plegable>
            <p className="text-xs text-[#A0A0B0] leading-relaxed">
              En estas tablas, <strong className="text-white">base instalada</strong> son los aparatos que
              tienen la app y la usaron en los últimos 30 días, y <strong className="text-white">neto</strong> es
              instalaciones menos desinstalaciones. Los días de Play son en hora UTC.
            </p>

            <TablaCuadre ventana={t.cuadre} historico={h.cuadre} dias={dias} bajasInformadas={h.bajasInformadas} />

            {h.desde && (
              <p className="text-xs text-[#A0A0B0]">
                Desde el {diaCorto(h.desde)}:{' '}
                <span className="text-white font-semibold tabular-nums">{numero(h.instalaciones)}</span> instalaciones
                {h.bajasInformadas ? (
                  <>, <span className="text-white font-semibold tabular-nums">{numero(h.desinstalaciones)}</span> desinstalaciones,
                    {' '}neto <span className="text-white font-semibold tabular-nums">{h.neto >= 0 ? '+' : ''}{numero(h.neto)}</span>.</>
                ) : <>, sin desinstalaciones informadas por Play.</>}
                {' '}En estos {dias} días: neto{' '}
                <span className="text-white font-semibold tabular-nums">{t.neto >= 0 ? '+' : ''}{numero(t.neto)}</span>.
              </p>
            )}

            <div>
              <Subtitulo>Visitantes de la ficha de Play</Subtitulo>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serie} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="gradVisitantesPotion" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" vertical={false} />
                    <XAxis dataKey="etiqueta" {...ejeComun} interval="preserveStartEnd" minTickGap={18} />
                    <YAxis {...ejeComun} width={38} />
                    <Tooltip {...tooltipStyle} />
                    <Area type="monotone" dataKey="visitantes" name="Visitantes" stroke="#60A5FA" strokeWidth={2}
                      fill="url(#gradVisitantesPotion)" connectNulls={false} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <Subtitulo>Día por día</Subtitulo>
              <TablaDiaria serie={datos.serie} />
            </div>

            {datos.motivo !== 'sin_migracion' && (
              <TablaPaises paises={datos.paises} dias={dias} rango={datos.rangos?.paises ?? null} />
            )}

            <p className="text-[10px] text-[#A0A0B0] leading-relaxed">
              Instalaciones cuenta aparatos, reinstalaciones incluidas. Google corrige los últimos días durante una semana.
            </p>
          </Plegable>
        </div>
      )}
    </Bloque>
  )
}
