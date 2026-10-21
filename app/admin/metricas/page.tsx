'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getPosterUrl } from '@/lib/tmdb'
import { Film, Tv, Loader2, AlertTriangle, CheckCircle2, SkipForward, LogOut } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, LineChart, Line,
} from 'recharts'
import { COUNTRIES } from '@/lib/countries'
import type { AdminOverview } from '@/app/api/admin/overview/route'
import type { AdminContenido } from '@/app/api/admin/contenido/route'
import { LandingDescargarPanel } from '@/app/admin/_components/LandingDescargarPanel'
import { GooglePlayPanel } from '@/app/admin/_components/GooglePlayPanel'
import { RetencionPanel } from '@/app/admin/_components/RetencionPanel'
import { AppMedicionPanel } from '@/app/admin/_components/AppMedicionPanel'
import { RefrescoControl, useRefrescoAlVolver } from '@/app/admin/_components/Refresco'

// ── Tarjeta del desglose de onboarding ─────────────────────────────────────

function OnboardingCard({
  icon, label, hint, value, total, tone,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  value: number
  total: number
  tone: 'green' | 'amber' | 'red'
}) {
  const tones = {
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-900/50',
    amber: 'text-amber-400  bg-amber-500/10  border-amber-900/50',
    red:   'text-red-400    bg-red-500/10    border-red-900/50',
  }
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-black text-white tabular-nums">
        {value.toLocaleString('es-AR')}
        <span className="text-sm font-bold text-[#A0A0B0] ml-1.5">{pct}%</span>
      </p>
      <p className="text-[10px] text-[#A0A0B0] mt-1">{hint}</p>
    </div>
  )
}

export default function MetricasPage() {
  const [loading, setLoading] = useState(true)
  const [refrescando, setRefrescando] = useState(false)
  const [actualizadoEn, setActualizadoEn] = useState<Date | null>(null)
  /** Sube en cada refresco; los paneles lo escuchan para volver a pedir lo suyo. */
  const [recarga, setRecarga] = useState(0)

  const [overview,  setOverview]  = useState<AdminOverview | null>(null)
  const [contenido, setContenido] = useState<AdminContenido | null>(null)

  useEffect(() => { fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useRefrescoAlVolver(fetchAll, actualizadoEn)

  async function fetchAll() {
    // La primera carga tapa la pantalla con el spinner. Las siguientes dejan
    // los gráficos a la vista y sólo hacen girar el botón.
    if (actualizadoEn) {
      setRefrescando(true)
      setRecarga(n => n + 1)
    } else {
      setLoading(true)
    }

    // Todo sale del servidor, con service role. Desde el navegador las
    // consultas pasaban por RLS (sin los usuarios privados) y PostgREST
    // devolvía 1000 filas aunque se pidieran 10000: los tops salían de una
    // muestra cortada.
    const pedir = <T,>(url: string) =>
      fetch(url, { cache: 'no-store' })
        .then(async r => (r.ok ? ((await r.json()) as T) : null))
        .catch(() => null)

    const [ov, cont] = await Promise.all([
      pedir<AdminOverview>('/api/admin/overview'),
      pedir<AdminContenido>('/api/admin/contenido'),
    ])

    setOverview(ov)
    setContenido(cont)
    setLoading(false)
    setRefrescando(false)
    setActualizadoEn(new Date())
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={28} className="animate-spin text-[#FFFD02]" />
    </div>
  )

  // Usuarios por país: los conteos vienen del endpoint; acá sólo se traduce el
  // código ISO a nombre.
  const byCountry = (overview?.paises ?? []).map(({ country, count }) => ({
    country: COUNTRIES.find(c => c.code === country)?.name ?? country,
    count,
  }))
  const byHour = (contenido?.porHora ?? []).map(h => ({
    hour: `${String(h.hora).padStart(2, '0')}h`,
    eventos: h.eventos,
    personas: h.personas,
  }))
  const topWatchlist = contenido?.topVerDespues ?? []
  const topRated = contenido?.topCalificadas ?? []
  const topUsers = contenido?.topUsuarios ?? []

  const tooltipStyle = {
    contentStyle: { background: '#1C1C27', border: '1px solid #2A2A3A', borderRadius: 8, color: '#fff', fontSize: 12 },
    cursor: { fill: 'rgba(255,253,2,0.04)' },
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-[#13131A] border-b border-[#2A2A3A] px-6 py-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Métricas</h1>
          <p className="text-sm text-[#A0A0B0] mt-0.5">Estadísticas profundas de la plataforma</p>
        </div>
        <RefrescoControl actualizadoEn={actualizadoEn} cargando={refrescando} onActualizar={fetchAll} />
      </div>

      <div className="px-6 py-6 space-y-6 max-w-6xl">

        {/*
          Captación: los dos paneles, uno al lado del otro.

          Van en pareja porque cuentan las dos mitades de lo mismo. El de la
          izquierda sabe cuánta gente que llegó por una campaña tocó el botón
          de Play Store; el de la derecha, cuánta terminó instalando. Por
          separado, cada uno responde media pregunta.

          Se apilan hasta `xl` y recién ahí se ponen lado a lado: los dos son
          densos —una tabla de seis columnas uno, tres gráficos el otro— y
          partirlos en dos columnas angostas antes de tener el ancho los vuelve
          ilegibles. `items-start` para que el más corto no se estire.

          Cada uno se pide sus propios datos y mantiene su propio filtro; lo
          que comparten es la lista de ventanas (`lib/metricas-ventanas.ts`),
          para que no se pueda terminar comparando 7 días contra 30.
        */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          <LandingDescargarPanel recarga={recarga} />
          <GooglePlayPanel recarga={recarga} />
        </div>

        {/* Retención — va a lo ancho y no en la grilla de arriba: son cuatro
            bloques, dos de ellos tablas, y en media columna no entran. Y va
            después de captación a propósito: primero cómo llegan, después qué
            pasa con los que llegaron. */}
        <RetencionPanel recarga={recarga} />

        {/* Onboarding — desglose real.
            `onboarding_completed = true` no distingue terminar de saltar:
            handleSkip() lo pone en true igual que handleFinish(). La única señal
            de completado real es onboarding_completed_at. */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Onboarding</h2>
          <p className="text-xs text-[#A0A0B0] mb-5">
            Desglose real sobre {overview?.onboarding.total ?? 0} perfiles ·
            {' '}<code className="text-zinc-500">onboarding_completed</code> por sí solo mezcla completado con salteado
          </p>
          {!overview ? (
            <p className="text-[#A0A0B0] text-sm py-6 text-center">Sin datos</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <OnboardingCard
                icon={<CheckCircle2 size={16} />}
                label="Completado real"
                hint="tiene onboarding_completed_at"
                value={overview.onboarding.completadoReal}
                total={overview.onboarding.total}
                tone="green"
              />
              <OnboardingCard
                icon={<SkipForward size={16} />}
                label="Salteado"
                hint="apretó “Saltar onboarding”"
                value={overview.onboarding.salteado}
                total={overview.onboarding.total}
                tone="amber"
              />
              <OnboardingCard
                icon={<LogOut size={16} />}
                label="Abandonado"
                hint="ni completó ni salteó"
                value={overview.onboarding.abandonado}
                total={overview.onboarding.total}
                tone="red"
              />
            </div>
          )}
        </div>

        {/* Lo nuevo de la app, con eventos: embudo de onboarding por flujo,
            notificaciones y modo deslizar. Después del desglose por perfiles
            porque el embudo es el detalle de ese mismo onboarding. */}
        <AppMedicionPanel recarga={recarga} />

        {/* Registros por mes — fecha de alta real (auth.users.created_at).
            Antes se graficaba profiles.updated_at, que es cuándo se tocó la fila
            por última vez, no cuándo se dio de alta el usuario. */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Registros por mes — últimos 12 meses</h2>
          <p className="text-xs text-[#A0A0B0] mb-5">
            Fecha de alta real desde auth.users
            {overview && ` · ${overview.registrosTotales} en total, ${overview.sinConfirmar} sin confirmar el email`}
          </p>
          {!overview ? (
            <p className="text-[#A0A0B0] text-sm py-12 text-center">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={overview.registrosPorMes} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" />
                <XAxis dataKey="mes" tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} labelStyle={{ color: '#FFFD02' }} />
                <Line type="monotone" dataKey="total" name="Registros" stroke="#FFFD02" strokeWidth={2} dot={{ fill: '#FFFD02', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Por país.
            Sólo cuenta perfiles con país real: detectado por la IP al entrar a
            la web o al usar la app (`country_source = 'auto'`, ver lib/pais-perfil.ts) o elegido en Ajustes ('manual'). Los
            perfiles de antes de la detección tienen el 'AR' por defecto y
            quedan afuera hasta su próximo ingreso. Mientras no haya ninguno,
            sigue el cartel. */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-2">Usuarios por país (top 15)</h2>
          {(overview?.paisesCobertura.conPais ?? 0) > 0 ? (
            <p className="mb-5 text-[11px] text-[#A0A0B0]">
              País detectado en {overview!.paisesCobertura.conPais} de {overview!.paisesCobertura.total} usuarios.
              El resto se completa cuando vuelvan a entrar.
            </p>
          ) : (
            <div className="mb-5 bg-amber-900/20 border border-amber-800/60 rounded-xl px-4 py-2.5 flex items-start gap-2.5">
              <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                <span className="font-semibold">Todavía no hay países detectados.</span>{' '}
                El país se toma de la IP cuando un usuario entra con sesión iniciada, o de lo que elija
                en Ajustes. Los perfiles anteriores tienen un valor por defecto y no se cuentan.
              </p>
            </div>
          )}
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byCountry} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="country" tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} width={60} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" name="Usuarios" fill="#3B82F6" radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Actividad por hora.
            Antes contaba sólo reseñas, en hora UTC y leídas desde el navegador
            (sin los usuarios privados, cortadas en 1000). Ahora son todos los
            eventos de personas, de la web y la app, agrupados en la base. */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Actividad por hora del día</h2>
          <p className="text-xs text-[#A0A0B0] mb-5">
            Todo lo que hace la gente en la web y en la app (abrirla, ver páginas, calificar, buscar,
            agregar a &quot;Ver después&quot;…), últimos 30 días, hora de Argentina. Sin bots ni los
            eventos técnicos de anuncios.
          </p>
          {contenido && contenido.porHora === null ? (
            <p className="text-[#A0A0B0] text-sm py-6 text-center">
              Falta correr <code className="text-zinc-400">supabase-metricas-2026-10.sql</code> en Supabase.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byHour} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" />
                <XAxis dataKey="hour" tick={{ fill: '#A0A0B0', fontSize: 9 }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={{ fill: '#A0A0B0', fontSize: 9 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="eventos" name="Eventos" fill="#A855F7" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Plataformas favoritas.
            Las que eligen en el onboarding de la web o de la app
            (profiles.favorite_platforms). Antes era el proveedor de los títulos
            marcados con "Me gusta", que guardaba sólo la web y con el nombre
            crudo de TMDB de cualquier país ("Sooner Amazon Channel"). */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Plataformas favoritas</h2>
          <p className="text-xs text-[#A0A0B0] mb-5">
            Las que eligen en el onboarding
            {overview?.plataformasCobertura && (
              <> · {overview.plataformasCobertura.conPlataformas.toLocaleString('es-AR')} de{' '}
                {overview.plataformasCobertura.total.toLocaleString('es-AR')} usuarios eligieron alguna; el % es sobre ellos</>
            )}
          </p>
          <ResponsiveContainer width="100%" height={380}>
            <BarChart data={overview?.plataformasFavoritas ?? []} layout="vertical" margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="provider" tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} width={120} interval={0} />
              <Tooltip
                {...tooltipStyle}
                formatter={(v, _n, item) => [
                  `${Number(v).toLocaleString('es-AR')} (${(item?.payload as { pct?: number } | undefined)?.pct ?? 0}%)`,
                  'Usuarios',
                ]}
              />
              <Bar dataKey="count" name="Usuarios" fill="#FFFD02" radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tables grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Top watchlist */}
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Top 20 — más en &quot;Ver después&quot;</h2>
            <div className="space-y-2.5">
              {topWatchlist.map((item, i) => (
                <Link
                  key={`${item.media_id}-${item.media_type}-wl`}
                  href={`/${item.media_type === 'tv' ? 'series' : 'movie'}/${item.media_id}`}
                  className="flex items-center gap-3 hover:bg-[#1C1C27] -mx-2 px-2 py-1.5 rounded-xl transition-colors"
                >
                  <span className="text-xs text-zinc-600 w-5 text-right shrink-0 font-bold">{i + 1}</span>
                  {item.poster_path
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={getPosterUrl(item.poster_path, 'w92')} alt={item.title} className="w-8 h-12 object-cover rounded shrink-0" />
                    : <div className="w-8 h-12 bg-[#1C1C27] rounded shrink-0 flex items-center justify-center">
                        {item.media_type === 'tv' ? <Tv size={10} className="text-zinc-600" /> : <Film size={10} className="text-zinc-600" />}
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate font-medium">{item.title}</p>
                    <p className="text-[10px] text-[#A0A0B0]">{item.media_type === 'tv' ? 'Serie' : 'Película'}</p>
                  </div>
                  <span className="text-xs font-bold text-blue-400 shrink-0">{item.count}×</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Top rated */}
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Top 20 — más calificadas</h2>
            <div className="space-y-2.5">
              {topRated.map((item, i) => (
                <Link
                  key={`${item.media_id}-${item.media_type}-r`}
                  href={`/${item.media_type === 'tv' ? 'series' : 'movie'}/${item.media_id}`}
                  className="flex items-center gap-3 hover:bg-[#1C1C27] -mx-2 px-2 py-1.5 rounded-xl transition-colors"
                >
                  <span className="text-xs text-zinc-600 w-5 text-right shrink-0 font-bold">{i + 1}</span>
                  {item.poster_path
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={getPosterUrl(item.poster_path, 'w92')} alt={item.title} className="w-8 h-12 object-cover rounded shrink-0" />
                    : <div className="w-8 h-12 bg-[#1C1C27] rounded shrink-0 flex items-center justify-center">
                        {item.media_type === 'tv' ? <Tv size={10} className="text-zinc-600" /> : <Film size={10} className="text-zinc-600" />}
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white truncate font-medium">{item.title}</p>
                    <p className="text-[10px] text-[#A0A0B0]">{item.media_type === 'tv' ? 'Serie' : 'Película'}</p>
                  </div>
                  <span className="text-xs font-bold text-amber-400 shrink-0">{item.count}★</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Top usuarios */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Top 20 — usuarios más activos</h2>
          <p className="text-xs text-[#A0A0B0] mb-4">Todo lo que guardó cada uno, desde siempre, en la web y en la app</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2A2A3A]">
                  <th className="text-left pb-3 text-xs text-[#A0A0B0] font-medium w-8">#</th>
                  <th className="text-left pb-3 text-xs text-[#A0A0B0] font-medium">Usuario</th>
                  <th className="text-center pb-3 text-xs text-[#A0A0B0] font-medium">Calificaciones</th>
                  <th className="text-center pb-3 text-xs text-[#A0A0B0] font-medium">Ver después</th>
                  <th className="text-center pb-3 text-xs text-[#A0A0B0] font-medium">Favoritos</th>
                  <th className="text-center pb-3 text-xs text-[#A0A0B0] font-medium">Reseñas</th>
                  <th className="text-center pb-3 text-xs text-[#A0A0B0] font-medium">Listas</th>
                  <th className="text-center pb-3 text-xs text-[#A0A0B0] font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A3A]">
                {topUsers.map((u, i) => (
                  <tr key={u.id} className="hover:bg-[#1C1C27] transition-colors">
                    <td className="py-3 text-xs text-zinc-600 font-bold">{i + 1}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-[#1C1C27] shrink-0">
                          {u.avatar_url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-[#FFFD02]">
                                {(u.username ?? '?')[0]?.toUpperCase()}
                              </div>
                          }
                        </div>
                        <Link href={`/usuario/${u.username}`} target="_blank" className="text-xs font-medium text-white hover:text-[#FFFD02] transition-colors">
                          @{u.username ?? '—'}
                        </Link>
                      </div>
                    </td>
                    <td className="py-3 text-center text-xs font-semibold text-amber-400">{u.calificaciones}</td>
                    <td className="py-3 text-center text-xs font-semibold text-sky-400">{u.verDespues}</td>
                    <td className="py-3 text-center text-xs font-semibold text-red-400">{u.favoritos}</td>
                    <td className="py-3 text-center text-xs font-semibold text-purple-400">{u.resenas}</td>
                    <td className="py-3 text-center text-xs font-semibold text-blue-400">{u.listas}</td>
                    <td className="py-3 text-center text-xs font-bold text-[#FFFD02]">{u.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
