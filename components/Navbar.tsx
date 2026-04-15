'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { Search, Heart, LogOut, LogIn, Menu, X, UserCircle, ChevronDown, Compass, Users, Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useCountry } from '@/context/CountryContext'
import { COUNTRIES } from '@/lib/countries'
import type { User } from '@supabase/supabase-js'

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
  type: 'follow' | 'review_like'
  read: boolean
  created_at: string
  actor_id: string
  review_id: string | null
  review_title: string | null
  // Populated from the reviews table for review_like notifications
  media_id?: number
  media_type?: string
  actor: { username: string | null; display_name: string | null; avatar_url: string | null } | null
}

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [query, setQuery] = useState('')
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

    // Fetch media_id / media_type for review_like notifications so we can navigate
    const reviewIds = rows
      .filter(r => r.type === 'review_like' && r.review_id)
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
    } else if (n.type === 'review_like' && n.media_id && n.media_type) {
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
      setQuery('')
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
    <nav className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-xl font-bold text-emerald-400 shrink-0">
          StreamFinder
        </Link>

        <form onSubmit={handleSearch} className="flex-1 flex items-center bg-zinc-800 rounded-lg px-3 py-2 gap-2">
          <Search size={16} className="text-zinc-400 shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar películas y series..."
            className="bg-transparent text-sm outline-none text-white placeholder-zinc-500 flex-1 min-w-0"
          />
        </form>

        {/* Country selector */}
        <div className="relative shrink-0" ref={countryRef}>
          <button
            onClick={() => setCountryOpen(v => !v)}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-2.5 py-2 rounded-lg transition-colors"
            title={`País: ${countryData.name}`}
          >
            <FlagCircle code={country} />
            <ChevronDown size={12} className={`transition-transform ${countryOpen ? 'rotate-180' : ''}`} />
          </button>

          {countryOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-50">
              {/* Search */}
              <div className="p-2 border-b border-zinc-700">
                <input
                  ref={countrySearchRef}
                  value={countrySearch}
                  onChange={e => setCountrySearch(e.target.value)}
                  placeholder="Buscar país..."
                  className="w-full bg-zinc-700 text-white text-sm rounded-lg px-3 py-1.5 outline-none placeholder-zinc-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              {/* List */}
              <div className="overflow-y-auto max-h-64">
                {filteredCountries.length === 0 ? (
                  <p className="text-zinc-500 text-sm text-center py-4">Sin resultados</p>
                ) : (
                  filteredCountries.map(c => (
                    <button
                      key={c.code}
                      onClick={() => handleSelectCountry(c.code)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                        c.code === country
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
                      }`}
                    >
                      <FlagCircle code={c.code} size={26} />
                      <span className="flex-1">{c.name}</span>
                      {c.code === country && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
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
          {user ? (
            <>
              <Link href="/siguiendo" className="flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white transition-colors">
                <Users size={16} />
                Siguiendo
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
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">Notificaciones</p>
                      <button onClick={() => setNotifOpen(false)} className="text-zinc-500 hover:text-white transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="overflow-y-auto max-h-80">
                      {notifLoading ? (
                        <div className="flex justify-center py-8">
                          <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : notifError ? (
                        <div className="px-4 py-6 text-center">
                          <p className="text-red-400 text-xs font-medium mb-1">Error al cargar notificaciones</p>
                          <p className="text-zinc-600 text-[11px] font-mono break-all">{notifError}</p>
                        </div>
                      ) : notifs.length === 0 ? (
                        <p className="text-zinc-500 text-sm text-center py-8">Sin notificaciones.</p>
                      ) : (
                        notifs.map(n => {
                          const actor    = n.actor?.display_name ?? n.actor?.username ?? 'Alguien'
                          const time     = new Date(n.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
                          const initials = (n.actor?.display_name ?? n.actor?.username ?? '?')[0]?.toUpperCase()
                          return (
                            <button
                              key={n.id}
                              onClick={() => handleNotifClick(n)}
                              className={`w-full flex items-start gap-3 px-4 py-3 border-b border-zinc-700/50 last:border-0 text-left transition-colors hover:bg-zinc-700/50 ${!n.read ? 'bg-zinc-700/30' : ''}`}
                            >
                              <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 shrink-0 mt-0.5">
                                {n.actor?.avatar_url ? (
                                  <img src={n.actor.avatar_url} alt={actor} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-400">
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
                                    <><span className="font-semibold text-white">{actor}</span> le dio me gusta a tu reseña de <span className="text-emerald-400">{n.review_title}</span></>
                                  )}
                                </p>
                                <p className="text-[11px] text-zinc-600 mt-0.5">{time}</p>
                              </div>
                              {!n.read && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
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
            <Link href="/auth" className="flex items-center gap-1.5 text-sm bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition-colors">
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
        <div className="md:hidden bg-zinc-900 border-t border-zinc-800 px-4 py-3 flex flex-col gap-3">
          <Link href="/que-ver" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-zinc-300">
            <Compass size={16} /> Qué ver
          </Link>
          {user ? (
            <>
              <Link href="/siguiendo" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-zinc-300">
                <Users size={16} /> Siguiendo
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
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </span>
                Notificaciones {unreadCount > 0 && <span className="text-red-400">({unreadCount})</span>}
              </button>
              <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-zinc-300 text-left">
                <LogOut size={16} /> Salir
              </button>
            </>
          ) : (
            <Link href="/auth" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 text-sm text-emerald-400">
              <LogIn size={16} /> Iniciar sesión
            </Link>
          )}
        </div>
      )}
    </nav>
  )
}
