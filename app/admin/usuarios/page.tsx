'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  X, ExternalLink, Ban, CheckCircle, Shield, Loader2,
  FileText, List, AlertCircle, MoreHorizontal, UserCheck, RefreshCw,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  email: string | null
  country: string | null
  updated_at: string
  /** Fecha de alta real, de auth.users. `profiles` no tiene created_at. */
  auth_created_at: string | null
  last_active: string | null
  blocked: boolean | null
  blocked_at: string | null
  verified: boolean | null
  points: number | null
  level: number | null
  review_count: number
  list_count: number
  follow_count: number
}

interface ApiResponse {
  users: AdminUser[]
  total: number
  page: number
  limit: number
}

interface Review { id: string; title: string; rating: number | null; body: string | null; created_at: string }
interface UserList { id: string; title: string; is_public: boolean; created_at: string }

type SortKey = 'username' | 'auth_created_at' | 'last_active' | 'review_count' | 'list_count' | 'follow_count' | 'points'
type SortDir = 'asc' | 'desc'

// ── Constants ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

// ── Helpers ───────────────────────────────────────────────────────────────

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60_000)
  if (min < 1)  return 'ahora'
  if (min < 60) return `hace ${min}m`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `hace ${days}d`
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: '2-digit' })
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SortTh({
  label, sortKey, currentKey, currentDir, onSort, className = '',
}: {
  label: string; sortKey: SortKey; currentKey: SortKey; currentDir: SortDir
  onSort: (k: SortKey) => void; className?: string
}) {
  const active = currentKey === sortKey
  return (
    <th
      className={`px-4 py-3 text-xs text-[#A0A0B0] font-medium cursor-pointer hover:text-white select-none whitespace-nowrap ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? currentDir === 'asc'
            ? <ChevronUp size={11} className="text-[#FFFD02]" />
            : <ChevronDown size={11} className="text-[#FFFD02]" />
          : <ChevronUp size={11} className="text-zinc-700" />
        }
      </span>
    </th>
  )
}

function Avatar({ user, size = 8 }: { user: AdminUser; size?: number }) {
  const cls = `w-${size} h-${size} rounded-full overflow-hidden bg-[#1C1C27] shrink-0`
  return (
    <div className={cls}>
      {user.avatar_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#FFFD02]">
            {(user.username ?? user.display_name ?? '?')[0]?.toUpperCase()}
          </div>
      }
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function UsuariosPage() {
  const supabase = useRef(createClient()).current

  // Data
  const [users,   setUsers]   = useState<AdminUser[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Filters
  const [searchRaw, setSearchRaw] = useState('')
  const [search,    setSearch]    = useState('') // debounced
  const [country,   setCountry]   = useState('')
  const [blocked,   setBlocked]   = useState('all')
  const [countries, setCountries] = useState<string[]>([]) // populated from first load

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('auth_created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Pagination
  const [page, setPage] = useState(0)

  // Side panel
  const [selected,     setSelected]     = useState<AdminUser | null>(null)
  const [panelReviews, setPanelReviews] = useState<Review[]>([])
  const [panelLists,   setPanelLists]   = useState<UserList[]>([])
  const [panelLoading, setPanelLoading] = useState(false)
  const [actioning,    setActioning]    = useState(false)

  // Open row action menu
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchRaw); setPage(0) }, 350)
    return () => clearTimeout(id)
  }, [searchRaw])

  // Main fetch — re-runs on any filter/sort/page change
  useEffect(() => {
    fetchUsers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, country, blocked, sortKey, sortDir, page])

  async function fetchUsers() {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      page:     String(page),
      limit:    String(PAGE_SIZE),
      sort_by:  sortKey,
      sort_dir: sortDir,
    })
    if (search)  params.set('search',  search)
    if (country) params.set('country', country)
    if (blocked !== 'all') params.set('blocked', blocked)

    try {
      const res = await fetch(`/api/admin/users?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Error ${res.status}`)
        setLoading(false)
        return
      }
      const data: ApiResponse = await res.json()
      setUsers(data.users)
      setTotal(data.total)

      // Populate country list from first successful load (no filters)
      if (!country && !search && blocked === 'all' && page === 0) {
        const allCountries = [...new Set(data.users.map(u => u.country).filter(Boolean))].sort() as string[]
        if (allCountries.length > 0) setCountries(allCountries)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(0)
  }

  function clearFilters() {
    setSearchRaw('')
    setSearch('')
    setCountry('')
    setBlocked('all')
    setPage(0)
  }

  const hasFilters = searchRaw || country || blocked !== 'all'
  const totalPages = Math.ceil(total / PAGE_SIZE)

  // Panel open
  const openPanel = useCallback(async (user: AdminUser) => {
    setSelected(user)
    setMenuOpen(null)
    setPanelLoading(true)
    const [revRes, lstRes] = await Promise.all([
      supabase.from('reviews').select('id, title, rating, body, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('lists').select('id, title, is_public, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
    ])
    setPanelReviews(revRes.data ?? [])
    setPanelLists(lstRes.data ?? [])
    setPanelLoading(false)
  }, [supabase])

  // Actions
  async function handleSoftBan(userId: string, block: boolean) {
    setActioning(true)
    const res = await fetch('/api/admin/soft-ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, block }),
    })
    if (res.ok) {
      const update = { blocked: block, blocked_at: block ? new Date().toISOString() : null }
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...update } : u))
      setSelected(prev => prev ? { ...prev, ...update } : null)
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
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, verified } : u))
      setSelected(prev => prev ? { ...prev, verified } : null)
      toast.success(verified ? 'Usuario verificado ✓' : 'Verificación removida')
    } else {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Error al verificar. ¿Existe la columna "verified" en profiles?')
    }
    setActioning(false)
  }

  // Pagination page numbers
  const pageNumbers = useMemo(() => {
    const delta = 2
    const pages: (number | '...')[] = []
    for (let i = 0; i < totalPages; i++) {
      if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= delta) {
        pages.push(i)
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...')
      }
    }
    return pages
  }, [page, totalPages])

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0A0F]">

      {/* Header */}
      <div className="bg-[#13131A] border-b border-[#2A2A3A] px-6 py-5 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Usuarios</h1>
            <p className="text-sm text-[#A0A0B0] mt-0.5">
              {loading
                ? 'Cargando…'
                : `${total.toLocaleString('es-AR')} usuarios${hasFilters ? ' (filtrados)' : ''}`
              }
            </p>
          </div>
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2 text-[#A0A0B0] hover:text-white transition-colors disabled:opacity-40"
            title="Recargar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Main area ─────────────────────────────────────────────────── */}
        <div className={`flex flex-col flex-1 overflow-hidden ${selected ? 'hidden lg:flex' : ''}`}>

          {/* Filters bar */}
          <div className="shrink-0 bg-[#0D0D14] border-b border-[#2A2A3A] px-4 py-3">
            <div className="flex flex-wrap gap-2 items-center">

              {/* Search */}
              <div className="relative flex-1 min-w-52">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A0A0B0] pointer-events-none" />
                <input
                  value={searchRaw}
                  onChange={e => setSearchRaw(e.target.value)}
                  placeholder="Username, nombre o email…"
                  className="w-full bg-[#13131A] border border-[#2A2A3A] rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-[#A0A0B0] focus:outline-none focus:border-[#FFFD02]/50 transition-colors"
                />
                {searchRaw && (
                  <button onClick={() => setSearchRaw('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A0A0B0] hover:text-white">
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* País */}
              <select
                value={country}
                onChange={e => { setCountry(e.target.value); setPage(0) }}
                className="bg-[#13131A] border border-[#2A2A3A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFFD02]/50 min-w-0"
              >
                <option value="">Todos los países</option>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              {/* Estado */}
              <select
                value={blocked}
                onChange={e => { setBlocked(e.target.value); setPage(0) }}
                className="bg-[#13131A] border border-[#2A2A3A] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#FFFD02]/50"
              >
                <option value="all">Todos</option>
                <option value="no">Sin ban</option>
                <option value="yes">Baneados</option>
              </select>

              {/* Clear */}
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1.5 text-xs text-[#A0A0B0] hover:text-white border border-[#2A2A3A] hover:border-zinc-600 px-3 py-2 rounded-xl transition-colors"
                >
                  <X size={12} />
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="m-4 bg-red-900/30 border border-red-800 rounded-xl px-5 py-4 flex items-start gap-3 shrink-0">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#13131A] border-b border-[#2A2A3A]">
                <tr>
                  {/* Avatar */}
                  <th className="w-12 px-4 py-3" />
                  {/* Username */}
                  <SortTh label="Usuario"       sortKey="username"     currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left" />
                  {/* Email */}
                  <th className="px-4 py-3 text-left text-xs text-[#A0A0B0] font-medium hidden xl:table-cell whitespace-nowrap">Email</th>
                  {/* País */}
                  <th className="px-4 py-3 text-left text-xs text-[#A0A0B0] font-medium hidden lg:table-cell">País</th>
                  {/* Registro */}
                  <SortTh label="Registro"      sortKey="auth_created_at" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left hidden md:table-cell" />
                  {/* Última actividad */}
                  <SortTh label="Últ. acceso"   sortKey="last_active"  currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left hidden lg:table-cell" />
                  {/* Verificado */}
                  <th className="px-4 py-3 text-center text-xs text-[#A0A0B0] font-medium hidden md:table-cell">✓</th>
                  {/* Reseñas */}
                  <SortTh label="Reseñas"       sortKey="review_count" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-center" />
                  {/* Listas */}
                  <SortTh label="Listas"        sortKey="list_count"   currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-center hidden sm:table-cell" />
                  {/* Follows */}
                  <SortTh label="Seguidores"    sortKey="follow_count" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-center hidden sm:table-cell" />
                  {/* Estado */}
                  <th className="px-4 py-3 text-center text-xs text-[#A0A0B0] font-medium">Estado</th>
                  {/* Acciones */}
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>

              <tbody className="divide-y divide-[#1C1C27]">
                {loading && users.length === 0
                  ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3"><div className="w-8 h-8 rounded-full bg-[#1C1C27]" /></td>
                      <td className="px-4 py-3"><div className="h-3 bg-[#1C1C27] rounded w-24 mb-1" /><div className="h-2.5 bg-[#1C1C27] rounded w-16" /></td>
                      <td className="px-4 py-3 hidden xl:table-cell"><div className="h-2.5 bg-[#1C1C27] rounded w-32" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><div className="h-2.5 bg-[#1C1C27] rounded w-8" /></td>
                      <td className="px-4 py-3 hidden md:table-cell"><div className="h-2.5 bg-[#1C1C27] rounded w-20" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><div className="h-2.5 bg-[#1C1C27] rounded w-16" /></td>
                      <td className="px-4 py-3 hidden md:table-cell" />
                      <td className="px-4 py-3 text-center"><div className="h-2.5 bg-[#1C1C27] rounded w-5 mx-auto" /></td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell"><div className="h-2.5 bg-[#1C1C27] rounded w-5 mx-auto" /></td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell"><div className="h-2.5 bg-[#1C1C27] rounded w-5 mx-auto" /></td>
                      <td className="px-4 py-3 text-center"><div className="h-4 bg-[#1C1C27] rounded-full w-10 mx-auto" /></td>
                      <td className="px-3 py-3" />
                    </tr>
                  ))
                  : users.map(user => (
                    <tr
                      key={user.id}
                      className={`hover:bg-[#13131A] transition-colors cursor-pointer ${selected?.id === user.id ? 'bg-[#13131A]' : ''} ${user.blocked ? 'opacity-50' : ''}`}
                      onClick={() => openPanel(user)}
                    >
                      {/* Avatar */}
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openPanel(user)}>
                          <Avatar user={user} size={8} />
                        </button>
                      </td>

                      {/* Username */}
                      <td className="px-4 py-3 max-w-[160px]">
                        <p className="font-semibold text-white truncate text-sm">
                          {user.display_name ?? user.username ?? '—'}
                        </p>
                        <p className="text-xs text-[#A0A0B0] truncate">@{user.username ?? '—'}</p>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 hidden xl:table-cell max-w-[200px]">
                        {user.email
                          ? <span className="text-xs text-[#A0A0B0] truncate block">{user.email}</span>
                          : <span className="text-xs text-zinc-700">—</span>
                        }
                      </td>

                      {/* País */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-[#A0A0B0]">{user.country ?? '—'}</span>
                      </td>

                      {/* Registro */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-[#A0A0B0]">{timeAgo(user.auth_created_at)}</span>
                      </td>

                      {/* Última actividad */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-[#A0A0B0]">{timeAgo(user.last_active)}</span>
                      </td>

                      {/* Verificado */}
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        {user.verified && (
                          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="inline-block">
                            <circle cx="10" cy="10" r="10" fill="#1D9BF0"/>
                            <path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </td>

                      {/* Reseñas */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-purple-400">{user.review_count}</span>
                      </td>

                      {/* Listas */}
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className="text-sm font-semibold text-blue-400">{user.list_count}</span>
                      </td>

                      {/* Seguidores */}
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <span className="text-sm font-semibold text-zinc-500">{user.follow_count}</span>
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3 text-center">
                        {user.blocked
                          ? <span className="inline-flex items-center gap-1 text-[10px] bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full font-medium">
                              <Ban size={9} />Ban
                            </span>
                          : <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-900/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                              <CheckCircle size={9} />OK
                            </span>
                        }
                      </td>

                      {/* Row actions */}
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="relative">
                          <button
                            onClick={() => setMenuOpen(menuOpen === user.id ? null : user.id)}
                            className="p-1.5 text-zinc-700 hover:text-[#A0A0B0] rounded-lg hover:bg-[#1C1C27] transition-colors"
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {menuOpen === user.id && (
                            <div className="absolute right-0 top-8 z-20 bg-[#13131A] border border-[#2A2A3A] rounded-xl shadow-xl w-44 py-1 overflow-hidden">
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#A0A0B0] hover:text-white hover:bg-[#1C1C27] transition-colors text-left"
                                onClick={() => openPanel(user)}
                              >
                                <ExternalLink size={12} /> Ver detalle
                              </button>
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-[#1C1C27] transition-colors text-left"
                                onClick={() => { setMenuOpen(null); handleVerify(user.id, !user.verified) }}
                              >
                                <UserCheck size={12} />
                                {user.verified ? 'Quitar verificado' : 'Verificar usuario'}
                              </button>
                              {user.blocked
                                ? <button
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-[#1C1C27] transition-colors text-left"
                                    onClick={() => { setMenuOpen(null); handleSoftBan(user.id, false) }}
                                  >
                                    <CheckCircle size={12} /> Desbanear
                                  </button>
                                : <button
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-[#1C1C27] transition-colors text-left"
                                    onClick={() => {
                                      setMenuOpen(null)
                                      if (confirm(`¿Banear a @${user.username}?`)) handleSoftBan(user.id, true)
                                    }}
                                  >
                                    <Ban size={12} /> Banear
                                  </button>
                              }
                              <div className="border-t border-[#2A2A3A] mt-1 pt-1">
                                <Link
                                  href={`/usuario/${user.username}`}
                                  target="_blank"
                                  className="flex items-center gap-2 px-3 py-2 text-xs text-[#A0A0B0] hover:text-white hover:bg-[#1C1C27] transition-colors"
                                  onClick={() => setMenuOpen(null)}
                                >
                                  <ExternalLink size={12} /> Ver perfil público
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>

            {!loading && users.length === 0 && (
              <div className="text-center py-16 text-[#A0A0B0]">
                <p className="text-sm">Sin usuarios que coincidan con los filtros</p>
                {hasFilters && (
                  <button onClick={clearFilters} className="mt-3 text-xs text-[#FFFD02] hover:underline">
                    Limpiar filtros
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="shrink-0 flex items-center justify-between px-6 py-3 border-t border-[#2A2A3A] bg-[#13131A]">
              <p className="text-xs text-[#A0A0B0]">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total.toLocaleString('es-AR')}
              </p>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                  className="p-1.5 rounded-lg border border-[#2A2A3A] text-[#A0A0B0] hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={13} />
                </button>

                {pageNumbers.map((n, i) =>
                  n === '...'
                    ? <span key={`e${i}`} className="px-1 text-xs text-zinc-600">…</span>
                    : <button
                        key={n}
                        onClick={() => setPage(n)}
                        disabled={loading}
                        className={`min-w-[28px] h-7 px-1 rounded-lg text-xs font-medium transition-colors ${
                          n === page
                            ? 'bg-[#FFFD02] text-black'
                            : 'text-[#A0A0B0] hover:text-white hover:bg-[#1C1C27]'
                        }`}
                      >
                        {(n as number) + 1}
                      </button>
                )}

                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1 || loading}
                  className="p-1.5 rounded-lg border border-[#2A2A3A] text-[#A0A0B0] hover:text-white disabled:opacity-30 transition-colors"
                >
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Side panel ────────────────────────────────────────────────── */}
        {selected && (
          <div className="w-full lg:w-[380px] shrink-0 border-l border-[#2A2A3A] bg-[#0D0D14] flex flex-col overflow-hidden">

            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A3A] shrink-0">
              <h2 className="text-sm font-semibold text-white">Detalle de usuario</h2>
              <button onClick={() => setSelected(null)} className="p-1.5 text-[#A0A0B0] hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* Profile header */}
              <div className="px-5 py-5 border-b border-[#2A2A3A]">
                <div className="flex items-start gap-4 mb-4">
                  <Avatar user={selected} size={14} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-white">{selected.display_name ?? selected.username}</p>
                      {selected.verified && (
                        <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                          <circle cx="10" cy="10" r="10" fill="#1D9BF0"/>
                          <path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <p className="text-sm text-[#A0A0B0]">@{selected.username ?? '—'}</p>
                    {selected.blocked && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-red-900/40 text-red-400 px-2 py-0.5 rounded-full mt-1 font-medium">
                        <Ban size={9} />Baneado
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ['Email',         selected.email ?? '—'],
                    ['País',          selected.country ?? '—'],
                    ['Registro',      fmtDate(selected.auth_created_at)],
                    ['Últ. acceso',   timeAgo(selected.last_active)],
                    ['Nivel',         `Nv.${selected.level ?? '—'} · ${(selected.points ?? 0).toLocaleString()} pts`],
                    ['Actividad',     `${selected.review_count} reseñas · ${selected.list_count} listas`],
                  ].map(([label, val]) => (
                    <div key={label} className="bg-[#13131A] rounded-xl px-3 py-2.5 col-span-1 overflow-hidden">
                      <p className="text-[#A0A0B0] text-[10px] uppercase tracking-wide mb-0.5">{label}</p>
                      <p className="text-white text-xs truncate">{val}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 py-4 border-b border-[#2A2A3A] space-y-2">
                <p className="text-[10px] text-[#A0A0B0] uppercase tracking-wider font-medium">Acciones</p>

                <Link
                  href={`/usuario/${selected.username}`}
                  target="_blank"
                  className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-[#13131A] hover:bg-[#1C1C27] text-[#A0A0B0] hover:text-white transition-colors border border-[#2A2A3A]"
                >
                  <ExternalLink size={13} /> Ver perfil público
                </Link>

                {selected.verified
                  ? <button
                      onClick={() => handleVerify(selected.id, false)}
                      disabled={actioning}
                      className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-[#13131A] hover:bg-[#1C1C27] text-[#A0A0B0] hover:text-white transition-colors border border-[#2A2A3A] disabled:opacity-50"
                    >
                      {actioning ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
                      Quitar verificado
                    </button>
                  : <button
                      onClick={() => handleVerify(selected.id, true)}
                      disabled={actioning}
                      className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-blue-900/20 hover:bg-blue-900/40 text-blue-400 transition-colors border border-blue-900/30 disabled:opacity-50"
                    >
                      {actioning ? <Loader2 size={13} className="animate-spin" /> : <Shield size={13} />}
                      Verificar usuario
                    </button>
                }

                {selected.blocked
                  ? <button
                      onClick={() => handleSoftBan(selected.id, false)}
                      disabled={actioning}
                      className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 transition-colors border border-emerald-900/30 disabled:opacity-50"
                    >
                      {actioning ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                      Desbanear usuario
                    </button>
                  : <button
                      onClick={() => {
                        if (confirm(`¿Banear a @${selected.username}? Esto los marcará como bloqueados.`)) {
                          handleSoftBan(selected.id, true)
                        }
                      }}
                      disabled={actioning}
                      className="w-full flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/40 text-red-400 transition-colors border border-red-900/30 disabled:opacity-50"
                    >
                      {actioning ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
                      Banear (soft)
                    </button>
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
                      <div key={r.id} className="mb-3 last:mb-0">
                        <p className="text-xs font-medium text-white truncate">
                          {r.title}
                          {r.rating != null && <span className="text-amber-400 ml-1">· {r.rating}★</span>}
                        </p>
                        {r.body && <p className="text-[11px] text-[#A0A0B0] mt-0.5 line-clamp-2 leading-relaxed">{r.body}</p>}
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
                      <div key={l.id} className="mb-2 last:mb-0 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white truncate">{l.title}</p>
                          <p className="text-[10px] text-zinc-600">{l.is_public ? 'Pública' : 'Privada'} · {fmtDate(l.created_at)}</p>
                        </div>
                        <Link href={`/listas/${l.id}`} target="_blank" className="text-zinc-700 hover:text-[#A0A0B0] transition-colors">
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

      {/* Mobile back button */}
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

      {/* Click outside menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
      )}
    </div>
  )
}
