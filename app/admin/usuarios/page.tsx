'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  X, ExternalLink, Ban, CheckCircle, Shield, Loader2,
  FileText, List, Users, AlertCircle,
} from 'lucide-react'

interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  country: string | null
  updated_at: string
  last_active: string | null
  blocked: boolean | null
  blocked_at: string | null
  points: number | null
  level: number | null
  // enriched
  email?: string
  review_count?: number
  list_count?: number
  follow_count?: number
}

interface Review {
  id: string; title: string; rating: number | null; body: string | null; created_at: string
}

interface UserList {
  id: string; title: string; is_public: boolean; created_at: string
}

type SortKey = 'username' | 'updated_at' | 'last_active' | 'review_count' | 'list_count' | 'follow_count' | 'points'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 50

export default function UsuariosPage() {
  const supabase = useRef(createClient()).current

  const [profiles,   setProfiles]   = useState<Profile[]>([])
  const [emailMap,   setEmailMap]   = useState<Record<string, string>>({})
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  // Filters
  const [search,   setSearch]   = useState('')
  const [country,  setCountry]  = useState('')
  const [blocked,  setBlocked]  = useState<'all' | 'yes' | 'no'>('all')

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('updated_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Pagination
  const [page, setPage] = useState(0)

  // Side panel
  const [selected,     setSelected]     = useState<Profile | null>(null)
  const [panelReviews, setPanelReviews] = useState<Review[]>([])
  const [panelLists,   setPanelLists]   = useState<UserList[]>([])
  const [panelLoading, setPanelLoading] = useState(false)
  const [actioning,    setActioning]    = useState(false)

  useEffect(() => { fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    setLoading(true)
    setError(null)

    const [profilesRes, reviewsCountRes, listsCountRes, followsCountRes, emailsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('updated_at', { ascending: false }),
      supabase.from('reviews').select('user_id').limit(10000),
      supabase.from('lists').select('user_id').limit(10000),
      supabase.from('follows').select('following_id').limit(10000),
      fetch('/api/admin/user-emails').then(r => r.ok ? r.json() : { emails: {} }),
    ])

    if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return }

    // Count maps
    const revCounts: Record<string, number> = {}
    for (const r of (reviewsCountRes.data ?? []) as { user_id: string }[]) {
      revCounts[r.user_id] = (revCounts[r.user_id] ?? 0) + 1
    }
    const lstCounts: Record<string, number> = {}
    for (const l of (listsCountRes.data ?? []) as { user_id: string }[]) {
      lstCounts[l.user_id] = (lstCounts[l.user_id] ?? 0) + 1
    }
    const flwCounts: Record<string, number> = {}
    for (const f of (followsCountRes.data ?? []) as { following_id: string }[]) {
      flwCounts[f.following_id] = (flwCounts[f.following_id] ?? 0) + 1
    }

    const emails: Record<string, string> = emailsRes.emails ?? {}
    setEmailMap(emails)

    const enriched: Profile[] = (profilesRes.data ?? []).map((p: Profile) => ({
      ...p,
      email:        emails[p.id],
      review_count: revCounts[p.id] ?? 0,
      list_count:   lstCounts[p.id] ?? 0,
      follow_count: flwCounts[p.id] ?? 0,
    }))

    setProfiles(enriched)
    setLoading(false)
  }

  // Filtered + sorted + paginated
  const filtered = profiles.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || (p.username ?? '').toLowerCase().includes(q) || (emailMap[p.id] ?? '').toLowerCase().includes(q)
    const matchCountry = !country || p.country === country
    const matchBlocked = blocked === 'all' || (blocked === 'yes' ? p.blocked : !p.blocked)
    return matchSearch && matchCountry && matchBlocked
  })

  const sorted = [...filtered].sort((a, b) => {
    let av: number | string = '', bv: number | string = ''
    if (sortKey === 'username')      { av = a.username ?? ''; bv = b.username ?? '' }
    else if (sortKey === 'updated_at')  { av = a.updated_at;  bv = b.updated_at }
    else if (sortKey === 'last_active') { av = a.last_active ?? ''; bv = b.last_active ?? '' }
    else if (sortKey === 'review_count') { av = a.review_count ?? 0; bv = b.review_count ?? 0 }
    else if (sortKey === 'list_count')   { av = a.list_count ?? 0;   bv = b.list_count ?? 0 }
    else if (sortKey === 'follow_count') { av = a.follow_count ?? 0; bv = b.follow_count ?? 0 }
    else if (sortKey === 'points')       { av = a.points ?? 0;       bv = b.points ?? 0 }

    if (av < bv) return sortDir === 'asc' ? -1 : 1
    if (av > bv) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronUp size={12} className="text-zinc-700" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-[#FFFD02]" />
      : <ChevronDown size={12} className="text-[#FFFD02]" />
  }

  const openPanel = useCallback(async (profile: Profile) => {
    setSelected(profile)
    setPanelLoading(true)
    const [revRes, lstRes] = await Promise.all([
      supabase.from('reviews').select('id, title, rating, body, created_at').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('lists').select('id, title, is_public, created_at').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(10),
    ])
    setPanelReviews(revRes.data ?? [])
    setPanelLists(lstRes.data ?? [])
    setPanelLoading(false)
  }, [supabase])

  async function handleSoftBan(userId: string, block: boolean) {
    setActioning(true)
    const res = await fetch('/api/admin/soft-ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, block }),
    })
    if (res.ok) {
      setProfiles(prev => prev.map(p => p.id === userId
        ? { ...p, blocked: block, blocked_at: block ? new Date().toISOString() : null }
        : p
      ))
      setSelected(prev => prev ? { ...prev, blocked: block, blocked_at: block ? new Date().toISOString() : null } : null)
      toast.success(block ? 'Usuario baneado' : 'Ban removido')
    } else {
      toast.error('Error al modificar el ban')
    }
    setActioning(false)
  }

  async function handleVerify(userId: string, verified: boolean) {
    setActioning(true)
    const res = await fetch('/api/admin/verify-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, verified }),
    })
    if (res.ok) {
      toast.success(verified ? 'Usuario verificado' : 'Verificación removida')
    } else {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Error al verificar (¿existe la columna "verified" en profiles?)')
    }
    setActioning(false)
  }

  const countries = [...new Set(profiles.map(p => p.country).filter(Boolean))].sort() as string[]

  function fmtDate(iso: string | null | undefined) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function timeAgo(iso: string | null | undefined) {
    if (!iso) return '—'
    const diff = Date.now() - new Date(iso).getTime()
    const min  = Math.floor(diff / 60000)
    if (min < 60)   return `hace ${min}m`
    const hrs  = Math.floor(min / 60)
    if (hrs < 24)   return `hace ${hrs}h`
    const days = Math.floor(hrs / 24)
    if (days < 30)  return `hace ${days}d`
    return fmtDate(iso)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={28} className="animate-spin text-[#FFFD02]" />
    </div>
  )

  return (
    <div className="min-h-screen pb-20 flex flex-col">
      {/* Header */}
      <div className="bg-[#13131A] border-b border-[#2A2A3A] px-6 py-5 shrink-0">
        <h1 className="text-xl font-bold text-white">Usuarios</h1>
        <p className="text-sm text-[#A0A0B0] mt-0.5">{profiles.length.toLocaleString('es-AR')} registrados · {filtered.length.toLocaleString('es-AR')} en vista</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main table area */}
        <div className={`flex-1 overflow-auto ${selected ? 'hidden lg:block' : ''}`}>

          {error && (
            <div className="m-6 bg-red-900/30 border border-red-800 rounded-xl px-5 py-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Filters */}
          <div className="px-6 py-4 flex flex-wrap gap-3 bg-[#0D0D14] border-b border-[#2A2A3A]">
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0A0B0]" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0) }}
                placeholder="Buscar por username o email…"
                className="w-full bg-[#13131A] border border-[#2A2A3A] rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-[#A0A0B0] focus:outline-none focus:border-[#FFFD02]/50"
              />
            </div>
            <select
              value={country}
              onChange={e => { setCountry(e.target.value); setPage(0) }}
              className="bg-[#13131A] border border-[#2A2A3A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFFD02]/50"
            >
              <option value="">Todos los países</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={blocked}
              onChange={e => { setBlocked(e.target.value as 'all'|'yes'|'no'); setPage(0) }}
              className="bg-[#13131A] border border-[#2A2A3A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFFD02]/50"
            >
              <option value="all">Todos</option>
              <option value="no">Sin ban</option>
              <option value="yes">Baneados</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#13131A] border-b border-[#2A2A3A] sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 text-xs text-[#A0A0B0] font-medium w-10"></th>
                  <th
                    className="text-left px-4 py-3 text-xs text-[#A0A0B0] font-medium cursor-pointer hover:text-white select-none"
                    onClick={() => toggleSort('username')}
                  >
                    <span className="inline-flex items-center gap-1">Usuario <SortIcon k="username" /></span>
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-[#A0A0B0] font-medium hidden xl:table-cell">Email</th>
                  <th className="text-left px-4 py-3 text-xs text-[#A0A0B0] font-medium hidden lg:table-cell">País</th>
                  <th
                    className="text-left px-4 py-3 text-xs text-[#A0A0B0] font-medium cursor-pointer hover:text-white select-none hidden md:table-cell"
                    onClick={() => toggleSort('updated_at')}
                  >
                    <span className="inline-flex items-center gap-1">Registro <SortIcon k="updated_at" /></span>
                  </th>
                  <th
                    className="text-left px-4 py-3 text-xs text-[#A0A0B0] font-medium cursor-pointer hover:text-white select-none hidden lg:table-cell"
                    onClick={() => toggleSort('last_active')}
                  >
                    <span className="inline-flex items-center gap-1">Último acceso <SortIcon k="last_active" /></span>
                  </th>
                  <th
                    className="text-center px-4 py-3 text-xs text-[#A0A0B0] font-medium cursor-pointer hover:text-white select-none"
                    onClick={() => toggleSort('review_count')}
                  >
                    <span className="inline-flex items-center gap-1">Reseñas <SortIcon k="review_count" /></span>
                  </th>
                  <th
                    className="text-center px-4 py-3 text-xs text-[#A0A0B0] font-medium cursor-pointer hover:text-white select-none hidden sm:table-cell"
                    onClick={() => toggleSort('list_count')}
                  >
                    <span className="inline-flex items-center gap-1">Listas <SortIcon k="list_count" /></span>
                  </th>
                  <th
                    className="text-center px-4 py-3 text-xs text-[#A0A0B0] font-medium cursor-pointer hover:text-white select-none hidden sm:table-cell"
                    onClick={() => toggleSort('follow_count')}
                  >
                    <span className="inline-flex items-center gap-1">Seguidores <SortIcon k="follow_count" /></span>
                  </th>
                  <th className="text-center px-4 py-3 text-xs text-[#A0A0B0] font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2A3A]">
                {paged.map(profile => (
                  <tr
                    key={profile.id}
                    onClick={() => openPanel(profile)}
                    className={`hover:bg-[#13131A] cursor-pointer transition-colors ${selected?.id === profile.id ? 'bg-[#13131A]' : ''} ${profile.blocked ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-[#1C1C27] shrink-0">
                        {profile.avatar_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#FFFD02]">
                              {(profile.username ?? '?')[0]?.toUpperCase()}
                            </div>
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white truncate max-w-32">{profile.display_name ?? profile.username ?? '—'}</p>
                      <p className="text-xs text-[#A0A0B0]">@{profile.username ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-xs text-[#A0A0B0] truncate max-w-40 block">{emailMap[profile.id] ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-[#A0A0B0]">{profile.country ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-[#A0A0B0]">{fmtDate(profile.updated_at)}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-[#A0A0B0]">{timeAgo(profile.last_active)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-semibold text-purple-400">{profile.review_count ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className="text-sm font-semibold text-blue-400">{profile.list_count ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <span className="text-sm font-semibold text-[#A0A0B0]">{profile.follow_count ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {profile.blocked
                        ? <span className="inline-flex items-center gap-1 text-[10px] bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full font-medium"><Ban size={9} />Ban</span>
                        : <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-900/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium"><CheckCircle size={9} />OK</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {sorted.length === 0 && (
              <p className="text-center text-[#A0A0B0] py-16">Sin usuarios que coincidan con los filtros</p>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#2A2A3A] bg-[#13131A]">
              <p className="text-xs text-[#A0A0B0]">
                Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} de {sorted.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg border border-[#2A2A3A] text-[#A0A0B0] hover:text-white disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-white">{page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg border border-[#2A2A3A] text-[#A0A0B0] hover:text-white disabled:opacity-40 transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        {selected && (
          <div className="w-full lg:w-96 border-l border-[#2A2A3A] bg-[#0D0D14] flex flex-col overflow-hidden shrink-0">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A3A]">
              <h2 className="text-sm font-semibold text-white">Detalle de usuario</h2>
              <button
                onClick={() => setSelected(null)}
                className="p-1.5 text-[#A0A0B0] hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Profile header */}
              <div className="px-5 py-5 border-b border-[#2A2A3A]">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-[#1C1C27] shrink-0">
                    {selected.avatar_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={selected.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-lg font-bold text-[#FFFD02]">
                          {(selected.username ?? '?')[0]?.toUpperCase()}
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white truncate">{selected.display_name ?? selected.username}</p>
                    <p className="text-sm text-[#A0A0B0]">@{selected.username ?? '—'}</p>
                    {selected.blocked && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full mt-1"><Ban size={9} />Baneado</span>
                    )}
                  </div>
                </div>

                {/* Info grid */}
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-[#13131A] rounded-xl px-3 py-2.5">
                    <p className="text-[#A0A0B0]">Email</p>
                    <p className="text-white mt-0.5 truncate">{emailMap[selected.id] ?? '—'}</p>
                  </div>
                  <div className="bg-[#13131A] rounded-xl px-3 py-2.5">
                    <p className="text-[#A0A0B0]">País</p>
                    <p className="text-white mt-0.5">{selected.country ?? '—'}</p>
                  </div>
                  <div className="bg-[#13131A] rounded-xl px-3 py-2.5">
                    <p className="text-[#A0A0B0]">Registro</p>
                    <p className="text-white mt-0.5">{fmtDate(selected.updated_at)}</p>
                  </div>
                  <div className="bg-[#13131A] rounded-xl px-3 py-2.5">
                    <p className="text-[#A0A0B0]">Último acceso</p>
                    <p className="text-white mt-0.5">{timeAgo(selected.last_active)}</p>
                  </div>
                  <div className="bg-[#13131A] rounded-xl px-3 py-2.5">
                    <p className="text-[#A0A0B0]">Nivel</p>
                    <p className="text-white mt-0.5">Nv. {selected.level ?? '—'} · {selected.points ?? 0} pts</p>
                  </div>
                  <div className="bg-[#13131A] rounded-xl px-3 py-2.5">
                    <p className="text-[#A0A0B0]">Actividad</p>
                    <p className="text-white mt-0.5">{selected.review_count ?? 0} reseñas · {selected.list_count ?? 0} listas</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 py-4 border-b border-[#2A2A3A] space-y-2">
                <p className="text-[10px] text-[#A0A0B0] uppercase tracking-wider font-medium mb-3">Acciones</p>

                <Link
                  href={`/usuario/${selected.username}`}
                  target="_blank"
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-[#13131A] hover:bg-[#1C1C27] text-[#A0A0B0] hover:text-white transition-colors border border-[#2A2A3A]"
                >
                  <ExternalLink size={13} />
                  Ver perfil público
                </Link>

                <button
                  onClick={() => handleVerify(selected.id, true)}
                  disabled={actioning}
                  className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 transition-colors border border-blue-900/30 disabled:opacity-50"
                >
                  <Shield size={13} />
                  Verificar usuario
                </button>
                <button
                  onClick={() => handleVerify(selected.id, false)}
                  disabled={actioning}
                  className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-[#13131A] hover:bg-[#1C1C27] text-[#A0A0B0] hover:text-white transition-colors border border-[#2A2A3A] disabled:opacity-50"
                >
                  <Shield size={13} />
                  Quitar verificado
                </button>

                {selected.blocked
                  ? (
                    <button
                      onClick={() => handleSoftBan(selected.id, false)}
                      disabled={actioning}
                      className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 transition-colors border border-emerald-900/30 disabled:opacity-50"
                    >
                      {actioning ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                      Desbanear usuario
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (confirm(`¿Banear a @${selected.username}? Esto los marcará como bloqueados en la app.`)) {
                          handleSoftBan(selected.id, true)
                        }
                      }}
                      disabled={actioning}
                      className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/40 text-red-400 transition-colors border border-red-900/30 disabled:opacity-50"
                    >
                      {actioning ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
                      Banear (soft)
                    </button>
                  )
                }
              </div>

              {/* Recent reviews */}
              <div className="px-5 py-4 border-b border-[#2A2A3A]">
                <p className="text-[10px] text-[#A0A0B0] uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
                  <FileText size={11} /> Últimas reseñas
                </p>
                {panelLoading
                  ? <p className="text-xs text-[#A0A0B0]">Cargando…</p>
                  : panelReviews.length === 0
                    ? <p className="text-xs text-[#A0A0B0]">Sin reseñas</p>
                    : panelReviews.map(r => (
                      <div key={r.id} className="mb-3">
                        <p className="text-xs font-medium text-white truncate">{r.title} {r.rating != null && <span className="text-amber-400">· {r.rating}★</span>}</p>
                        {r.body && <p className="text-[11px] text-[#A0A0B0] mt-0.5 line-clamp-2">{r.body}</p>}
                        <p className="text-[10px] text-zinc-600 mt-0.5">{fmtDate(r.created_at)}</p>
                      </div>
                    ))
                }
              </div>

              {/* Lists */}
              <div className="px-5 py-4">
                <p className="text-[10px] text-[#A0A0B0] uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
                  <List size={11} /> Listas creadas
                </p>
                {panelLoading
                  ? <p className="text-xs text-[#A0A0B0]">Cargando…</p>
                  : panelLists.length === 0
                    ? <p className="text-xs text-[#A0A0B0]">Sin listas</p>
                    : panelLists.map(l => (
                      <div key={l.id} className="mb-2 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{l.title}</p>
                          <p className="text-[10px] text-zinc-600">{l.is_public ? 'Pública' : 'Privada'} · {fmtDate(l.created_at)}</p>
                        </div>
                        <Link href={`/listas/${l.id}`} target="_blank" className="text-[#A0A0B0] hover:text-white transition-colors">
                          <ExternalLink size={11} />
                        </Link>
                      </div>
                    ))
                }
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile: back button when panel open */}
      {selected && (
        <div className="lg:hidden fixed bottom-4 left-4 z-50">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-2 bg-[#13131A] border border-[#2A2A3A] px-4 py-2 rounded-xl text-sm text-white shadow-xl"
          >
            <ChevronLeft size={14} /> Volver a tabla
          </button>
        </div>
      )}
    </div>
  )
}
