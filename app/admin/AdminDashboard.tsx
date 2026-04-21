'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getPosterUrl } from '@/lib/tmdb'
import {
  Users, FileText, Eye, Bookmark, TrendingUp,
  Star, Trash2, Film, Tv, Loader2, BarChart2, Shield,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

interface Stats {
  totalUsers:     number
  newUsersWeek:   number
  totalReviews:   number
  totalWatched:   number
  totalWatchlist: number
}

interface DayCount { day: string; count: number }

interface TopMedia {
  media_id:    number
  media_type:  string
  title:       string
  poster_path: string | null
  count:       number
}

interface RecentReview {
  id:          string
  user_id:     string
  media_type:  string
  title:       string
  rating:      number | null
  body:        string | null
  created_at:  string
  username:    string | null
  avatar_url:  string | null
}

interface RecentUser {
  id:           string
  username:     string | null
  display_name: string | null
  avatar_url:   string | null
  created_at:   string
}

interface UsageStats {
  topProviders: { name: string; count: number }[]
  topGenres:    { id: number; count: number }[]
}

const ADMIN_EMAIL = 'hola@ferlage.com.ar'

// ── Genre name map (TMDB IDs) ──────────────────────────────────────────────
const GENRE_NAMES: Record<number, string> = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familiar',
  14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia ficción',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'Bélica', 37: 'Western',
  10759: 'Acción y aventura', 10762: 'Infantil', 10763: 'Noticias',
  10764: 'Reality', 10765: 'Sci-Fi y fantasía', 10766: 'Telenovela',
  10767: 'Talk show', 10768: 'Guerra y política',
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, color = 'emerald',
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  sub?: string
  color?: string
}) {
  const accent = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    blue:    'text-blue-400 bg-blue-500/10',
    purple:  'text-purple-400 bg-purple-500/10',
    amber:   'text-amber-400 bg-amber-500/10',
    red:     'text-red-400 bg-red-500/10',
  }[color] ?? 'text-emerald-400 bg-emerald-500/10'
  const [iconColor, iconBg] = accent.split(' ')
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center mb-3 ${iconColor}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-white">{typeof value === 'number' ? value.toLocaleString('es-AR') : value}</p>
      <p className="text-sm text-zinc-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-zinc-600 mt-1">{sub}</p>}
    </div>
  )
}

// ── Bar chart ──────────────────────────────────────────────────────────────

function RegistrationsChart({ data }: { data: DayCount[] }) {
  if (!data.length) return <p className="text-zinc-500 text-sm text-center py-8">Sin datos</p>
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="flex items-end gap-1 h-32 w-full overflow-x-auto pb-1">
      {data.map(d => {
        const pct = Math.round((d.count / max) * 100)
        const label = new Date(d.day + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
        return (
          <div key={d.day} className="flex flex-col items-center gap-1 flex-1 min-w-[20px]" title={`${label}: ${d.count}`}>
            <span className="text-[9px] text-zinc-600 font-medium">{d.count > 0 ? d.count : ''}</span>
            <div className="w-full bg-zinc-800 rounded-t-sm relative" style={{ height: '80px' }}>
              <div
                className="absolute bottom-0 w-full bg-emerald-500 rounded-t-sm transition-all"
                style={{ height: `${pct}%`, minHeight: pct > 0 ? '2px' : '0' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router  = useRouter()
  const supabase = useRef(createClient()).current

  const [checking,     setChecking]     = useState(true)
  const [loading,      setLoading]      = useState(false)
  const [stats,        setStats]        = useState<Stats | null>(null)
  const [regsByDay,    setRegsByDay]    = useState<DayCount[]>([])
  const [topFavs,      setTopFavs]      = useState<TopMedia[]>([])
  const [topWatched,   setTopWatched]   = useState<TopMedia[]>([])
  const [reviews,      setReviews]      = useState<RecentReview[]>([])
  const [recentUsers,  setRecentUsers]  = useState<RecentUser[]>([])
  const [usageStats,   setUsageStats]   = useState<UsageStats>({ topProviders: [], topGenres: [] })
  const [activeTab,    setActiveTab]    = useState<'overview'|'reviews'|'users'|'content'>('overview')
  const [deletingId,   setDeletingId]   = useState<string | null>(null)

  // ── Auth check ─────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email
      if (email !== ADMIN_EMAIL) {
        router.replace('/')
      } else {
        setChecking(false)
        fetchAll()
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Data fetching ───────────────────────────────────────────────
  async function fetchAll() {
    setLoading(true)
    const weekAgo     = new Date(Date.now() - 7  * 86400000).toISOString()
    const thirtyAgo   = new Date(Date.now() - 30 * 86400000).toISOString()

    const [
      totalUsersRes, newUsersRes, totalReviewsRes,
      totalWatchedRes, totalWatchlistRes,
      regRawRes, favsRawRes, watchedRawRes,
      reviewsRawRes, recentUsersRes,
      providersRawRes, genresRawRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('reviews').select('*', { count: 'exact', head: true }),
      supabase.from('watched').select('*', { count: 'exact', head: true }),
      supabase.from('watchlist').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('created_at').gte('created_at', thirtyAgo).order('created_at'),
      supabase.from('favorites').select('media_id, media_type, title, poster_path').limit(5000),
      supabase.from('watched').select('media_id, media_type, title, poster_path').limit(5000),
      supabase.from('reviews').select('id, user_id, media_type, title, rating, body, created_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('profiles').select('id, username, display_name, avatar_url, created_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('favorites').select('provider_name').not('provider_name', 'is', null).limit(5000),
      supabase.from('favorites').select('genre_ids').not('genre_ids', 'is', null).limit(5000),
    ])

    // Stats cards
    setStats({
      totalUsers:     totalUsersRes.count   ?? 0,
      newUsersWeek:   newUsersRes.count     ?? 0,
      totalReviews:   totalReviewsRes.count ?? 0,
      totalWatched:   totalWatchedRes.count ?? 0,
      totalWatchlist: totalWatchlistRes.count ?? 0,
    })

    // Registrations by day — fill in all 30 days including zeros
    const regMap: Record<string, number> = {}
    for (const row of regRawRes.data ?? []) {
      const day = row.created_at.slice(0, 10)
      regMap[day] = (regMap[day] ?? 0) + 1
    }
    const days: DayCount[] = []
    for (let i = 29; i >= 0; i--) {
      const d   = new Date(Date.now() - i * 86400000)
      const key = d.toISOString().slice(0, 10)
      days.push({ day: key, count: regMap[key] ?? 0 })
    }
    setRegsByDay(days)

    // Top favorites
    const favCount: Record<string, { media_id: number; media_type: string; title: string; poster_path: string | null; count: number }> = {}
    for (const row of favsRawRes.data ?? []) {
      const key = `${row.media_id}-${row.media_type}`
      if (!favCount[key]) favCount[key] = { media_id: row.media_id, media_type: row.media_type, title: row.title, poster_path: row.poster_path, count: 0 }
      favCount[key].count++
    }
    setTopFavs(Object.values(favCount).sort((a, b) => b.count - a.count).slice(0, 10))

    // Top watched
    const watchCount: Record<string, { media_id: number; media_type: string; title: string; poster_path: string | null; count: number }> = {}
    for (const row of watchedRawRes.data ?? []) {
      const key = `${row.media_id}-${row.media_type}`
      if (!watchCount[key]) watchCount[key] = { media_id: row.media_id, media_type: row.media_type, title: row.title, poster_path: row.poster_path, count: 0 }
      watchCount[key].count++
    }
    setTopWatched(Object.values(watchCount).sort((a, b) => b.count - a.count).slice(0, 10))

    // Latest reviews — enrich with author profile
    const reviewRows = reviewsRawRes.data ?? []
    const userIds = [...new Set(reviewRows.map(r => r.user_id))]
    let profileMap: Record<string, { username: string | null; avatar_url: string | null }> = {}
    if (userIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds)
      profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
    }
    setReviews(reviewRows.map(r => ({
      ...r,
      username:   profileMap[r.user_id]?.username   ?? null,
      avatar_url: profileMap[r.user_id]?.avatar_url ?? null,
    })))

    // Recent users
    setRecentUsers(recentUsersRes.data ?? [])

    // Usage: top providers
    const provCount: Record<string, number> = {}
    for (const row of (providersRawRes.data ?? []) as { provider_name: string | null }[]) {
      if (row.provider_name) provCount[row.provider_name] = (provCount[row.provider_name] ?? 0) + 1
    }
    const topProviders = Object.entries(provCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }))

    // Usage: top genres (from favorites.genre_ids array)
    const genreCount: Record<number, number> = {}
    for (const row of (genresRawRes.data ?? []) as { genre_ids: number[] | null }[]) {
      for (const id of row.genre_ids ?? []) {
        genreCount[id] = (genreCount[id] ?? 0) + 1
      }
    }
    const topGenres = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ id: Number(id), count }))

    setUsageStats({ topProviders, topGenres })
    setLoading(false)
  }

  async function deleteReview(id: string) {
    if (!confirm('¿Eliminar esta reseña?')) return
    setDeletingId(id)
    await supabase.from('reviews').delete().eq('id', id)
    setReviews(prev => prev.filter(r => r.id !== id))
    setDeletingId(null)
  }

  // ── Loading / auth states ───────────────────────────────────────
  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-emerald-400" />
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 pb-20">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Shield size={16} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Panel de Administración</h1>
              <p className="text-xs text-zinc-500">Glynbox / StreamFinder</p>
            </div>
          </div>
          {loading && <Loader2 size={18} className="animate-spin text-zinc-500" />}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-6 w-fit">
          {([
            ['overview', 'Resumen'],
            ['content',  'Contenido'],
            ['reviews',  'Reseñas'],
            ['users',    'Usuarios'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'bg-emerald-500 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ─────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard icon={<Users size={18} />}    label="Usuarios totales"    value={stats?.totalUsers ?? '—'}     color="emerald" />
              <StatCard icon={<TrendingUp size={18}/>} label="Nuevos esta semana"  value={stats?.newUsersWeek ?? '—'}   color="blue" />
              <StatCard icon={<FileText size={18} />}  label="Reseñas escritas"    value={stats?.totalReviews ?? '—'}   color="purple" />
              <StatCard icon={<Eye size={18} />}       label="Vistas marcadas"     value={stats?.totalWatched ?? '—'}   color="amber" />
              <StatCard icon={<Bookmark size={18} />}  label="En listas 'Ver después'" value={stats?.totalWatchlist ?? '—'} color="red" />
            </div>

            {/* Registrations chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart2 size={16} className="text-emerald-400" />
                Registros por día — últimos 30 días
              </h2>
              <RegistrationsChart data={regsByDay} />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-zinc-600">
                  {regsByDay[0]?.day ? new Date(regsByDay[0].day + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : ''}
                </span>
                <span className="text-[10px] text-zinc-600">Hoy</span>
              </div>
            </div>

            {/* Usage stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Plataformas más populares</h2>
                {usageStats.topProviders.length === 0 ? (
                  <p className="text-zinc-500 text-sm">Sin datos</p>
                ) : (
                  <div className="space-y-2">
                    {usageStats.topProviders.map((p, i) => {
                      const max = usageStats.topProviders[0].count
                      return (
                        <div key={p.name} className="flex items-center gap-3">
                          <span className="text-xs text-zinc-500 w-4 text-right">{i + 1}</span>
                          <div className="flex-1">
                            <div className="flex justify-between mb-0.5">
                              <span className="text-xs text-white">{p.name}</span>
                              <span className="text-xs text-zinc-500">{p.count}</span>
                            </div>
                            <div className="h-1.5 bg-zinc-800 rounded-full">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(p.count / max) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Géneros más guardados en favoritos</h2>
                {usageStats.topGenres.length === 0 ? (
                  <p className="text-zinc-500 text-sm">Sin datos</p>
                ) : (
                  <div className="space-y-2">
                    {usageStats.topGenres.map((g, i) => {
                      const max = usageStats.topGenres[0].count
                      return (
                        <div key={g.id} className="flex items-center gap-3">
                          <span className="text-xs text-zinc-500 w-4 text-right">{i + 1}</span>
                          <div className="flex-1">
                            <div className="flex justify-between mb-0.5">
                              <span className="text-xs text-white">{GENRE_NAMES[g.id] ?? `Género ${g.id}`}</span>
                              <span className="text-xs text-zinc-500">{g.count}</span>
                            </div>
                            <div className="h-1.5 bg-zinc-800 rounded-full">
                              <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(g.count / max) * 100}%` }} />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── CONTENT TAB ──────────────────────────────────────── */}
        {activeTab === 'content' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top favorites */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Star size={15} className="text-amber-400" />
                Top 10 más guardados como favorito
              </h2>
              {topFavs.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">Sin datos</p>
              ) : (
                <div className="space-y-2">
                  {topFavs.map((item, i) => (
                    <div key={`${item.media_id}-${item.media_type}`} className="flex items-center gap-3">
                      <span className="text-sm font-bold text-zinc-600 w-5 text-right shrink-0">{i + 1}</span>
                      {item.poster_path ? (
                        <img
                          src={getPosterUrl(item.poster_path, 'w92')}
                          alt={item.title}
                          className="w-8 h-12 object-cover rounded shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-12 bg-zinc-800 rounded shrink-0 flex items-center justify-center">
                          {item.media_type === 'tv' ? <Tv size={12} className="text-zinc-600" /> : <Film size={12} className="text-zinc-600" />}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{item.title}</p>
                        <p className="text-xs text-zinc-500">{item.media_type === 'tv' ? 'Serie' : 'Película'}</p>
                      </div>
                      <span className="text-sm font-semibold text-amber-400 shrink-0">{item.count}×</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top watched */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Eye size={15} className="text-emerald-400" />
                Top 10 más marcados como vistos
              </h2>
              {topWatched.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">Sin datos</p>
              ) : (
                <div className="space-y-2">
                  {topWatched.map((item, i) => (
                    <div key={`${item.media_id}-${item.media_type}`} className="flex items-center gap-3">
                      <span className="text-sm font-bold text-zinc-600 w-5 text-right shrink-0">{i + 1}</span>
                      {item.poster_path ? (
                        <img
                          src={getPosterUrl(item.poster_path, 'w92')}
                          alt={item.title}
                          className="w-8 h-12 object-cover rounded shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-12 bg-zinc-800 rounded shrink-0 flex items-center justify-center">
                          {item.media_type === 'tv' ? <Tv size={12} className="text-zinc-600" /> : <Film size={12} className="text-zinc-600" />}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{item.title}</p>
                        <p className="text-xs text-zinc-500">{item.media_type === 'tv' ? 'Serie' : 'Película'}</p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-400 shrink-0">{item.count}×</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── REVIEWS TAB ──────────────────────────────────────── */}
        {activeTab === 'reviews' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-white">Últimas 20 reseñas</h2>
            </div>
            {reviews.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-12">Sin reseñas</p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {reviews.map(r => (
                  <div key={r.id} className="px-5 py-4 flex gap-4">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt={r.username ?? ''} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-500">
                          {(r.username ?? '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white">@{r.username ?? 'usuario'}</span>
                        <span className="text-xs text-zinc-500">sobre</span>
                        <span className="text-sm text-emerald-400 font-medium truncate max-w-[180px]">{r.title}</span>
                        {r.rating != null && (
                          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                            ⭐ {r.rating}/5
                          </span>
                        )}
                        <span className="text-xs text-zinc-600 ml-auto shrink-0">
                          {new Date(r.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      {r.body && (
                        <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed">{r.body}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteReview(r.id)}
                      disabled={deletingId === r.id}
                      className="shrink-0 text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40 self-center"
                      title="Eliminar reseña"
                    >
                      {deletingId === r.id
                        ? <Loader2 size={15} className="animate-spin" />
                        : <Trash2 size={15} />
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── USERS TAB ────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-white">Últimos 20 usuarios registrados</h2>
            </div>
            {recentUsers.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-12">Sin usuarios</p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {recentUsers.map(u => (
                  <div key={u.id} className="px-5 py-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.display_name ?? u.username ?? ''} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-500">
                          {(u.display_name ?? u.username ?? '?')[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {u.display_name ?? u.username ?? 'Sin nombre'}
                      </p>
                      <p className="text-xs text-zinc-500">@{u.username ?? '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-zinc-500">
                        {new Date(u.created_at).toLocaleDateString('es-AR', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
