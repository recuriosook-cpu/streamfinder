'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { getPosterUrl } from '@/lib/tmdb'
import {
  Users, FileText, Eye, Bookmark, TrendingUp,
  Star, Trash2, Film, Tv, Loader2, BarChart2, Shield, AlertCircle, Globe,
} from 'lucide-react'
import { COUNTRIES } from '@/lib/countries'

const ADMIN_EMAIL = 'hola@ferlage.com.ar'

const GENRE_NAMES: Record<number, string> = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familiar',
  14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia ficción',
  53: 'Thriller', 10752: 'Bélica', 37: 'Western',
  10759: 'Acción y aventura', 10762: 'Infantil', 10765: 'Sci-Fi y fantasía',
}

interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  points: number | null
  level: number | null
  updated_at: string
  country: string | null
}

interface TopMedia {
  media_id: number
  media_type: string
  title: string
  poster_path: string | null
  count: number
}

interface RecentReview {
  id: string
  user_id: string
  media_type: string
  title: string
  rating: number | null
  body: string | null
  created_at: string
  username: string | null
  avatar_url: string | null
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color = 'emerald' }: {
  icon: React.ReactNode; label: string; value: number; color?: string
}) {
  const styles: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10',
    blue:    'text-blue-400 bg-blue-500/10',
    purple:  'text-purple-400 bg-purple-500/10',
    amber:   'text-amber-400 bg-amber-500/10',
  }
  const [fg, bg] = (styles[color] ?? styles.emerald).split(' ')
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center mb-3 ${fg}`}>{icon}</div>
      <p className="text-2xl font-bold text-white">{value.toLocaleString('es-AR')}</p>
      <p className="text-sm text-zinc-400 mt-0.5">{label}</p>
    </div>
  )
}

function BarList({ items, color = 'bg-emerald-500' }: {
  items: { label: string; count: number }[]
  color?: string
}) {
  if (!items.length) return <p className="text-zinc-500 text-sm">Sin datos</p>
  const max = items[0].count
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 w-4 text-right shrink-0">{i + 1}</span>
          <div className="flex-1">
            <div className="flex justify-between mb-0.5">
              <span className="text-xs text-white truncate">{item.label}</span>
              <span className="text-xs text-zinc-500 shrink-0 ml-2">{item.count}</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full">
              <div className={`h-full ${color} rounded-full`} style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CountryDemographics({ profiles }: { profiles: Profile[] }) {
  const countMap: Record<string, number> = {}
  let noData = 0
  for (const p of profiles) {
    if (p.country) {
      countMap[p.country] = (countMap[p.country] ?? 0) + 1
    } else {
      noData++
    }
  }
  const sorted = Object.entries(countMap)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({
      code,
      count,
      name: COUNTRIES.find(c => c.code === code)?.name ?? code,
    }))

  if (sorted.length === 0 && noData === 0) return null

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <Globe size={16} className="text-blue-400" />
        Demografía por país
      </h2>
      <div className="space-y-2">
        {sorted.map(item => (
          <div key={item.code} className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://flagcdn.com/w20/${item.code.toLowerCase()}.png`}
              alt={item.name}
              width={20}
              height={15}
              className="rounded-sm shrink-0"
            />
            <span className="text-sm text-white flex-1 truncate">{item.name}</span>
            <span className="text-sm font-semibold text-zinc-300 shrink-0">{item.count}</span>
          </div>
        ))}
        {noData > 0 && (
          <div className="flex items-center gap-3 pt-1 border-t border-zinc-800 mt-1">
            <div className="w-5 h-[15px] bg-zinc-700 rounded-sm shrink-0" />
            <span className="text-sm text-zinc-500 flex-1">Sin datos</span>
            <span className="text-sm font-semibold text-zinc-500 shrink-0">{noData}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function RegistrationsChart({ data }: { data: { day: string; count: number }[] }) {
  if (!data.length || data.every(d => d.count === 0))
    return <p className="text-zinc-500 text-sm text-center py-8">Sin registros en los últimos 30 días</p>
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div className="flex items-end gap-[3px] h-32 w-full">
      {data.map(d => {
        const pct   = Math.round((d.count / max) * 100)
        const label = new Date(d.day + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
        return (
          <div key={d.day} className="flex flex-col items-center flex-1 min-w-0 h-full justify-end" title={`${label}: ${d.count}`}>
            {d.count > 0 && <span className="text-[8px] text-zinc-600 mb-0.5">{d.count}</span>}
            <div
              className="w-full bg-emerald-500 rounded-t-sm"
              style={{ height: `${Math.max(pct, d.count > 0 ? 4 : 0)}%` }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router   = useRouter()
  const supabase = useRef(createClient()).current

  const [checking,  setChecking]  = useState(true)
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'content' | 'reviews' | 'users'>('overview')
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [profiles,      setProfiles]      = useState<Profile[]>([])
  const [newUsersWeek,  setNewUsersWeek]  = useState(0)
  const [regsByDay,     setRegsByDay]     = useState<{ day: string; count: number }[]>([])

  const [totalReviews,   setTotalReviews]   = useState(0)
  const [totalWatched,   setTotalWatched]   = useState(0)
  const [totalWatchlist, setTotalWatchlist] = useState(0)

  const [topFavs,    setTopFavs]    = useState<TopMedia[]>([])
  const [topWatched, setTopWatched] = useState<TopMedia[]>([])
  const [reviews,    setReviews]    = useState<RecentReview[]>([])

  const [topProviders, setTopProviders] = useState<{ label: string; count: number }[]>([])
  const [topGenres,    setTopGenres]    = useState<{ label: string; count: number }[]>([])

  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email !== ADMIN_EMAIL) { router.replace('/'); return }
      setChecking(false)
      fetchAll()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchAll() {
    setLoading(true)
    setFetchError(null)

    const weekAgo  = new Date(Date.now() -  7 * 86400000).toISOString()
    const monthAgo = new Date(Date.now() - 30 * 86400000)

    const [
      profilesRes,
      totalReviewsRes, totalWatchedRes, totalWatchlistRes,
      favsRawRes, watchedRawRes,
      reviewsRawRes,
      providersRawRes, genresRawRes,
    ] = await Promise.all([
      supabase.from('profiles').select('*').order('updated_at', { ascending: false }),
      supabase.from('reviews').select('*', { count: 'exact', head: true }),
      supabase.from('watched').select('*', { count: 'exact', head: true }),
      supabase.from('watchlist').select('*', { count: 'exact', head: true }),
      supabase.from('favorites').select('media_id, media_type, title, poster_path').limit(5000),
      supabase.from('watched').select('media_id, media_type, title, poster_path').limit(5000),
      supabase.from('reviews').select('id, user_id, media_type, title, rating, body, created_at').order('created_at', { ascending: false }).limit(20),
      supabase.from('favorites').select('provider_name').not('provider_name', 'is', null).limit(5000),
      supabase.from('favorites').select('genre_ids').not('genre_ids', 'is', null).limit(5000),
    ])

    if (profilesRes.error) {
      setFetchError(profilesRes.error.message)
      setLoading(false)
      return
    }

    const allProfiles = (profilesRes.data ?? []) as Profile[]
    setProfiles(allProfiles)

    // New users this week
    setNewUsersWeek(allProfiles.filter(p => p.updated_at >= weekAgo).length)

    // Registrations chart — last 30 days
    const regMap: Record<string, number> = {}
    for (const p of allProfiles) {
      const d = new Date(p.updated_at)
      if (d > monthAgo) {
        const key = d.toISOString().slice(0, 10)
        regMap[key] = (regMap[key] ?? 0) + 1
      }
    }
    const days: { day: string; count: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d   = new Date(Date.now() - i * 86400000)
      const key = d.toISOString().slice(0, 10)
      days.push({ day: key, count: regMap[key] ?? 0 })
    }
    setRegsByDay(days)

    // Counts
    setTotalReviews(totalReviewsRes.count   ?? 0)
    setTotalWatched(totalWatchedRes.count   ?? 0)
    setTotalWatchlist(totalWatchlistRes.count ?? 0)

    // Top favorites
    const favCount: Record<string, TopMedia> = {}
    for (const row of favsRawRes.data ?? []) {
      const key = `${row.media_id}-${row.media_type}`
      if (!favCount[key]) favCount[key] = { media_id: row.media_id, media_type: row.media_type, title: row.title, poster_path: row.poster_path, count: 0 }
      favCount[key].count++
    }
    setTopFavs(Object.values(favCount).sort((a, b) => b.count - a.count).slice(0, 10))

    // Top watched
    const watchCount: Record<string, TopMedia> = {}
    for (const row of watchedRawRes.data ?? []) {
      const key = `${row.media_id}-${row.media_type}`
      if (!watchCount[key]) watchCount[key] = { media_id: row.media_id, media_type: row.media_type, title: row.title, poster_path: row.poster_path, count: 0 }
      watchCount[key].count++
    }
    setTopWatched(Object.values(watchCount).sort((a, b) => b.count - a.count).slice(0, 10))

    // Reviews + author profiles
    const reviewRows = reviewsRawRes.data ?? []
    const userIds    = [...new Set(reviewRows.map(r => r.user_id))]
    let profileMap: Record<string, { username: string | null; avatar_url: string | null }> = {}
    if (userIds.length) {
      const { data: pData } = await supabase.from('profiles').select('id, username, avatar_url').in('id', userIds)
      profileMap = Object.fromEntries((pData ?? []).map(p => [p.id, p]))
    }
    setReviews(reviewRows.map(r => ({
      ...r,
      username:   profileMap[r.user_id]?.username   ?? null,
      avatar_url: profileMap[r.user_id]?.avatar_url ?? null,
    })))

    // Providers
    const provCount: Record<string, number> = {}
    for (const row of (providersRawRes.data ?? []) as { provider_name: string | null }[]) {
      if (row.provider_name) provCount[row.provider_name] = (provCount[row.provider_name] ?? 0) + 1
    }
    setTopProviders(
      Object.entries(provCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count }))
    )

    // Genres
    const genreCount: Record<number, number> = {}
    for (const row of (genresRawRes.data ?? []) as { genre_ids: number[] | null }[]) {
      for (const id of row.genre_ids ?? []) genreCount[id] = (genreCount[id] ?? 0) + 1
    }
    setTopGenres(
      Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([id, count]) => ({ label: GENRE_NAMES[Number(id)] ?? `Género ${id}`, count }))
    )

    setLoading(false)
  }

  async function deleteReview(id: string) {
    if (!confirm('¿Eliminar esta reseña?')) return
    setDeletingId(id)
    await supabase.from('reviews').delete().eq('id', id)
    setReviews(prev => prev.filter(r => r.id !== id))
    setDeletingId(null)
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-emerald-400" />
      </div>
    )
  }

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
              <p className="text-xs text-zinc-500">Glynbox</p>
            </div>
          </div>
          {loading && <Loader2 size={18} className="animate-spin text-zinc-500" />}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">

        {/* Error global */}
        {fetchError && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl px-5 py-4 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">Error al cargar datos</p>
              <p className="text-xs text-red-400 mt-0.5">{fetchError}</p>
            </div>
          </div>
        )}

        {/* ── USUARIOS TOTALES — hero ─────────────────────────── */}
        <div className="bg-gradient-to-r from-emerald-950/60 to-zinc-900 border border-emerald-800/40 rounded-2xl px-8 py-6 flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Users size={28} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-5xl font-black text-white">{profiles.length.toLocaleString('es-AR')}</p>
            <p className="text-emerald-400 font-semibold text-lg mt-0.5">usuarios registrados</p>
            <p className="text-zinc-500 text-sm mt-1">
              {newUsersWeek > 0 ? `+${newUsersWeek} nuevos esta semana` : 'Sin registros esta semana'}
            </p>
          </div>
          <div className="ml-auto hidden sm:block text-right">
            <p className="text-3xl font-bold text-white">{newUsersWeek}</p>
            <p className="text-xs text-zinc-500 mt-0.5">esta semana</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
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
                activeTab === key ? 'bg-emerald-500 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard icon={<TrendingUp size={18} />} label="Nuevos esta semana"      value={newUsersWeek}   color="emerald" />
              <StatCard icon={<FileText size={18} />}   label="Reseñas escritas"        value={totalReviews}   color="purple" />
              <StatCard icon={<Eye size={18} />}         label="Películas/series vistas" value={totalWatched}   color="amber" />
              <StatCard icon={<Bookmark size={18} />}    label="En lista para ver"       value={totalWatchlist} color="blue" />
            </div>

            {/* Registrations chart */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart2 size={16} className="text-emerald-400" />
                Actividad de perfiles por día — últimos 30 días
              </h2>
              <RegistrationsChart data={regsByDay} />
              {regsByDay.length > 0 && (
                <div className="flex justify-between mt-2">
                  <span className="text-[10px] text-zinc-600">
                    {new Date(regsByDay[0].day + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="text-[10px] text-zinc-600">Hoy</span>
                </div>
              )}
            </div>

            {/* Usage stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Plataformas más populares</h2>
                <BarList items={topProviders} color="bg-emerald-500" />
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-4">Géneros más guardados</h2>
                <BarList items={topGenres} color="bg-purple-500" />
              </div>
            </div>

            {/* Country demographics */}
            <CountryDemographics profiles={profiles} />
          </div>
        )}

        {/* ── CONTENT ──────────────────────────────────────────── */}
        {activeTab === 'content' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Star size={15} className="text-amber-400" /> Top 10 más guardados como favorito
              </h2>
              {topFavs.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">Sin datos</p>
              ) : (
                <div className="space-y-2.5">
                  {topFavs.map((item, i) => (
                    <div key={`${item.media_id}-f`} className="flex items-center gap-3">
                      <span className="text-sm font-bold text-zinc-600 w-5 text-right shrink-0">{i + 1}</span>
                      {item.poster_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={getPosterUrl(item.poster_path, 'w92')} alt={item.title} className="w-8 h-12 object-cover rounded shrink-0" />
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

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Eye size={15} className="text-emerald-400" /> Top 10 más marcados como vistos
              </h2>
              {topWatched.length === 0 ? (
                <p className="text-zinc-500 text-sm text-center py-8">Sin datos</p>
              ) : (
                <div className="space-y-2.5">
                  {topWatched.map((item, i) => (
                    <div key={`${item.media_id}-w`} className="flex items-center gap-3">
                      <span className="text-sm font-bold text-zinc-600 w-5 text-right shrink-0">{i + 1}</span>
                      {item.poster_path ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={getPosterUrl(item.poster_path, 'w92')} alt={item.title} className="w-8 h-12 object-cover rounded shrink-0" />
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

        {/* ── REVIEWS ──────────────────────────────────────────── */}
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
                    <div className="w-9 h-9 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                      {r.avatar_url
                        ? <img src={r.avatar_url} alt={r.username ?? ''} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-500">{(r.username ?? '?')[0].toUpperCase()}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-white">@{r.username ?? 'usuario'}</span>
                        <span className="text-xs text-zinc-500">sobre</span>
                        <span className="text-sm text-emerald-400 font-medium truncate max-w-[180px]">{r.title}</span>
                        {r.rating != null && (
                          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-medium">⭐ {r.rating}/5</span>
                        )}
                        <span className="text-xs text-zinc-600 ml-auto shrink-0">
                          {new Date(r.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      {r.body && <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed">{r.body}</p>}
                    </div>
                    <button
                      onClick={() => deleteReview(r.id)}
                      disabled={deletingId === r.id}
                      className="shrink-0 text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40 self-center"
                      title="Eliminar reseña"
                    >
                      {deletingId === r.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── USERS ────────────────────────────────────────────── */}
        {activeTab === 'users' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Últimos 20 usuarios</h2>
              <span className="text-xs text-zinc-500">Total: {profiles.length}</span>
            </div>
            {profiles.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-12">Sin usuarios registrados todavía</p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {profiles.slice(0, 20).map(u => (
                  <div key={u.id} className="px-5 py-4 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt={u.display_name ?? u.username ?? ''} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-500">{(u.display_name ?? u.username ?? '?')[0].toUpperCase()}</div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-white">
                          {u.display_name ?? u.username ?? 'Sin nombre'}
                        </p>
                        {u.level != null && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                            Nv. {u.level}
                          </span>
                        )}
                      </div>
                      {u.username && (
                        <p className="text-xs text-zinc-500 mt-0.5">@{u.username}</p>
                      )}
                      {u.bio && (
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{u.bio}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5">
                        {u.points != null && (
                          <span className="text-xs text-amber-400">{u.points} pts</span>
                        )}
                        <span className="text-xs text-zinc-600">
                          {new Date(u.updated_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
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
