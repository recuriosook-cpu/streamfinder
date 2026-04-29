'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Heart, LogOut, LogIn, Menu, X, UserCircle, ChevronDown, Compass, Users, Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useCountry } from '@/context/CountryContext'
import { COUNTRIES } from '@/lib/countries'
import type { User } from '@supabase/supabase-js'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

interface SearchResult {
  movies: Array<{ id: number; title: string; poster_path: string | null; release_date?: string }>
  tv:     Array<{ id: number; name:  string; poster_path: string | null; first_air_date?: string }>
  people: Array<{ id: number; name:  string; profile_path: string | null; known_for_department: string | null }>
  users:  Array<{ id: string; username: string | null; display_name: string | null; avatar_url: string | null }>
}

function FlagCircle({ code, size = 28 }: { code: string; size?: number }) {
  return (
    <span
      className="rounded-full overflow-hidden bg-zinc-700 shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <Image
        src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`}
        alt={code}
        width={40}
        height={30}
        className="w-full h-full object-cover"
        unoptimized
      />
    </span>
  )
}

interface NotifItem {
  id: string
  type: 'follow' | 'review_like' | 'review_comment' | 'comment_reply' | 'mention' | 'level_up'
  read: boolean
  created_at: string
  actor_id: string
  review_id: string | null
  review_title: string | null
  // Populated from the reviews table for review_like / review_comment / comment_reply
  media_id?: number
  media_type?: string
  actor: { username: string | null; display_name: string | null; avatar_url: string | null } | null
}

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [countryOpen, setCountryOpen] = useState(false)
  const [countrySearch, setCountrySearch] = useState('')
  const [notifOpen,    setNotifOpen]    = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifError,   setNotifError]   = useState<string | null>(null)
  const [notifs,       setNotifs]       = useState<NotifItem[]>([])
  const [unreadCount,  setUnreadCount]  = useState(0)
  const countryRef = useRef<HTMLDivElement>(null)
  const countrySearchRef = useRef<HTMLInputElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = useRef(createClient()).current
  const { country, countryData, setCountry } = useCountry()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) fetchUnreadCount(data.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchUnreadCount(session.user.id)
      else { setUnreadCount(0); setNotifs([]) }
    })
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchUnreadCount(uid: string) {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('read', false)
    if (error) console.error('[notifications] unread count error:', error.message)
    setUnreadCount(count ?? 0)
  }

  async function openNotifications() {
    if (!user) return
    setNotifOpen(true)
    setNotifLoading(true)
    setNotifError(null)
    setNotifs([])
    const { data: rows, error } = await supabase
      .from('notifications')
      .select('id, type, read, created_at, actor_id, review_id, review_title')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(15)
    if (error) {
      console.error('[notifications] fetch error:', error.message)
      setNotifError(error.message)
      setNotifLoading(false)
      return
    }
    if (!rows?.length) { setNotifLoading(false); return }
    const actorIds = [...new Set(rows.map(r => r.actor_id))]
    const { data: actors } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', actorIds)
    const actorMap = Object.fromEntries((actors ?? []).map(a => [a.id, a]))

    // Fetch media_id / media_type for review_like / review_comment / comment_reply / mention
    const reviewIds = rows
      .filter(r => r.review_id && ['review_like', 'review_comment', 'comment_reply', 'mention'].includes(r.type))
      .map(r => r.review_id as string)
    let reviewMediaMap: Record<string, { media_id: number; media_type: string }> = {}
    if (reviewIds.length > 0) {
      const { data: reviewRows } = await supabase
        .from('reviews')
        .select('id, media_id, media_type')
        .in('id', reviewIds)
      reviewMediaMap = Object.fromEntries(
        (reviewRows ?? []).map(rv => [rv.id, { media_id: rv.media_id, media_type: rv.media_type }])
      )
    }

    setNotifs(rows.map(r => ({
      ...r,
      actor: actorMap[r.actor_id] ?? null,
      ...(r.review_id ? reviewMediaMap[r.review_id] ?? {} : {}),
    })) as NotifItem[])
    setNotifLoading(false)
    const unreadIds = rows.filter(r => !r.read).map(r => r.id)
    if (unreadIds.length > 0) {
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
      setUnreadCount(0)
    }
  }

  function handleNotifClick(n: NotifItem) {
    setNotifOpen(false)
    // Mark individual notification as read (fire-and-forget)
    if (!n.read) {
      supabase.from('notifications').update({ read: true }).eq('id', n.id)
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    // Navigate to the relevant page
    if (n.type === 'follow' && n.actor?.username) {
      router.push(`/usuario/${n.actor.username}`)
    } else if (n.type === 'level_up' && user) {
      router.push('/profile')
    } else if (['review_like', 'review_comment', 'comment_reply', 'mention'].includes(n.type) && n.media_id && n.media_type) {
      router.push(`/${n.media_type}/${n.media_id}`)
    }
  }

  // Close notification dropdown when clicking outside
  useEffect(() => {
    if (!notifOpen) return
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [notifOpen])

  // Close country dropdown when clicking outside
  useEffect(() => {
    if (!countryOpen) return
    const handler = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setCountryOpen(false)
        setCountrySearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [countryOpen])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (countryOpen) {
      setTimeout(() => countrySearchRef.current?.focus(), 50)
    }
  }, [countryOpen])

  // Close search dropdown when clicking outside
  useEffect(() => {
    if (!searchOpen) return
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [searchOpen])

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults(null); setSearchOpen(false); return }
    setSearchLoading(true)
    const base = 'https://api.themoviedb.org/3'
    const params = `api_key=${TMDB_KEY}&language=es-AR&query=${encodeURIComponent(q)}&page=1`
    try {
      const [moviesRes, tvRes, peopleRes, usersRes] = await Promise.all([
        fetch(`${base}/search/movie?${params}`).then(r => r.ok ? r.json() : { results: [] }),
        fetch(`${base}/search/tv?${params}`).then(r => r.ok ? r.json() : { results: [] }),
        fetch(`${base}/search/person?${params}`).then(r => r.ok ? r.json() : { results: [] }),
        supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .or(`username.ilike.%${q.trim()}%,display_name.ilike.%${q.trim()}%`)
          .limit(3),
      ])
      setSearchResults({
        movies: (moviesRes.results ?? []).slice(0, 5),
        tv:     (tvRes.results     ?? []).slice(0, 5),
        people: (peopleRes.results ?? []).slice(0, 5),
        users:  (usersRes.data     ?? []),
      })
      setSearchOpen(true)
    } catch {
      setSearchResults(null)
    } finally {
      setSearchLoading(false)
    }
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!val.trim()) { setSearchResults(null); setSearchOpen(false); return }
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300)
  }

  const closeSearch = () => { setSearchOpen(false); setSearchResults(null) }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
      setQuery('')
      closeSearch()
      setMenuOpen(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const handleSelectCountry = (code: string) => {
    setCountry(code)
    setCountryOpen(false)
    setCountrySearch('')
  }

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase())
  )

  return (
    <nav className="bg-[#13131A] border-b border-[#2A2A3A] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
        <Link href="/" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Glynbox"
            style={{ height: '24px', width: 'auto', objectFit: 'contain' }}
            className="sm:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Glynbox"
            style={{ height: '32px', width: 'auto', objectFit: 'contain' }}
            className="hidden sm:block"
          />
        </Link>

        {/* Search box + live dropdown */}
        <div className="flex-1 min-w-0 relative" ref={searchRef}>
          <form onSubmit={handleSearch} className="flex items-center bg-[#1C1C27] rounded-lg px-2.5 sm:px-3 py-2 gap-2">
            <Search size={15} className="text-[#A0A0B0] shrink-0" />
            <input
              value={query}
              onChange={handleQueryChange}
              onFocus={() => { if (searchResults) setSearchOpen(true) }}
              placeholder="Buscar..."
              className="bg-transparent text-sm outline-none text-white placeholder-zinc-500 flex-1 min-w-0"
            />
            {searchLoading && (
              <div className="w-3.5 h-3.5 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin shrink-0" />
            )}
          </form>

          {/* Dropdown */}
          {searchOpen && searchResults && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-[#13131A] border border-[#2A2A3A] rounded-xl shadow-2xl z-50 overflow-hidden max-h-[70vh] overflow-y-auto">

              {/* ── Users ───────────────────────────────────── */}
              {searchResults.users.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-[#A0A0B0] uppercase tracking-wider">Usuarios</p>
                  {searchResults.users.map(u => (
                    <Link
                      key={u.id}
                      href={`/usuario/${u.username}`}
                      onClick={closeSearch}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#1C1C27] transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                        {u.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={u.avatar_url}
                            alt={u.display_name ?? u.username ?? ''}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[#A0A0B0]">
                            {(u.display_name ?? u.username ?? '?')[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{u.display_name ?? u.username}</p>
                        {u.username && <p className="text-xs text-[#A0A0B0] truncate">@{u.username}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* ── People ──────────────────────────────────── */}
              {searchResults.people.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-[#A0A0B0] uppercase tracking-wider">Personas</p>
                  {searchResults.people.map(p => (
                    <Link
                      key={p.id}
                      href={`/actor/${p.id}`}
                      onClick={closeSearch}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#1C1C27] transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                        {p.profile_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`https://image.tmdb.org/t/p/w45${p.profile_path}`}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[#A0A0B0]">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{p.name}</p>
                        {p.known_for_department && (
                          <p className="text-xs text-[#A0A0B0] truncate">{p.known_for_department}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* ── Movies ──────────────────────────────────── */}
              {searchResults.movies.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-[#A0A0B0] uppercase tracking-wider">Películas</p>
                  {searchResults.movies.map(m => (
                    <Link
                      key={m.id}
                      href={`/movie/${m.id}`}
                      onClick={closeSearch}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#1C1C27] transition-colors"
                    >
                      <div className="w-9 h-[54px] rounded overflow-hidden bg-zinc-700 shrink-0">
                        {m.poster_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`https://image.tmdb.org/t/p/w45${m.poster_path}`}
                            alt={m.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <Search size={12} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{m.title}</p>
                        {m.release_date && (
                          <p className="text-xs text-[#A0A0B0]">{m.release_date.slice(0, 4)}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* ── TV ──────────────────────────────────────── */}
              {searchResults.tv.length > 0 && (
                <div>
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold text-[#A0A0B0] uppercase tracking-wider">Series</p>
                  {searchResults.tv.map(t => (
                    <Link
                      key={t.id}
                      href={`/tv/${t.id}`}
                      onClick={closeSearch}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#1C1C27] transition-colors"
                    >
                      <div className="w-9 h-[54px] rounded overflow-hidden bg-zinc-700 shrink-0">
                        {t.poster_path ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`https://image.tmdb.org/t/p/w45${t.poster_path}`}
                            alt={t.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <Search size={12} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{t.name}</p>
                        {t.first_air_date && (
                          <p className="text-xs text-[#A0A0B0]">{t.first_air_date.slice(0, 4)}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* No results */}
              {searchResults.movies.length === 0 && searchResults.tv.length === 0 && searchResults.people.length === 0 && searchResults.users.length === 0 && (
                <p className="text-[#A0A0B0] text-sm text-center py-6">Sin resultados</p>
              )}

              {/* Ver todos los resultados */}
              <div className="border-t border-[#2A2A3A]/50 px-4 py-2.5">
                <button
                  onClick={() => {
                    router.push(`/search?q=${encodeURIComponent(query.trim())}`)
                    closeSearch()
                  }}
                  className="text-xs text-[#FFFD02] hover:text-[#FFF84D] transition-colors w-full text-center"
                >
                  Ver todos los resultados →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Country selector */}
        <div className="relative shrink-0" ref={countryRef}>
          <button
            onClick={() => setCountryOpen(v => !v)}
            className="flex items-center gap-1.5 bg-[#1C1C27] hover:bg-zinc-700 text-zinc-300 hover:text-white px-2.5 py-2 rounded-lg transition-colors"
            title={`País: ${countryData.name}`}
          >
            <FlagCircle code={country} />
            <ChevronDown size={12} className={`transition-transform ${countryOpen ? 'rotate-180' : ''}`} />
          </button>

          {countryOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-[#1C1C27] border border-[#2A2A3A] rounded-xl shadow-2xl overflow-hidden z-50">
              {/* Search */}
              <div className="p-2 border-b border-[#2A2A3A]">
                <input
                  ref={countrySearchRef}
                  value={countrySearch}
                  onChange={e => setCountrySearch(e.target.value)}
                  placeholder="Buscar país..."
                  className="w-full bg-zinc-700 text-white text-sm rounded-lg px-3 py-1.5 outline-none placeholder-zinc-500 focus:ring-1 focus:ring-[#FFFD02]"
                />
              </div>
              {/* List */}
              <div className="overflow-y-auto max-h-64">
                {filteredCountries.length === 0 ? (
                  <p className="text-[#A0A0B0] text-sm text-center py-4">Sin resultados</p>
                ) : (
                  filteredCountries.map(c => (
                    <button
                      key={c.code}
                      onClick={() => handleSelectCountry(c.code)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                        c.code === country
                          ? 'bg-[#FFFD02]/20 text-[#FFF84D]'
                          : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
                      }`}
                    >
                      <FlagCircle code={c.code} size={26} />
                      <span className="flex-1">{c.name}</span>
                      {c.code === country && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FFFD02] shrink-0" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/que-ver" className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors">
            <Compass size={16} />
            Qué ver
          </Link>
          <Link href="/listas" className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors">
            Listas
          </Link>
          {user ? (
            <>
              <Link href="/comunidad" className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors">
                <Users size={16} />
                Comunidad
              </Link>
              <Link href="/favorites" className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors">
                <Heart size={16} />
                Favoritos
              </Link>
              <Link href="/profile" className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors">
                <UserCircle size={16} />
                Mi perfil
              </Link>

              {/* Notification bell */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={notifOpen ? () => setNotifOpen(false) : openNotifications}
                  className="relative flex items-center text-zinc-300 hover:text-white transition-colors p-1"
                  title="Notificaciones"
                >
                  <Bell size={18} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-[#FFFD02] text-black text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-[#1C1C27] border border-[#2A2A3A] rounded-xl shadow-2xl overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-[#2A2A3A] flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">Notificaciones</p>
                      <button onClick={() => setNotifOpen(false)} className="text-[#A0A0B0] hover:text-white transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="overflow-y-auto max-h-80">
                      {notifLoading ? (
                        <div className="flex justify-center py-8">
                          <div className="w-5 h-5 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : notifError ? (
                        <div className="px-4 py-6 text-center">
                          <p className="text-[#FFFD02] text-xs font-medium mb-1">Error al cargar notificaciones</p>
                          <p className="text-zinc-600 text-[11px] font-mono break-all">{notifError}</p>
                        </div>
                      ) : notifs.length === 0 ? (
                        <p className="text-[#A0A0B0] text-sm text-center py-8">Sin notificaciones.</p>
                      ) : (
                        notifs.map(n => {
                          const actor    = n.actor?.display_name ?? n.actor?.username ?? 'Alguien'
                          const time     = new Date(n.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
                          const initials = (n.actor?.display_name ?? n.actor?.username ?? '?')[0]?.toUpperCase()
                          return (
                            <button
                              key={n.id}
                              onClick={() => handleNotifClick(n)}
                              className={`w-full flex items-start gap-3 px-4 py-3 border-b border-[#2A2A3A]/50 last:border-0 text-left transition-colors hover:bg-zinc-700/50 ${!n.read ? 'bg-zinc-700/30' : ''}`}
                            >
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 shrink-0 mt-0.5">
                                {n.actor?.avatar_url ? (
                                  <img src={n.actor.avatar_url} alt={actor} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#A0A0B0]">
                                    {initials}
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-zinc-200 leading-snug">
                                  {n.type === 'follow' && (
                                    <><span className="font-semibold text-white">{actor}</span> te empezó a seguir</>
                                  )}
                                  {n.type === 'review_like' && (
                                    <><span className="font-semibold text-white">{actor}</span> le dio me gusta a tu reseña de <span className="text-[#FFFD02]">{n.review_title}</span></>
                                  )}
                                  {n.type === 'review_comment' && (
                                    <><span className="font-semibold text-white">{actor}</span> comentó tu reseña de <span className="text-[#FFFD02]">{n.review_title}</span></>
                                  )}
                                  {n.type === 'comment_reply' && (
                                    <><span className="font-semibold text-white">{actor}</span> respondió tu comentario en <span className="text-[#FFFD02]">{n.review_title}</span></>
                                  )}
                                  {n.type === 'mention' && (
                                    <><span className="font-semibold text-white">{actor}</span> te mencionó en su reseña de <span className="text-[#FFFD02]">{n.review_title}</span></>
                                  )}
                                  {n.type === 'level_up' && (
                                    <>🎉 ¡Subiste de nivel! Ahora sos <span className="text-[#FFFD02]">{n.review_title}</span></>
                                  )}
                                </p>
                                <p className="text-[11px] text-zinc-600 mt-0.5">{time}</p>
                              </div>
                              {!n.read && (
                                <span className="w-2 h-2 rounded-full bg-[#FFFD02] shrink-0 mt-1.5" />
                              )}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors">
                <LogOut size={16} />
                Salir
              </button>
            </>
          ) : (
            <Link href="/auth" className="flex items-center gap-1.5 text-sm bg-[#FFFD02] hover:bg-[#E5EB00] text-black px-3 py-1.5 rounded-lg transition-colors">
              <LogIn size={16} />
              Iniciar sesión
            </Link>
          )}
        </div>

        <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-[#13131A] border-t border-[#2A2A3A] px-4 py-3 flex flex-col gap-3">
          <Link href="/que-ver" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-zinc-300">
            <Compass size={16} /> Qué ver
          </Link>
          {user ? (
            <>
              <Link href="/comunidad" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-zinc-300">
                <Users size={16} /> Comunidad
              </Link>
              <Link href="/favorites" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-zinc-300">
                <Heart size={16} /> Favoritos
              </Link>
              <Link href="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-zinc-300">
                <UserCircle size={16} /> Mi perfil
              </Link>
              <button
                onClick={() => { setMenuOpen(false); openNotifications() }}
                className="flex items-center gap-2 text-sm text-zinc-300 text-left"
              >
                <span className="relative">
                  <Bell size={16} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#FFFD02] text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </span>
                Notificaciones {unreadCount > 0 && <span className="text-[#FFFD02]">({unreadCount})</span>}
              </button>
              <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-zinc-300 text-left">
                <LogOut size={16} /> Salir
              </button>
            </>
          ) : (
            <Link href="/auth" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-[#FFFD02]">
              <LogIn size={16} /> Iniciar sesión
            </Link>
          )}
        </div>
      )}
    </nav>
  )
}
