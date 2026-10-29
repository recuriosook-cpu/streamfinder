'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getPosterUrl } from '@/lib/tmdb'
import type { AdminOverview, Metrica, SiguenConGlynbox } from '@/app/api/admin/overview/route'
import type { AdminContenido, TopMedia } from '@/app/api/admin/contenido/route'
import { fmtDuracion } from '@/lib/format-duracion'
import { RefrescoControl, useRefrescoAlVolver } from './Refresco'
import {
  Users, FileText, List, Star, Loader2, AlertCircle, Film, Tv,
  UserCheck, Eye, Activity, Clock, Smartphone, TrendingUp, TrendingDown, Info, HeartHandshake,
} from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'

// ── Helpers ────────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, color = 'yellow',
}: {
  icon: React.ReactNode; label: string; value: number | string; sub?: string; color?: 'yellow' | 'blue' | 'purple' | 'green'
}) {
  const styles = {
    yellow: 'text-[#FFFD02] bg-[#FFFD02]/10',
    blue:   'text-blue-400 bg-blue-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    green:  'text-emerald-400 bg-emerald-500/10',
  }
  const cls = styles[color]
  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${cls}`}>{icon}</div>
      <p className="text-3xl font-black text-white tabular-nums">
        {typeof value === 'number' ? value.toLocaleString('es-AR') : value}
      </p>
      <p className="text-sm text-[#A0A0B0] mt-1 font-medium">{label}</p>
      {sub && <p className="text-xs text-[#FFFD02] mt-0.5">{sub}</p>}
    </div>
  )
}

/**
 * "Siguen con Glynbox": el número, su porcentaje sobre los registrados y de
 * dónde sale. Viene sólo del precálculo de cada hora, nunca en vivo.
 */
function SiguenCard({ siguen, cargado }: { siguen: SiguenConGlynbox | null; cargado: boolean }) {
  const n = (x: number) => x.toLocaleString('es-AR')
  const valor = siguen ? siguen.porActividad + siguen.soloApp : null
  const pct = siguen && siguen.total > 0 && valor != null ? Math.round((valor / siguen.total) * 100) : null
  const hora = siguen
    ? new Date(siguen.calculadoEn).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : null
  const desde = siguen?.desinstaladosDesde
    ? new Date(siguen.desinstaladosDesde).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
    : null

  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 text-emerald-400 bg-emerald-500/10">
        <HeartHandshake size={20} />
      </div>
      <p className="text-3xl font-black text-white tabular-nums">
        {valor != null ? n(valor) : '—'}
        {pct != null && <span className="text-base font-bold text-emerald-400 ml-2">{pct}%</span>}
      </p>
      <p className="text-sm text-[#A0A0B0] mt-1 font-medium">Siguen con Glynbox</p>
      {siguen ? (
        <ul className="mt-2 space-y-0.5 text-xs text-[#A0A0B0] tabular-nums">
          <li><span className="text-white">{n(siguen.porActividad)}</span> por actividad en 30 días</li>
          <li><span className="text-white">{n(siguen.soloApp)}</span> sólo por tener la app</li>
          <li>
            <span className="text-white">{n(siguen.desinstalaron)}</span> desinstalaron
            {desde ? ` (desde el ${desde})` : ''}
          </li>
          <li><span className="text-white">{n(siguen.eliminadas)}</span> eliminaron la cuenta</li>
          <li className="text-[#6B6B80]">De {n(siguen.total)} registrados · {hora}</li>
        </ul>
      ) : (
        cargado && <p className="text-xs text-[#FFFD02] mt-0.5">Falta correr supabase-siguen-con-glynbox-2026-10.sql</p>
      )}
    </div>
  )
}

/** Fecha larga para el cartel de inicio de medición. */
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Tarjeta con número grande y comparación contra el período anterior.
 *
 * Tres estados, y la diferencia entre los dos primeros es todo el punto:
 *
 *   valor === null  -> "sin datos". No estamos midiendo esto todavía.
 *   valor === 0     -> un cero de verdad. Medimos y no pasó nada.
 *   valor > 0       -> el número, con su flecha.
 *
 * Y dentro del tercero, `deltaPct === null` significa que el período anterior
 * fue 0: no hay porcentaje de crecimiento desde cero, así que se muestra el
 * delta absoluto en vez de un "+100%" inventado.
 */
/**
 * Las líneas de abajo del recuadro de la app.
 *
 * El número grande cuenta instalaciones; esto lo reparte (con o sin sesión,
 * por sistema), dice cuántas tienen notificaciones —el número que antes se
 * mostraba como "tienen la app"— y lo pone al lado de lo que dice Google Play.
 */
function lineasDeLaApp(act: AdminOverview['actividad']): string[] {
  const u = act.appUso
  const fecha = (iso: string) =>
    new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })
  const lineas = [
    `${u.conSesion.toLocaleString('es-AR')} con sesión · ${u.sinSesion.toLocaleString('es-AR')} sin sesión`,
    `Android ${u.android} · iOS ${u.ios}` + (u.sinSistema > 0 ? ` · sin dato ${u.sinSistema}` : ''),
    `${act.app.usuarios.toLocaleString('es-AR')} con notificaciones activas`,
  ]
  if (u.play) {
    lineas.push(`Google Play: ${u.play.activos.toLocaleString('es-AR')} dispositivos activos (al ${fecha(u.play.fecha)})`)
  }
  if (u.sinSistema > 0) {
    // Lo que se pudo, ya se completó con el sistema del mismo usuario (otros
    // eventos o user_devices). Esto es lo que no tiene de dónde salir.
    lineas.push(
      'Sin dato: instalaciones que no abren la app desde antes del 15/10, cuando se ' +
      'empezó a registrar el sistema. Su user-agent no se guardó; salen solas de la ventana de 30 días.',
    )
  }
  if (u.desde && Date.now() - new Date(u.desde).getTime() < 30 * 864e5) {
    lineas.push(`Se mide desde el ${fecha(u.desde)}: la ventana de 30 días todavía no está llena`)
  }
  return lineas
}

function MetricaCard({
  icon, label, metrica, formato, sub, color = 'yellow', contra = 'el período anterior',
}: {
  icon: React.ReactNode
  label: string
  metrica: Metrica
  /** Cómo se pinta el número. Por defecto, separador de miles. */
  formato?: (n: number) => string
  /** Una línea o varias, una abajo de la otra. */
  sub?: string | string[]
  color?: 'yellow' | 'blue' | 'purple' | 'green' | 'teal'
  /** Contra qué se compara. Por defecto, "el período anterior". */
  contra?: string
}) {
  const styles = {
    yellow: 'text-[#FFFD02] bg-[#FFFD02]/10',
    blue:   'text-blue-400 bg-blue-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    green:  'text-emerald-400 bg-emerald-500/10',
    teal:   'text-teal-400 bg-teal-500/10',
  }

  const fmt = formato ?? ((n: number) => n.toLocaleString('es-AR'))
  const sinDatos = metrica.valor === null

  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-6">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${styles[color]}`}>
        {icon}
      </div>

      {sinDatos ? (
        <p className="text-2xl font-black text-zinc-700 italic">sin datos</p>
      ) : (
        <p className="text-3xl font-black text-white tabular-nums">{fmt(metrica.valor!)}</p>
      )}

      <p className="text-sm text-[#A0A0B0] mt-1 font-medium">{label}</p>

      {!sinDatos && <Comparacion metrica={metrica} formato={fmt} contra={contra} />}
      {(Array.isArray(sub) ? sub : sub ? [sub] : []).map((linea) => (
        <p key={linea} className="text-xs text-[#A0A0B0]/70 mt-1">{linea}</p>
      ))}
    </div>
  )
}

function Comparacion({ metrica, formato, contra }: { metrica: Metrica; formato: (n: number) => string; contra: string }) {
  const { valor, previo, deltaPct } = metrica
  if (valor === null || previo === null) return null

  // Período anterior en cero: el porcentaje no existe. Se muestra el salto en
  // términos absolutos, que sí se puede afirmar.
  if (deltaPct === null) {
    if (valor === 0) {
      return <p className="text-xs text-[#A0A0B0]/60 mt-1.5">sin actividad en ninguno de los dos períodos</p>
    }
    return (
      <p className="text-xs text-emerald-400 mt-1.5 font-medium">
        +{formato(valor)} · {contra} fue cero
      </p>
    )
  }

  const sube = deltaPct > 0
  const igual = deltaPct === 0
  const cls = igual ? 'text-[#A0A0B0]' : sube ? 'text-emerald-400' : 'text-red-400'

  return (
    <p className={`text-xs mt-1.5 font-medium flex items-center gap-1 ${cls}`}>
      {!igual && (sube ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
      {igual ? 'igual que' : `${sube ? '+' : ''}${deltaPct}% vs`} {contra}
      <span className="text-[#A0A0B0]/60 font-normal">({formato(previo)})</span>
    </p>
  )
}

/** El estado "no estamos midiendo esto". Ver `MetricaCard`. */
const SIN_DATOS: Metrica = { valor: null, previo: null, deltaPct: null }

// ── Main ──────────────────────────────────────────────────────────────────

export default function ResumenPage() {
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  const [overview,  setOverview]  = useState<AdminOverview | null>(null)
  const [contenido, setContenido] = useState<AdminContenido | null>(null)

  useEffect(() => { fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useRefrescoAlVolver(fetchAll, actualizadoEn)

  async function fetchAll() {
    // La primera carga tapa la pantalla con el spinner. Las siguientes dejan
    // los números a la vista y sólo hacen girar el botón.
    if (actualizadoEn) setRefrescando(true)
    else setLoading(true)
    setError(null)

    // Todo se calcula en el servidor, con service role: desde el navegador las
    // consultas pasan por RLS (no se ve a los usuarios privados) y PostgREST
    // corta en 1000 filas sin avisar.
    const pedir = <T,>(url: string) =>
      fetch(url, { cache: 'no-store' })
        .then(async r => (r.ok ? ((await r.json()) as T) : null))
        .catch(() => null)

    const [ov, cont] = await Promise.all([
      pedir<AdminOverview>('/api/admin/overview'),
      pedir<AdminContenido>('/api/admin/contenido'),
    ])

    const fallas = [!ov && '/api/admin/overview', !cont && '/api/admin/contenido'].filter(Boolean)
    if (fallas.length > 0) setError(`No se pudo leer ${fallas.join(' y ')}: parte del resumen no se muestra.`)

    setOverview(ov)
    setContenido(cont)
    setLoading(false)
    setRefrescando(false)
    setActualizadoEn(new Date())
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#FFFD02]" />
      </div>
    )
  }

  // `?? null` y no `!`: si el deploy del endpoint todavía no salió, la
  // respuesta vieja no trae `actividad` y las tarjetas caen en "sin datos" en
  // vez de romper el panel con un TypeError.
  const act = overview?.actividad ?? null

  // "Hoy" se compara contra ayer hasta esta misma hora. Con la vista vieja
  // (falta supabase-metricas-2026-10.sql) es contra el día entero, y lo dice.
  const contraAyer = act?.ayerMismaHora ? 'ayer a esta hora' : 'ayer completo'

  const actByDay = (contenido?.porDia ?? []).map(d => ({
    ...d,
    label: new Date(`${d.dia}T12:00:00-03:00`).toLocaleDateString('es-AR', {
      weekday: 'short', day: 'numeric', timeZone: 'America/Argentina/Buenos_Aires',
    }),
  }))
  const topRated: TopMedia[] = contenido?.semana.calificadas ?? []
  const topWatchlist: TopMedia[] = contenido?.semana.agregadas ?? []

  // Los anónimos, separados si la vista ya los trae.
  const anonSub = act?.anonimosHoyWeb && act.anonimosHoyApp
    ? [
        `En la web: ${(act.anonimosHoyWeb.valor ?? 0).toLocaleString('es-AR')} navegadores`,
        `En la app: ${(act.anonimosHoyApp.valor ?? 0).toLocaleString('es-AR')} instalaciones`,
        'No se pisan con los de arriba',
      ]
    : 'Navegadores e instalaciones de la app sin sesión. No se pisan con los de arriba'

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#13131A] border-b border-[#2A2A3A] px-6 py-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Resumen</h1>
          <p className="text-sm text-[#A0A0B0] mt-0.5">Vista general de Glynbox</p>
        </div>
        <RefrescoControl actualizadoEn={actualizadoEn} cargando={refrescando} onActualizar={fetchAll} />
      </div>

      <div className="px-6 py-6 space-y-6 max-w-6xl">

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            icon={<Users size={20} />}
            label="Usuarios registrados"
            value={overview ? overview.registrosTotales : '—'}
            sub="Alta real (auth.users)"
            color="yellow"
          />
          <SiguenCard siguen={overview?.siguen ?? null} cargado={!!overview} />
          {/* Usuarios distintos con algún evento, en la web o en la app. Es el
              mismo criterio que "Se conectaron esta semana", de abajo: antes
              salía de profiles.last_active, que escribe sólo la web, y daba 22
              contra 504. */}
          <StatCard
            icon={<Users size={20} />}
            label="Activos en 30 días"
            value={overview?.activos30d ?? '—'}
            sub={
              overview?.activos30d == null
                ? overview?.actividad.fallo === 'tiempo'
                  ? 'No se pudo calcular: la base tardó demasiado. Probá actualizar.'
                  : overview?.actividad.fallo === 'error'
                    ? 'No se pudo calcular (el detalle está en los logs, [admin/overview])'
                    : overview
                      ? 'Falta correr supabase-metricas-2026-10.sql'
                      : 'No se pudo cargar el resumen'
                : overview.activos7d != null
                  ? `${overview.activos7d.toLocaleString('es-AR')} en 7 días · web y app`
                  : 'Web y app'
            }
            color="green"
          />
          <StatCard icon={<FileText size={20} />} label="Reseñas publicadas" value={contenido?.totales.resenas ?? '—'} color="purple" />
          <StatCard icon={<List size={20} />}     label="Listas creadas"     value={contenido?.totales.listas ?? '—'}  color="blue"   />
        </div>

        {/* ── Actividad medida ────────────────────────────────────────────
            Estas seis salen de las vistas de analytics y TODAS excluyen bots.
            Van separadas de las tarjetas de arriba a propósito: aquéllas se
            calculan sobre auth.users y profiles, que existen desde siempre;
            éstas sólo saben lo que pasó desde que instalamos el tracking.
            Mezclarlas en la misma grilla haría parecer que todas cubren el
            mismo período. */}
        <div>
          <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-white">Actividad medida</h2>
            <span className="text-xs text-[#A0A0B0]">Sin bots · comparado con el período anterior</span>
          </div>

          {/* Mismo criterio que /admin/usuarios: sin este cartel las tarjetas
              mienten por omisión. "12 conectados esta semana" se lee como el
              histórico y es lo que pasó desde anteayer. */}
          <div className="flex items-start gap-2 rounded-xl border border-[#2A2A3A] bg-[#13131A] px-4 py-2.5 mb-4">
            <Info size={13} className="text-[#FFFD02] shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-[#A0A0B0]">
              {act && act.disponible && act.medicionDesde ? (
                <>
                  Se mide desde el{' '}
                  <span className="text-white font-medium">{fmtDateTime(act.medicionDesde)}</span>,
                  cuando se instaló el tracking. Los períodos que empiezan antes de esa fecha están
                  incompletos: el número es un piso, no el total. Los eventos de crawlers están
                  excluidos (<code className="text-[#A0A0B0]">is_bot = false</code>).
                </>
              ) : act && act.disponible ? (
                <>
                  Los períodos que empiezan antes de que se instalara el tracking están
                  incompletos: el número es un piso, no el total. Los eventos de crawlers están
                  excluidos (<code className="text-[#A0A0B0]">is_bot = false</code>).
                </>
              ) : act?.fallo ? (
                <>
                  <span className="text-white font-medium">No se pudo leer la actividad.</span>{' '}
                  {act.fallo === 'tiempo'
                    ? 'La base tardó demasiado. Probá actualizar en un rato.'
                    : 'El detalle está en los logs ([admin/overview]).'}
                </>
              ) : (
                <>
                  <span className="text-white font-medium">Todavía no hay medición de actividad.</span>{' '}
                  Falta correr <span className="text-white font-medium">supabase-analytics-resumen.sql</span>{' '}
                  en la base, o todavía no entró ningún evento de una persona real. Las tarjetas
                  muestran «sin datos» hasta entonces.
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricaCard
              icon={<Users size={20} />}
              label="Se conectaron hoy"
              metrica={act?.conectadosHoy ?? SIN_DATOS}
              contra={contraAyer}
              sub="Usuarios distintos, en la web o en la app"
              color="yellow"
            />
            <MetricaCard
              icon={<UserCheck size={20} />}
              label="Se conectaron esta semana"
              metrica={act?.conectadosSemana ?? SIN_DATOS}
              sub="Usuarios distintos en los últimos 7 días, web y app"
              contra="los 7 días anteriores"
              color="green"
            />
            <MetricaCard
              icon={<Eye size={20} />}
              label="Sin sesión hoy"
              metrica={act?.anonimosHoy ?? SIN_DATOS}
              contra={contraAyer}
              sub={anonSub}
              color="blue"
            />
            <MetricaCard
              icon={<Activity size={20} />}
              label="Sesiones hoy"
              metrica={act?.sesionesHoy ?? SIN_DATOS}
              contra={contraAyer}
              color="teal"
            />
            <MetricaCard
              icon={<Clock size={20} />}
              label="Duración promedio de sesión"
              metrica={act?.duracionSesion ?? SIN_DATOS}
              formato={fmtDuracion}
              contra={contraAyer}
              sub={
                act?.duracionSesionTotal != null
                  ? `${fmtDuracion(act.duracionSesionTotal)} promedio ${act.duracionSesionDesde ? 'de los últimos 30 días' : 'desde el inicio'}`
                  : undefined
              }
              color="purple"
            />
            {act?.appUso.disponible ? (
              <MetricaCard
                icon={<Smartphone size={20} />}
                label="Usan la app (últimos 30 días)"
                // Instalaciones, no usuarios: un `anon_id` de la app con algún
                // evento en 30 días, con o sin sesión. Ver
                // supabase-analytics-app-uso-2026-10.sql.
                metrica={act.appUso.activas}
                sub={lineasDeLaApp(act)}
                color="green"
              />
            ) : (
              <MetricaCard
                icon={<Smartphone size={20} />}
                label="Con notificaciones de la app"
                // Sin el SQL nuevo queda el número viejo, con el nombre que le
                // corresponde: `user_devices` son los tokens de notificaciones,
                // no las instalaciones.
                metrica={
                  act
                    ? { valor: act.app.usuarios, previo: act.app.previo, deltaPct: act.app.deltaPct }
                    : SIN_DATOS
                }
                sub={
                  act && act.app.usuarios > 0
                    ? [
                        `${act.app.android} Android · ${act.app.ios} iOS` +
                          (act.app.otras > 0 ? ` · ${act.app.otras} otras` : ''),
                        'Falta correr supabase-analytics-app-uso-2026-10.sql',
                      ]
                    : 'Ningún dispositivo registrado todavía'
                }
                color="green"
              />
            )}
          </div>
        </div>

        {/* Line chart: registros por mes.
            Antes este panel graficaba profiles.updated_at por día y lo llamaba
            "actividad de perfiles". updated_at no es ni la fecha de alta ni la
            de actividad: es cuándo se tocó la fila por última vez. Ahora sale de
            auth.users.created_at vía /api/admin/overview. */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Registros por mes — últimos 12 meses</h2>
          <p className="text-xs text-[#A0A0B0] mb-5">Fecha de alta real, desde auth.users</p>
          {!overview ? (
            <p className="text-[#A0A0B0] text-sm py-12 text-center">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={overview.registrosPorMes} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" />
                <XAxis
                  dataKey="mes"
                  tick={{ fill: '#A0A0B0', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1C1C27', border: '1px solid #2A2A3A', borderRadius: 8, color: '#fff', fontSize: 12 }}
                  labelStyle={{ color: '#FFFD02' }}
                  cursor={{ stroke: '#FFFD02', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Registros"
                  stroke="#FFFD02"
                  strokeWidth={2}
                  dot={{ fill: '#FFFD02', r: 3 }}
                  activeDot={{ r: 4, fill: '#FFFD02' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bar chart: actividad últimos 7 días */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Actividad por día — últimos 7 días</h2>
          <p className="text-xs text-[#A0A0B0] mb-5">Reseñas + calificaciones + listas · días de Argentina · todos los usuarios</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={actByDay} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" />
              <XAxis dataKey="label" tick={{ fill: '#A0A0B0', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1C1C27', border: '1px solid #2A2A3A', borderRadius: 8, color: '#fff', fontSize: 12 }}
                cursor={{ fill: 'rgba(255,253,2,0.05)' }}
              />
              <Bar dataKey="resenas"        name="Reseñas"        fill="#A855F7" radius={[3,3,0,0]} />
              <Bar dataKey="calificaciones" name="Calificaciones" fill="#F59E0B" radius={[3,3,0,0]} />
              <Bar dataKey="listas"   name="Listas"         fill="#3B82F6" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top 5 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Top rated this week */}
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Star size={15} className="text-amber-400" />
              Más calificadas esta semana
            </h2>
            {topRated.length === 0
              ? <p className="text-[#A0A0B0] text-sm py-6 text-center">Sin calificaciones esta semana</p>
              : (
                <div className="space-y-3">
                  {topRated.map((item, i) => (
                    <Link
                      key={`${item.media_id}-${item.media_type}`}
                      href={`/${item.media_type === 'tv' ? 'series' : 'movie'}/${item.media_id}`}
                      className="flex items-center gap-3 hover:bg-[#1C1C27] -mx-2 px-2 py-1.5 rounded-xl transition-colors"
                    >
                      <span className="text-xs text-zinc-600 w-4 text-right shrink-0 font-bold">{i + 1}</span>
                      {item.poster_path
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={getPosterUrl(item.poster_path, 'w92')} alt={item.title} className="w-9 h-14 object-cover rounded shrink-0" />
                        : <div className="w-9 h-14 bg-[#1C1C27] rounded shrink-0 flex items-center justify-center">
                            {item.media_type === 'tv' ? <Tv size={12} className="text-zinc-600" /> : <Film size={12} className="text-zinc-600" />}
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{item.title}</p>
                        <p className="text-xs text-[#A0A0B0]">{item.media_type === 'tv' ? 'Serie' : 'Película'}</p>
                      </div>
                      <span className="text-sm font-bold text-amber-400 shrink-0">{item.count}★</span>
                    </Link>
                  ))}
                </div>
              )
            }
          </div>

          {/* Top watchlist this week */}
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <List size={15} className="text-blue-400" />
              Más agregadas a &quot;Ver después&quot; esta semana
            </h2>
            {topWatchlist.length === 0
              ? <p className="text-[#A0A0B0] text-sm py-6 text-center">Sin actividad esta semana</p>
              : (
                <div className="space-y-3">
                  {topWatchlist.map((item, i) => (
                    <Link
                      key={`${item.media_id}-${item.media_type}-wl`}
                      href={`/${item.media_type === 'tv' ? 'series' : 'movie'}/${item.media_id}`}
                      className="flex items-center gap-3 hover:bg-[#1C1C27] -mx-2 px-2 py-1.5 rounded-xl transition-colors"
                    >
                      <span className="text-xs text-zinc-600 w-4 text-right shrink-0 font-bold">{i + 1}</span>
                      {item.poster_path
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={getPosterUrl(item.poster_path, 'w92')} alt={item.title} className="w-9 h-14 object-cover rounded shrink-0" />
                        : <div className="w-9 h-14 bg-[#1C1C27] rounded shrink-0 flex items-center justify-center">
                            {item.media_type === 'tv' ? <Tv size={12} className="text-zinc-600" /> : <Film size={12} className="text-zinc-600" />}
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium truncate">{item.title}</p>
                        <p className="text-xs text-[#A0A0B0]">{item.media_type === 'tv' ? 'Serie' : 'Película'}</p>
                      </div>
                      <span className="text-sm font-bold text-blue-400 shrink-0">{item.count}×</span>
                    </Link>
                  ))}
                </div>
              )
            }
          </div>
        </div>

      </div>
    </div>
  )
}
