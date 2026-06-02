'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getPosterUrl } from '@/lib/tmdb'
import { Film, Tv, Loader2 } from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, CartesianGrid, LineChart, Line,
} from 'recharts'
import { COUNTRIES } from '@/lib/countries'

interface TopMedia {
  media_id: number; media_type: string; title: string; poster_path: string | null; count: number
}

interface TopUser {
  id: string; username: string | null; avatar_url: string | null; review_count: number; list_count: number; total: number
}

export default function MetricasPage() {
  const supabase = useRef(createClient()).current
  const [loading, setLoading] = useState(true)

  const [regsByMonth,   setRegsByMonth]   = useState<{ label: string; count: number }[]>([])
  const [byCountry,     setByCountry]     = useState<{ country: string; count: number }[]>([])
  const [byHour,        setByHour]        = useState<{ hour: string; count: number }[]>([])
  const [byProvider,    setByProvider]    = useState<{ provider: string; count: number }[]>([])
  const [topWatchlist,  setTopWatchlist]  = useState<TopMedia[]>([])
  const [topRated,      setTopRated]      = useState<TopMedia[]>([])
  const [topUsers,      setTopUsers]      = useState<TopUser[]>([])

  useEffect(() => { fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    setLoading(true)

    const [
      profilesRes,
      reviewsRes,
      listsCountRes,
      watchlistRes,
      ratingsRes,
      favoritesRes,
    ] = await Promise.all([
      supabase.from('profiles').select('id, username, avatar_url, updated_at, country').limit(5000),
      supabase.from('reviews').select('user_id, created_at').limit(10000),
      supabase.from('lists').select('user_id').limit(10000),
      supabase.from('watchlist').select('media_id, media_type, title, poster_path').limit(10000),
      supabase.from('ratings').select('media_id, media_type, title, poster_path, rated_at').limit(10000),
      supabase.from('favorites').select('provider_name').not('provider_name', 'is', null).limit(10000),
    ])

    const profiles = (profilesRes.data ?? []) as { id: string; username: string | null; avatar_url: string | null; updated_at: string; country: string | null }[]

    // Registros por mes — últimos 12 meses
    const monthMap: Record<string, number> = {}
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d   = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthMap[key] = 0
    }
    for (const p of profiles) {
      const d = new Date(p.updated_at)
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (k in monthMap) monthMap[k]++
    }
    setRegsByMonth(
      Object.entries(monthMap).map(([k, count]) => ({
        label: new Date(k + '-01').toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }),
        count,
      }))
    )

    // Usuarios por país
    const countryMap: Record<string, number> = {}
    for (const p of profiles) {
      if (p.country) countryMap[p.country] = (countryMap[p.country] ?? 0) + 1
    }
    setByCountry(
      Object.entries(countryMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([code, count]) => ({
          country: COUNTRIES.find(c => c.code === code)?.name ?? code,
          count,
        }))
    )

    // Actividad por hora del día (reviews)
    const hourMap: Record<number, number> = {}
    for (let h = 0; h < 24; h++) hourMap[h] = 0
    for (const r of (reviewsRes.data ?? []) as { created_at: string }[]) {
      const h = new Date(r.created_at).getUTCHours()
      hourMap[h]++
    }
    setByHour(
      Object.entries(hourMap).map(([h, count]) => ({
        hour: `${String(h).padStart(2, '0')}h`,
        count,
      }))
    )

    // Plataformas favoritas
    const provMap: Record<string, number> = {}
    for (const f of (favoritesRes.data ?? []) as { provider_name: string | null }[]) {
      if (f.provider_name) provMap[f.provider_name] = (provMap[f.provider_name] ?? 0) + 1
    }
    setByProvider(
      Object.entries(provMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([provider, count]) => ({ provider, count }))
    )

    // Top watchlist
    const wlMap: Record<string, TopMedia> = {}
    for (const w of (watchlistRes.data ?? []) as TopMedia[]) {
      const k = `${w.media_id}-${w.media_type}`
      if (!wlMap[k]) wlMap[k] = { ...w, count: 0 }
      wlMap[k].count++
    }
    setTopWatchlist(Object.values(wlMap).sort((a, b) => b.count - a.count).slice(0, 20))

    // Top rated
    type RatingRow = { media_id: number; media_type: string; title: string; poster_path: string | null }
    const ratMap: Record<string, TopMedia> = {}
    for (const r of (ratingsRes.data ?? []) as unknown as RatingRow[]) {
      const k = `${r.media_id}-${r.media_type}`
      if (!ratMap[k]) ratMap[k] = { ...r, count: 0 }
      ratMap[k].count++
    }
    setTopRated(Object.values(ratMap).sort((a, b) => b.count - a.count).slice(0, 20))

    // Top users by reviews + lists
    const revCounts: Record<string, number> = {}
    for (const r of (reviewsRes.data ?? []) as { user_id: string }[]) {
      revCounts[r.user_id] = (revCounts[r.user_id] ?? 0) + 1
    }
    const lstCounts: Record<string, number> = {}
    for (const l of (listsCountRes.data ?? []) as { user_id: string }[]) {
      lstCounts[l.user_id] = (lstCounts[l.user_id] ?? 0) + 1
    }
    const topUsers: TopUser[] = profiles
      .map(p => ({
        id: p.id, username: p.username, avatar_url: p.avatar_url,
        review_count: revCounts[p.id] ?? 0,
        list_count:   lstCounts[p.id] ?? 0,
        total: (revCounts[p.id] ?? 0) + (lstCounts[p.id] ?? 0),
      }))
      .filter(u => u.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 20)
    setTopUsers(topUsers)

    setLoading(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={28} className="animate-spin text-[#FFFD02]" />
    </div>
  )

  const tooltipStyle = {
    contentStyle: { background: '#1C1C27', border: '1px solid #2A2A3A', borderRadius: 8, color: '#fff', fontSize: 12 },
    cursor: { fill: 'rgba(255,253,2,0.04)' },
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-[#13131A] border-b border-[#2A2A3A] px-6 py-5">
        <h1 className="text-xl font-bold text-white">Métricas</h1>
        <p className="text-sm text-[#A0A0B0] mt-0.5">Estadísticas profundas de la plataforma</p>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-6xl">

        {/* Registros por mes */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-5">Registros por mes — últimos 12 meses</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={regsByMonth} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" />
              <XAxis dataKey="label" tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} labelStyle={{ color: '#FFFD02' }} />
              <Line type="monotone" dataKey="count" name="Registros" stroke="#FFFD02" strokeWidth={2} dot={{ fill: '#FFFD02', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Por país */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-5">Usuarios por país (top 15)</h2>
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

        {/* Actividad por hora */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Actividad por hora del día</h2>
          <p className="text-xs text-[#A0A0B0] mb-5">Basado en reseñas publicadas (hora UTC)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={byHour} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" />
              <XAxis dataKey="hour" tick={{ fill: '#A0A0B0', fontSize: 9 }} tickLine={false} axisLine={false} interval={1} />
              <YAxis tick={{ fill: '#A0A0B0', fontSize: 9 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" name="Reseñas" fill="#A855F7" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Plataformas favoritas */}
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white mb-5">Plataformas favoritas (top 10)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={byProvider} layout="vertical" margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="provider" tick={{ fill: '#A0A0B0', fontSize: 10 }} tickLine={false} axisLine={false} width={80} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" name="Usuarios" fill="#FFFD02" radius={[0,3,3,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tables grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Top watchlist */}
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Top 20 — más en watchlist</h2>
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
          <h2 className="text-sm font-semibold text-white mb-4">Top 20 — usuarios más activos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2A2A3A]">
                  <th className="text-left pb-3 text-xs text-[#A0A0B0] font-medium w-8">#</th>
                  <th className="text-left pb-3 text-xs text-[#A0A0B0] font-medium">Usuario</th>
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
                    <td className="py-3 text-center text-xs font-semibold text-purple-400">{u.review_count}</td>
                    <td className="py-3 text-center text-xs font-semibold text-blue-400">{u.list_count}</td>
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
