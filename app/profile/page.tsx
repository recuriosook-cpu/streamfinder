'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Heart, Clock, CheckCircle, Bookmark, Star,
  BarChart2, Pencil, Check, X, Camera, LogIn,
  Film, Tv, Trash2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { getPosterUrl } from '@/lib/tmdb'
import RatingStars from '@/components/RatingStars'
import type { User } from '@supabase/supabase-js'

// TMDB genre ID → Spanish name
const GENRE_MAP: Record<number, string> = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
  14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia ficción',
  53: 'Suspense', 10752: 'Bélica', 37: 'Western',
  10759: 'Acción y aventura', 10762: 'Infantil', 10763: 'Noticias',
  10764: 'Reality', 10765: 'Ciencia ficción y fantasía',
  10766: 'Telenovela', 10768: 'Guerra y política',
}

type Tab = 'favorites' | 'history' | 'watched' | 'watchlist' | 'ratings' | 'stats'

interface Favorite {
  id: string; media_id: number; media_type: 'movie' | 'tv'; title: string
  poster_path: string | null; genre_ids: number[]; runtime: number | null
  seasons_count: number | null; provider_name: string | null
}
interface HistoryEntry {
  id: string; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null; visited_at: string
}
interface MediaEntry {
  id: string; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null
}
interface RatingEntry extends MediaEntry { rating: number }

function Spinner() {
  return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="text-center py-16">
      <Icon size={40} className="mx-auto text-zinc-700 mb-3" />
      <p className="text-zinc-500 text-sm">{text}</p>
    </div>
  )
}

function PosterCard({
  item, onRemove, extra,
}: {
  item: MediaEntry
  onRemove?: () => void
  extra?: React.ReactNode
}) {
  const href = item.media_type === 'movie' ? `/movie/${item.media_id}` : `/tv/${item.media_id}`
  return (
    <div className="relative group">
      <Link href={href} className="block">
        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-1.5">
          {item.poster_path ? (
            <Image
              src={getPosterUrl(item.poster_path)}
              alt={item.title}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center px-2">
              Sin imagen
            </div>
          )}
        </div>
        <p className="text-xs text-zinc-300 line-clamp-2 leading-tight">{item.title}</p>
      </Link>
      {extra}
      {onRemove && (
        <button
          onClick={onRemove}
          title="Quitar"
          className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-all z-10"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<{ username: string | null; avatar_url: string | null } | null>(null)
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [watched, setWatched] = useState<MediaEntry[]>([])
  const [watchlist, setWatchlist] = useState<MediaEntry[]>([])
  const [ratings, setRatings] = useState<RatingEntry[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('favorites')
  const [loading, setLoading] = useState(true)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: { user: u } } = await supabase.auth.getUser()
    if (!u) { setLoading(false); return }
    setUser(u)

    const [
      profileRes, favsRes, histRes, watchedRes, watchlistRes, ratingsRes,
    ] = await Promise.all([
      supabase.from('profiles').select('username,avatar_url').eq('id', u.id).maybeSingle(),
      supabase.from('favorites').select('*').eq('user_id', u.id).order('created_at', { ascending: false }),
      supabase.from('watch_history').select('*').eq('user_id', u.id).order('visited_at', { ascending: false }).limit(100),
      supabase.from('watched').select('*').eq('user_id', u.id).order('watched_at', { ascending: false }),
      supabase.from('watchlist').select('*').eq('user_id', u.id).order('added_at', { ascending: false }),
      supabase.from('ratings').select('*').eq('user_id', u.id).order('rated_at', { ascending: false }),
    ])

    setProfile(profileRes.data ?? { username: null, avatar_url: null })
    setFavorites(favsRes.data ?? [])
    setHistory(histRes.data ?? [])
    setWatched(watchedRes.data ?? [])
    setWatchlist(watchlistRes.data ?? [])
    setRatings(ratingsRes.data ?? [])
    setLoading(false)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !e.target.files?.[0]) return
    const file = e.target.files[0]
    if (file.size > 2 * 1024 * 1024) { alert('La imagen debe pesar menos de 2 MB'); return }
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').upsert({ id: user.id, avatar_url: urlData.publicUrl })
      setProfile(prev => ({ ...(prev ?? { username: null }), avatar_url: urlData.publicUrl }))
    }
    setUploadingAvatar(false)
  }

  async function saveUsername() {
    if (!user || !usernameInput.trim()) return
    await supabase.from('profiles').upsert({ id: user.id, username: usernameInput.trim() })
    setProfile(prev => ({ ...(prev ?? { avatar_url: null }), username: usernameInput.trim() }))
    setEditingUsername(false)
  }

  async function removeItem(table: string, id: string) {
    await supabase.from(table).delete().eq('id', id)
    const setters: Record<string, (fn: (prev: MediaEntry[]) => MediaEntry[]) => void> = {
      favorites: setFavorites as never,
      watched: setWatched,
      watchlist: setWatchlist,
    }
    setters[table]?.(prev => prev.filter(x => x.id !== id))
    if (table === 'ratings') setRatings(prev => prev.filter(x => x.id !== id))
  }

  // Deduplicate history: one entry per (media_id, media_type), most recent first
  const deduplicatedHistory = useMemo(() => {
    const seen = new Set<string>()
    return history.filter(item => {
      const key = `${item.media_type}-${item.media_id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 50)
  }, [history])

  // Stats
  const stats = useMemo(() => {
    const moviesCount = favorites.filter(f => f.media_type === 'movie').length
    const tvCount = favorites.filter(f => f.media_type === 'tv').length

    const genreCount: Record<number, number> = {}
    for (const fav of favorites) {
      for (const gid of (fav.genre_ids ?? [])) {
        genreCount[gid] = (genreCount[gid] ?? 0) + 1
      }
    }
    const topGenreEntry = Object.entries(genreCount).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
    const topGenre = topGenreEntry ? GENRE_MAP[Number(topGenreEntry[0])] ?? `Género ${topGenreEntry[0]}` : null

    const platformCount: Record<string, number> = {}
    for (const fav of favorites) {
      if (fav.provider_name) platformCount[fav.provider_name] = (platformCount[fav.provider_name] ?? 0) + 1
    }
    const topPlatform = Object.entries(platformCount).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? null

    const movieMinutes = favorites.filter(f => f.media_type === 'movie')
      .reduce((sum, f) => sum + (f.runtime ?? 120), 0)
    const tvMinutes = favorites.filter(f => f.media_type === 'tv')
      .reduce((sum, f) => sum + ((f.seasons_count ?? 1) * 10 * 45), 0)
    const totalHours = Math.round((movieMinutes + tvMinutes) / 60)

    return { moviesCount, tvCount, topGenre, topPlatform, totalHours }
  }, [favorites])

  if (loading) return <Spinner />

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <LogIn size={40} className="text-zinc-600" />
        <p className="text-zinc-400">Iniciá sesión para ver tu perfil</p>
        <Link href="/auth" className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg font-medium transition-colors">
          Iniciar sesión
        </Link>
      </div>
    )
  }

  const avatarSrc = profile?.avatar_url
  const displayName = profile?.username ?? user.email?.split('@')[0] ?? 'Usuario'

  const TABS: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'favorites', label: 'Favoritos', icon: Heart, count: favorites.length },
    { id: 'history', label: 'Historial', icon: Clock, count: deduplicatedHistory.length },
    { id: 'watched', label: 'Ya lo vi', icon: CheckCircle, count: watched.length },
    { id: 'watchlist', label: 'Para ver', icon: Bookmark, count: watchlist.length },
    { id: 'ratings', label: 'Mi ranking', icon: Star, count: ratings.length },
    { id: 'stats', label: 'Estadísticas', icon: BarChart2 },
  ]

  return (
    <div className="min-h-screen">
      {/* ── Profile header ──────────────────────────────── */}
      <div className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-700 ring-4 ring-zinc-600">
              {avatarSrc ? (
                <Image src={avatarSrc} alt={displayName} width={96} height={96} className="w-full h-full object-cover" unoptimized />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-zinc-400">
                  {displayName[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute bottom-0 right-0 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full p-1.5 shadow-lg transition-colors"
              title="Cambiar foto"
            >
              {uploadingAvatar
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Camera size={14} />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>

          {/* Name + email */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
              {editingUsername ? (
                <div className="flex items-center gap-2">
                  <input
                    value={usernameInput}
                    onChange={e => setUsernameInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveUsername(); if (e.key === 'Escape') setEditingUsername(false) }}
                    className="bg-zinc-800 border border-zinc-600 rounded px-3 py-1 text-white text-lg font-bold outline-none focus:border-emerald-400"
                    autoFocus
                    placeholder="Tu nombre de usuario"
                  />
                  <button onClick={saveUsername} className="text-emerald-400 hover:text-emerald-300"><Check size={18} /></button>
                  <button onClick={() => setEditingUsername(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-white">{displayName}</h1>
                  <button
                    onClick={() => { setUsernameInput(profile?.username ?? ''); setEditingUsername(true) }}
                    className="text-zinc-500 hover:text-white transition-colors"
                    title="Editar nombre"
                  >
                    <Pencil size={14} />
                  </button>
                </>
              )}
            </div>
            <p className="text-zinc-500 text-sm">{user.email}</p>

            {/* Mini stats */}
            <div className="flex flex-wrap justify-center sm:justify-start gap-4 mt-4">
              {[
                { label: 'Favoritos', value: favorites.length },
                { label: 'Visto', value: watched.length },
                { label: 'Para ver', value: watchlist.length },
                { label: 'Calificados', value: ratings.length },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-zinc-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────── */}
      <div className="bg-zinc-900/50 border-b border-zinc-800 sticky top-[57px] z-30">
        <div className="max-w-5xl mx-auto px-4 flex overflow-x-auto no-scrollbar">
          {TABS.map(tab => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? 'border-emerald-400 text-emerald-400'
                    : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                <Icon size={15} />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-emerald-400/20 text-emerald-300' : 'bg-zinc-700 text-zinc-400'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* FAVORITOS */}
        {activeTab === 'favorites' && (
          favorites.length === 0
            ? <EmptyState icon={Heart} text="Todavía no tenés favoritos. Explorá películas y series para agregar." />
            : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {favorites.map(fav => (
                  <PosterCard key={fav.id} item={fav} onRemove={() => removeItem('favorites', fav.id)} />
                ))}
              </div>
            )
        )}

        {/* HISTORIAL */}
        {activeTab === 'history' && (
          deduplicatedHistory.length === 0
            ? <EmptyState icon={Clock} text="Tu historial aparecerá acá a medida que explores películas y series." />
            : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {deduplicatedHistory.map(item => (
                  <div key={item.id} className="group">
                    <Link href={item.media_type === 'movie' ? `/movie/${item.media_id}` : `/tv/${item.media_id}`}>
                      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-1.5">
                        {item.poster_path ? (
                          <Image src={getPosterUrl(item.poster_path)} alt={item.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="(max-width: 640px) 33vw, 16vw" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center px-2">Sin imagen</div>
                        )}
                      </div>
                      <p className="text-xs text-zinc-300 line-clamp-1 leading-tight">{item.title}</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        {new Date(item.visited_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                      </p>
                    </Link>
                  </div>
                ))}
              </div>
            )
        )}

        {/* YA LO VI */}
        {activeTab === 'watched' && (
          watched.length === 0
            ? <EmptyState icon={CheckCircle} text='Marcá películas y series como vistas con el botón "Marcar como visto".' />
            : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {watched.map(item => (
                  <PosterCard key={item.id} item={item} onRemove={() => removeItem('watched', item.id)} />
                ))}
              </div>
            )
        )}

        {/* PARA VER DESPUÉS */}
        {activeTab === 'watchlist' && (
          watchlist.length === 0
            ? <EmptyState icon={Bookmark} text='Guardá contenido para ver después con el botón "Ver después".' />
            : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {watchlist.map(item => (
                  <PosterCard key={item.id} item={item} onRemove={() => removeItem('watchlist', item.id)} />
                ))}
              </div>
            )
        )}

        {/* MI RANKING */}
        {activeTab === 'ratings' && (
          ratings.length === 0
            ? <EmptyState icon={Star} text="Calificá películas y series con estrellas para verlas acá." />
            : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {ratings.map(item => (
                  <div key={item.id} className="group">
                    <Link href={item.media_type === 'movie' ? `/movie/${item.media_id}` : `/tv/${item.media_id}`}>
                      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 mb-2">
                        {item.poster_path ? (
                          <Image src={getPosterUrl(item.poster_path)} alt={item.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="(max-width: 640px) 50vw, 20vw" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center px-2">Sin imagen</div>
                        )}
                      </div>
                      <p className="text-xs text-zinc-300 line-clamp-2 mb-1.5">{item.title}</p>
                    </Link>
                    <RatingStars
                      mediaId={item.media_id}
                      mediaType={item.media_type}
                      title={item.title}
                      posterPath={item.poster_path}
                      initialRating={item.rating}
                      onChange={newRating => {
                        if (newRating === 0) setRatings(prev => prev.filter(r => r.id !== item.id))
                        else setRatings(prev => prev.map(r => r.id === item.id ? { ...r, rating: newRating } : r))
                      }}
                    />
                  </div>
                ))}
              </div>
            )
        )}

        {/* ESTADÍSTICAS */}
        {activeTab === 'stats' && (
          favorites.length === 0
            ? <EmptyState icon={BarChart2} text="Agregá favoritos para ver tus estadísticas." />
            : (
              <div className="space-y-8">
                {/* Primary stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { icon: Film, label: 'Películas en favoritos', value: stats.moviesCount, color: 'text-blue-400' },
                    { icon: Tv, label: 'Series en favoritos', value: stats.tvCount, color: 'text-purple-400' },
                    { icon: Clock, label: 'Horas estimadas', value: `~${stats.totalHours}h`, color: 'text-emerald-400' },
                    { icon: Star, label: 'Calificaciones', value: ratings.length, color: 'text-yellow-400' },
                  ].map(s => (
                    <div key={s.label} className="bg-zinc-800/60 rounded-xl p-4 border border-zinc-700/50">
                      <s.icon size={20} className={`${s.color} mb-2`} />
                      <p className="text-2xl font-bold text-white">{s.value}</p>
                      <p className="text-xs text-zinc-500 mt-0.5 leading-tight">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Insights */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="bg-zinc-800/60 rounded-xl p-5 border border-zinc-700/50">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Género más guardado</p>
                    <p className="text-xl font-bold text-white">{stats.topGenre ?? '—'}</p>
                  </div>
                  <div className="bg-zinc-800/60 rounded-xl p-5 border border-zinc-700/50">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Plataforma más frecuente</p>
                    <p className="text-xl font-bold text-white">{stats.topPlatform ?? '—'}</p>
                    {!stats.topPlatform && (
                      <p className="text-xs text-zinc-600 mt-1">Abrí películas y agregá a favoritos desde una plataforma para ver esto.</p>
                    )}
                  </div>
                </div>

                {/* Hours breakdown */}
                <div className="bg-zinc-800/60 rounded-xl p-5 border border-zinc-700/50">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-4">Estimación de horas de contenido</p>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-zinc-300 flex items-center gap-2"><Film size={14} /> Películas ({stats.moviesCount} × ~2h)</span>
                      <span className="text-sm font-medium text-blue-400">~{Math.round(stats.moviesCount * 2)}h</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-zinc-300 flex items-center gap-2"><Tv size={14} /> Series ({stats.tvCount} × ~10 eps × 45 min/temporada)</span>
                      <span className="text-sm font-medium text-purple-400">~{Math.round(favorites.filter(f => f.media_type === 'tv').reduce((s, f) => s + (f.seasons_count ?? 1) * 10 * 45, 0) / 60)}h</span>
                    </div>
                    <div className="border-t border-zinc-700 pt-3 flex justify-between items-center">
                      <span className="text-sm font-semibold text-white">Total estimado</span>
                      <span className="text-lg font-bold text-emerald-400">~{stats.totalHours}h</span>
                    </div>
                  </div>
                </div>
              </div>
            )
        )}
      </div>
    </div>
  )
}
