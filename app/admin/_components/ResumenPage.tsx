'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getPosterUrl } from '@/lib/tmdb'
import type { AdminOverview } from '@/app/api/admin/overview/route'
import {
  Users, FileText, List, Star, Loader2, AlertCircle, Film, Tv,
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

interface TopMedia {
  media_id: number; media_type: string; title: string; poster_path: string | null; count: number
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function ResumenPage() {
  const supabase = useRef(createClient()).current
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const [totalUsers,   setTotalUsers]   = useState(0)
  const [totalReviews, setTotalReviews] = useState(0)
  const [totalLists,   setTotalLists]   = useState(0)

  const [overview,    setOverview]    = useState<AdminOverview | null>(null)
  const [actByDay,    setActByDay]    = useState<{ day: string; label: string; reviews: number; ratings: number; listas: number; total: number }[]>([])
  const [topRated,    setTopRated]    = useState<TopMedia[]>([])
  const [topWatchlist, setTopWatchlist] = useState<TopMedia[]>([])

  useEffect(() => { fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    setLoading(true)
    setError(null)

    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString()

    // Las métricas de usuarios (activos, registros) vienen del endpoint: se
    // calculan con service role sobre auth.users, que es donde está la fecha
    // real de alta. Desde el cliente sólo se puede ver profiles.updated_at.
    const overviewPromise = fetch('/api/admin/overview')
      .then(async r => (r.ok ? ((await r.json()) as AdminOverview) : null))
      .catch(() => null)

    const [
      ov,
      profilesRes,
      reviewsCountRes,
      listsCountRes,
      reviewsWeekRes,
      ratingsWeekRes,
      listsWeekRes,
      topRatedRes,
      topWatchlistRes,
    ] = await Promise.all([
      overviewPromise,
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('reviews').select('*', { count: 'exact', head: true }),
      supabase.from('lists').select('*', { count: 'exact', head: true }),
      // Activity last 7 days
      supabase.from('reviews').select('created_at').gte('created_at', weekAgo),
      supabase.from('ratings').select('rated_at').gte('rated_at', weekAgo),
      supabase.from('lists').select('created_at').gte('created_at', weekAgo),
      // Top rated this week
      supabase.from('ratings').select('media_id, media_type, title, poster_path').gte('rated_at', weekAgo).limit(2000),
      // Top watchlist this week
      supabase.from('watchlist').select('media_id, media_type, title, poster_path').gte('added_at', weekAgo).limit(2000),
    ])

    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }
    if (!ov) setError('No se pudo leer /api/admin/overview — las métricas de usuarios no se muestran.')

    setOverview(ov)
    setTotalUsers(ov?.registrosTotales ?? profilesRes.count ?? 0)
    setTotalReviews(reviewsCountRes.count ?? 0)
    setTotalLists(listsCountRes.count ?? 0)

    // Activity by day (last 7)
    const revMap: Record<string, number>  = {}
    const ratMap: Record<string, number>  = {}
    const lstMap: Record<string, number>  = {}
    for (const r of (reviewsWeekRes.data ?? []) as { created_at: string }[]) {
      const k = r.created_at.slice(0, 10); revMap[k] = (revMap[k] ?? 0) + 1
    }
    for (const r of (ratingsWeekRes.data ?? []) as { rated_at: string }[]) {
      const k = r.rated_at.slice(0, 10); ratMap[k] = (ratMap[k] ?? 0) + 1
    }
    for (const r of (listsWeekRes.data ?? []) as { created_at: string }[]) {
      const k = r.created_at.slice(0, 10); lstMap[k] = (lstMap[k] ?? 0) + 1
    }
    const days7: typeof actByDay = []
    for (let i = 6; i >= 0; i--) {
      const d   = new Date(Date.now() - i * 86400_000)
      const key = d.toISOString().slice(0, 10)
      const lbl = d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })
      const reviews = revMap[key] ?? 0
      const ratings = ratMap[key] ?? 0
      const listas  = lstMap[key] ?? 0
      days7.push({ day: key, label: lbl, reviews, ratings, listas, total: reviews + ratings + listas })
    }
    setActByDay(days7)

    // Top rated this week
    const ratedCount: Record<string, TopMedia> = {}
    for (const r of (topRatedRes.data ?? []) as TopMedia[]) {
      const k = `${r.media_id}-${r.media_type}`
      if (!ratedCount[k]) ratedCount[k] = { ...r, count: 0 }
      ratedCount[k].count++
    }
    setTopRated(Object.values(ratedCount).sort((a, b) => b.count - a.count).slice(0, 5))

    // Top watchlist this week
    const wlCount: Record<string, TopMedia> = {}
    for (const r of (topWatchlistRes.data ?? []) as TopMedia[]) {
      const k = `${r.media_id}-${r.media_type}`
      if (!wlCount[k]) wlCount[k] = { ...r, count: 0 }
      wlCount[k].count++
    }
    setTopWatchlist(Object.values(wlCount).sort((a, b) => b.count - a.count).slice(0, 5))

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#FFFD02]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#13131A] border-b border-[#2A2A3A] px-6 py-5">
        <h1 className="text-xl font-bold text-white">Resumen</h1>
        <p className="text-sm text-[#A0A0B0] mt-0.5">Vista general de Glynbox</p>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-6xl">

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Users size={20} />}
            label="Usuarios registrados"
            value={totalUsers}
            sub="Alta real (auth.users)"
            color="yellow"
          />
          <StatCard
            icon={<Users size={20} />}
            label="Activos esta semana"
            value={overview ? overview.activos7d : '—'}
            sub={overview ? `${overview.activos30d} en 30 días` : undefined}
            color="green"
          />
          <StatCard icon={<FileText size={20} />} label="Reseñas publicadas"   value={totalReviews} color="purple" />
          <StatCard icon={<List size={20} />}     label="Listas creadas"       value={totalLists}   color="blue"   />
        </div>

        {/* last_active recién se empieza a poblar: /api/ping-active venía roto por
            la service role key mal nombrada, así que la columna estuvo en NULL
            para todos los perfiles. Sin este aviso el 0 se lee como "no entra
            nadie" en vez de "todavía no hay datos". */}
        {overview && overview.activos30d === 0 && (
          <div className="bg-amber-900/20 border border-amber-800/60 rounded-xl px-5 py-3 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/90 leading-relaxed">
              <span className="font-semibold">Sin datos de actividad todavía.</span>{' '}
              <code className="text-amber-300">last_active</code> se empezó a registrar recién ahora
              (el endpoint que lo escribía estaba roto). Los números de &quot;activos&quot; se van a
              poblar a medida que los usuarios vuelvan a entrar.
            </p>
          </div>
        )}

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
          <p className="text-xs text-[#A0A0B0] mb-5">Reseñas + calificaciones + listas</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={actByDay} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" />
              <XAxis dataKey="label" tick={{ fill: '#A0A0B0', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1C1C27', border: '1px solid #2A2A3A', borderRadius: 8, color: '#fff', fontSize: 12 }}
                cursor={{ fill: 'rgba(255,253,2,0.05)' }}
              />
              <Bar dataKey="reviews"  name="Reseñas"       fill="#A855F7" radius={[3,3,0,0]} />
              <Bar dataKey="ratings"  name="Calificaciones" fill="#F59E0B" radius={[3,3,0,0]} />
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
              Más agregadas a watchlist esta semana
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
