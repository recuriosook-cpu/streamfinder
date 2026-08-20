'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  FileText, List, UserPlus, Bookmark, UserCheck,
  Loader2, Trash2, Calendar,
} from 'lucide-react'

type ActivityType = 'review' | 'list' | 'user' | 'watchlist' | 'follow'
type DateFilter = 'today' | '7d' | '30d'

interface NewUserRow {
  id: string
  username: string | null
  avatar_url: string | null
  /** auth.users.created_at — la fecha de alta real. */
  auth_created_at: string | null
}

interface ActivityItem {
  id: string
  type: ActivityType
  userId: string
  username: string | null
  avatarUrl: string | null
  summary: string
  detail?: string | null
  link?: string
  contentId?: string
  timestamp: string
}

const TYPE_META: Record<ActivityType, { label: string; icon: React.ReactNode; color: string }> = {
  review:    { label: 'Reseña',      icon: <FileText size={13} />,  color: 'text-purple-400 bg-purple-900/30' },
  list:      { label: 'Lista',       icon: <List size={13} />,       color: 'text-blue-400 bg-blue-900/30'   },
  user:      { label: 'Registro',    icon: <UserPlus size={13} />,   color: 'text-emerald-400 bg-emerald-900/30' },
  watchlist: { label: 'Watchlist',   icon: <Bookmark size={13} />,   color: 'text-amber-400 bg-amber-900/30' },
  follow:    { label: 'Follow',      icon: <UserCheck size={13} />,  color: 'text-[#FFFD02] bg-[#FFFD02]/10' },
}

export default function ActividadPage() {
  const supabase = useRef(createClient()).current
  const [items,   setItems]   = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  const [typeFilter, setTypeFilter] = useState<ActivityType | 'all'>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('7d')
  const [deleting,   setDeleting]   = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [dateFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    setLoading(true)
    const cutoff = dateFilter === 'today'
      ? new Date(new Date().setHours(0,0,0,0)).toISOString()
      : dateFilter === '7d'
        ? new Date(Date.now() - 7  * 86400_000).toISOString()
        : new Date(Date.now() - 30 * 86400_000).toISOString()

    // Los registros nuevos salen de /api/admin/users, no de profiles: la fecha
    // de alta real vive en auth.users.created_at y desde el cliente no se puede
    // leer. Antes acá se usaba profiles.updated_at, que es cuándo se tocó la
    // fila por última vez, y se lo etiquetaba como "Nuevo usuario registrado".
    const newUsersPromise = fetch('/api/admin/users?sort_by=auth_created_at&sort_dir=desc&limit=50')
      .then(async r => (r.ok ? ((await r.json()) as { users: NewUserRow[] }).users : []))
      .catch(() => [] as NewUserRow[])

    const [reviewsRes, listsRes, newUsers, watchlistRes, followsRes] = await Promise.all([
      supabase.from('reviews').select('id, user_id, title, rating, body, created_at').gte('created_at', cutoff).order('created_at', { ascending: false }).limit(50),
      supabase.from('lists').select('id, user_id, title, is_public, created_at').gte('created_at', cutoff).order('created_at', { ascending: false }).limit(50),
      newUsersPromise,
      supabase.from('watchlist').select('id, user_id, title, media_type, media_id, added_at').gte('added_at', cutoff).order('added_at', { ascending: false }).limit(50),
      supabase.from('follows').select('follower_id, following_id, created_at').gte('created_at', cutoff).order('created_at', { ascending: false }).limit(50),
    ])

    // Collect all user IDs for profile lookup
    const userIds = new Set<string>()
    ;(reviewsRes.data ?? []).forEach((r: { user_id: string }) => userIds.add(r.user_id))
    ;(listsRes.data ?? []).forEach((l: { user_id: string }) => userIds.add(l.user_id))
    ;(watchlistRes.data ?? []).forEach((w: { user_id: string }) => userIds.add(w.user_id))
    ;(followsRes.data ?? []).forEach((f: { follower_id: string; following_id: string }) => { userIds.add(f.follower_id); userIds.add(f.following_id) })

    let profileMap: Record<string, { username: string | null; avatar_url: string | null }> = {}
    if (userIds.size > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, username, avatar_url').in('id', [...userIds])
      profileMap = Object.fromEntries((profiles ?? []).map((p: { id: string; username: string | null; avatar_url: string | null }) => [p.id, p]))
    }

    const all: ActivityItem[] = []

    // Reviews
    for (const r of (reviewsRes.data ?? []) as { id: string; user_id: string; title: string; rating: number | null; body: string | null; created_at: string }[]) {
      const p = profileMap[r.user_id]
      all.push({
        id: `rev-${r.id}`, type: 'review',
        userId: r.user_id,
        username: p?.username ?? null, avatarUrl: p?.avatar_url ?? null,
        summary: `Publicó una reseña de "${r.title}"${r.rating != null ? ` · ${r.rating}★` : ''}`,
        detail: r.body ? r.body.slice(0, 120) + (r.body.length > 120 ? '…' : '') : null,
        link: `/review/${r.id}`,
        contentId: r.id,
        timestamp: r.created_at,
      })
    }

    // Lists
    for (const l of (listsRes.data ?? []) as { id: string; user_id: string; title: string; is_public: boolean; created_at: string }[]) {
      const p = profileMap[l.user_id]
      all.push({
        id: `lst-${l.id}`, type: 'list',
        userId: l.user_id,
        username: p?.username ?? null, avatarUrl: p?.avatar_url ?? null,
        summary: `Creó la lista "${l.title}"${l.is_public ? '' : ' (privada)'}`,
        link: `/listas/${l.id}`,
        contentId: l.id,
        timestamp: l.created_at,
      })
    }

    // New users — con la fecha de alta real; el filtro por período se aplica
    // acá porque el endpoint devuelve los últimos N sin recorte temporal.
    for (const u of newUsers) {
      if (!u.auth_created_at || u.auth_created_at < cutoff) continue
      all.push({
        id: `usr-${u.id}`, type: 'user',
        userId: u.id,
        username: u.username, avatarUrl: u.avatar_url,
        summary: `Nuevo usuario registrado`,
        link: `/usuario/${u.username}`,
        timestamp: u.auth_created_at,
      })
    }

    // Watchlist
    for (const w of (watchlistRes.data ?? []) as { id: string; user_id: string; title: string; media_type: string; media_id: number; added_at: string }[]) {
      const p = profileMap[w.user_id]
      all.push({
        id: `wl-${w.id}`, type: 'watchlist',
        userId: w.user_id,
        username: p?.username ?? null, avatarUrl: p?.avatar_url ?? null,
        summary: `Agregó "${w.title}" a su watchlist`,
        link: `/${w.media_type === 'tv' ? 'series' : 'movie'}/${w.media_id}`,
        timestamp: w.added_at,
      })
    }

    // Follows
    for (const f of (followsRes.data ?? []) as { follower_id: string; following_id: string; created_at: string }[]) {
      const follower  = profileMap[f.follower_id]
      const following = profileMap[f.following_id]
      all.push({
        id: `flw-${f.follower_id}-${f.following_id}`, type: 'follow',
        userId: f.follower_id,
        username: follower?.username ?? null, avatarUrl: follower?.avatar_url ?? null,
        summary: `Siguió a @${following?.username ?? '?'}`,
        link: `/usuario/${following?.username}`,
        timestamp: f.created_at,
      })
    }

    // Sort by timestamp desc
    all.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    setItems(all)
    setLoading(false)
  }

  async function deleteContent(item: ActivityItem) {
    if (!item.contentId) return
    if (!confirm(`¿Eliminar este contenido? No se puede deshacer.`)) return
    setDeleting(item.id)

    const table = item.type === 'review' ? 'reviews' : 'lists'
    const { error } = await supabase.from(table).delete().eq('id', item.contentId)
    if (error) {
      toast.error('Error al eliminar: ' + error.message)
    } else {
      setItems(prev => prev.filter(i => i.id !== item.id))
      toast.success('Contenido eliminado')
    }
    setDeleting(null)
  }

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const min  = Math.floor(diff / 60000)
    if (min < 1)  return 'ahora'
    if (min < 60) return `hace ${min}m`
    const hrs = Math.floor(min / 60)
    if (hrs < 24) return `hace ${hrs}h`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `hace ${days}d`
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  }

  const visible = items.filter(i => typeFilter === 'all' || i.type === typeFilter)

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="bg-[#13131A] border-b border-[#2A2A3A] px-6 py-5">
        <h1 className="text-xl font-bold text-white">Actividad</h1>
        <p className="text-sm text-[#A0A0B0] mt-0.5">{visible.length} eventos · feed cronológico</p>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 flex flex-wrap gap-3 bg-[#0D0D14] border-b border-[#2A2A3A]">
        {/* Date */}
        <div className="flex items-center gap-1 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-1">
          {([
            ['today', 'Hoy'],
            ['7d',    '7 días'],
            ['30d',   '30 días'],
          ] as const).map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setDateFilter(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dateFilter === val ? 'bg-[#FFFD02] text-black' : 'text-[#A0A0B0] hover:text-white'}`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1 bg-[#13131A] border border-[#2A2A3A] rounded-xl p-1 flex-wrap">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === 'all' ? 'bg-[#FFFD02] text-black' : 'text-[#A0A0B0] hover:text-white'}`}
          >
            Todo
          </button>
          {(Object.keys(TYPE_META) as ActivityType[]).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === t ? 'bg-[#FFFD02] text-black' : 'text-[#A0A0B0] hover:text-white'}`}
            >
              {TYPE_META[t].label}
            </button>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="max-w-3xl px-6 py-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 size={24} className="animate-spin text-[#FFFD02]" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20">
            <Calendar size={28} className="text-zinc-700 mx-auto mb-3" />
            <p className="text-[#A0A0B0]">Sin actividad en este período</p>
          </div>
        ) : visible.map(item => {
          const meta = TYPE_META[item.type]
          return (
            <div
              key={item.id}
              className="bg-[#13131A] border border-[#2A2A3A] rounded-xl px-4 py-3 flex items-start gap-3 hover:border-[#3A3A4A] transition-colors"
            >
              {/* Type badge */}
              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${meta.color}`}>
                {meta.icon}
              </div>

              {/* Avatar */}
              <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-[#1C1C27]">
                {item.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={item.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#FFFD02]">
                      {(item.username ?? '?')[0]?.toUpperCase()}
                    </div>
                }
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className="text-xs text-[#FFFD02] font-medium shrink-0">
                    @{item.username ?? 'usuario'}
                  </span>
                  <span className="text-xs text-[#A0A0B0] flex-1">{item.summary}</span>
                </div>
                {item.detail && (
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed line-clamp-2">{item.detail}</p>
                )}
              </div>

              {/* Right: time + actions */}
              <div className="shrink-0 flex flex-col items-end gap-2">
                <span className="text-[10px] text-zinc-600">{timeAgo(item.timestamp)}</span>
                <div className="flex items-center gap-1">
                  {item.link && (
                    <Link href={item.link} target="_blank" className="text-zinc-600 hover:text-[#A0A0B0] transition-colors p-1">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </Link>
                  )}
                  {(item.type === 'review' || item.type === 'list') && item.contentId && (
                    <button
                      onClick={() => deleteContent(item)}
                      disabled={deleting === item.id}
                      className="text-zinc-700 hover:text-red-400 transition-colors p-1 disabled:opacity-40"
                      title="Eliminar contenido"
                    >
                      {deleting === item.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <Trash2 size={11} />
                      }
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
