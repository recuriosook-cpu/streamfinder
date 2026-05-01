'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Heart, MessageCircle, Plus, Eye, Send, Trash2, Pencil, ArrowLeft, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { getPosterUrl } from '@/lib/tmdb'
import VerifiedBadge, { isVerified } from '@/components/VerifiedBadge'

interface ListData {
  id: string; user_id: string; title: string; description: string | null
  tags: string[]; is_public: boolean; created_at: string
}
interface ListItem {
  id: string; media_id: number; media_type: string; title: string
  poster_path: string | null; position: number
}
interface Author {
  id: string; username: string | null; display_name: string | null; avatar_url: string | null
}
interface Comment {
  id: string; user_id: string; content: string; created_at: string
  author: Author | null
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ListPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = useRef(createClient()).current

  const [list,     setList]     = useState<ListData | null>(null)
  const [items,    setItems]    = useState<ListItem[]>([])
  const [author,   setAuthor]   = useState<Author | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [likeCount, setLikeCount] = useState(0)
  const [liked,     setLiked]    = useState(false)
  const [likeBusy,  setLikeBusy] = useState(false)
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    async function load() {
      const [authRes, listRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('lists').select('*').eq('id', id).maybeSingle(),
      ])
      const uid = authRes.data.user?.id ?? null
      setCurrentUserId(uid)

      if (!listRes.data) { setNotFound(true); setLoading(false); return }
      const listData = listRes.data as ListData
      setList(listData)

      const [itemsRes, authorRes, likesRes, commentsRes] = await Promise.all([
        supabase.from('list_items').select('*').eq('list_id', id).order('position').limit(1000),
        supabase.from('profiles').select('id,username,display_name,avatar_url').eq('id', listData.user_id).maybeSingle(),
        supabase.from('list_likes').select('user_id').eq('list_id', id),
        supabase.from('list_comments').select('*').eq('list_id', id).order('created_at'),
      ])

      setItems((itemsRes.data ?? []) as ListItem[])
      setAuthor(authorRes.data as Author | null)
      setLikeCount((likesRes.data ?? []).length)
      setLiked(!!(uid && (likesRes.data ?? []).some((l: { user_id: string }) => l.user_id === uid)))

      // Load comments with authors
      const commentRows = (commentsRes.data ?? []) as Comment[]
      const userIds = [...new Set(commentRows.map(c => c.user_id))]
      let profileMap: Record<string, Author> = {}
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles')
          .select('id,username,display_name,avatar_url').in('id', userIds)
        profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))
      }
      setComments(commentRows.map(c => ({ ...c, author: profileMap[c.user_id] ?? null })))

      // Watched items for progress
      if (uid && itemsRes.data?.length) {
        const ids = (itemsRes.data as ListItem[]).map(i => i.media_id)
        const { data: watched } = await supabase.from('watched')
          .select('media_id,media_type')
          .eq('user_id', uid)
          .in('media_id', ids)
        setWatchedIds(new Set((watched ?? []).map(w => `${w.media_type}:${w.media_id}`)))
      }
      setLoading(false)
    }
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLike = async () => {
    if (!currentUserId || likeBusy) return
    setLikeBusy(true)
    if (liked) {
      await supabase.from('list_likes').delete().eq('list_id', id).eq('user_id', currentUserId)
      setLiked(false); setLikeCount(c => c - 1)
    } else {
      await supabase.from('list_likes').insert({ list_id: id, user_id: currentUserId })
      setLiked(true); setLikeCount(c => c + 1)
    }
    setLikeBusy(false)
  }

  const submitComment = async () => {
    if (!currentUserId || !newComment.trim() || submitting) return
    setSubmitting(true)
    const { data } = await supabase.from('list_comments')
      .insert({ list_id: id, user_id: currentUserId, content: newComment.trim() })
      .select('*').single()
    if (data) {
      const { data: profile } = await supabase.from('profiles')
        .select('id,username,display_name,avatar_url').eq('id', currentUserId).maybeSingle()
      setComments(prev => [...prev, { ...(data as Comment), author: profile as Author | null }])
      setNewComment('')
    }
    setSubmitting(false)
  }

  const deleteComment = async (cId: string) => {
    await supabase.from('list_comments').delete().eq('id', cId).eq('user_id', currentUserId!)
    setComments(prev => prev.filter(c => c.id !== cId))
  }

  if (loading) return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <div className="w-8 h-8 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (notFound || !list) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
      <p className="text-[#A0A0B0]">Esta lista no existe o es privada.</p>
      <Link href="/listas" className="text-[#FFFD02] hover:underline">Ver todas las listas</Link>
    </div>
  )

  const isOwner = currentUserId === list.user_id
  const watchedCount = items.filter(i => watchedIds.has(`${i.media_type}:${i.media_id}`)).length
  const pct = items.length > 0 ? Math.round((watchedCount / items.length) * 100) : 0

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back */}
      <Link href="/listas" className="inline-flex items-center gap-1.5 text-[#A0A0B0] hover:text-white mb-6 transition-colors text-sm">
        <ArrowLeft size={15} /> Todas las listas
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 mb-4">
          <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight">{list.title}</h1>
          {isOwner && (
            <Link href={`/listas/nueva?edit=${id}`}
              className="shrink-0 flex items-center gap-1.5 text-sm text-[#A0A0B0] hover:text-white border border-[#2A2A3A] hover:border-[#FFFD02] px-3 py-1.5 rounded-lg transition-all">
              <Pencil size={13} /> Editar
            </Link>
          )}
        </div>

        {/* Author */}
        {author && (
          author.username === 'Ferlageok' ? (
            <div className="flex items-center gap-2.5 mb-4 w-fit">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/favicon.jpg" alt="Glynbox" className="w-full h-full object-cover" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-white">Glynbox</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#FFFD02', color: '#000' }}>
                  Oficial
                </span>
                <span className="text-xs text-[#A0A0B0]">{timeAgo(list.created_at)}</span>
              </div>
            </div>
          ) : (
            <Link href={`/usuario/${author.username}`} className="flex items-center gap-2.5 mb-4 group w-fit">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                {author.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={author.avatar_url} alt={author.display_name ?? ''} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#A0A0B0]">{(author.display_name ?? author.username ?? '?')[0]?.toUpperCase()}</div>
                }
              </div>
              <div>
                <span className="text-sm font-semibold text-white group-hover:text-[#FFFD02] transition-colors">{author.display_name ?? author.username}</span>
                <span className="text-xs text-[#A0A0B0] ml-2">{timeAgo(list.created_at)}</span>
              </div>
            </Link>
          )
        )}

        {list.description && <p className="text-[#A0A0B0] leading-relaxed mb-4">{list.description}</p>}

        {/* Tags */}
        {list.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {list.tags.map(tag => (
              <span key={tag} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-[#2A2A3A] text-[#A0A0B0]">
                <Tag size={10} />{tag}
              </span>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-white font-semibold">{items.length} {items.length === 1 ? 'título' : 'títulos'}</span>
          <button onClick={toggleLike} disabled={likeBusy}
            className={`flex items-center gap-1.5 transition-colors ${liked ? 'text-red-400' : 'text-[#A0A0B0] hover:text-red-400'}`}>
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
            {likeCount} {likeCount === 1 ? 'like' : 'likes'}
          </button>
          {isOwner && (
            <Link href={`/listas/nueva?edit=${id}`}
              className="flex items-center gap-1.5 text-[#A0A0B0] hover:text-[#FFFD02] transition-colors">
              <Plus size={16} /> Agregar película
            </Link>
          )}
        </div>

        {/* Progress bar (only when logged in) */}
        {currentUserId && items.length > 0 && (
          <div className="mt-5 p-4 bg-[#13131A] border border-[#2A2A3A] rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-white font-medium">Tu progreso</p>
              <span className="text-sm font-bold text-[#FFFD02]">{pct}%</span>
            </div>
            <div className="w-full h-2 bg-[#1C1C27] rounded-full overflow-hidden mb-1.5">
              <div className="h-full rounded-full transition-all duration-700 bg-[#FFFD02]" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-[#A0A0B0]">
              Viste {watchedCount} de {items.length} {items.length === 1 ? 'título' : 'títulos'} de esta lista
            </p>
          </div>
        )}
      </div>

      {/* Grid */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-[#A0A0B0]">
          {isOwner ? (
            <div className="flex flex-col items-center gap-3">
              <p>Esta lista está vacía.</p>
              <Link href={`/listas/nueva?edit=${id}`}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-black bg-[#FFFD02] hover:bg-[#E5EB00] transition-colors">
                <Plus size={16} /> Agregar películas
              </Link>
            </div>
          ) : <p>Esta lista no tiene títulos todavía.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 mb-12">
          {items.map(item => {
            const seen = watchedIds.has(`${item.media_type}:${item.media_id}`)
            return (
              <Link key={item.id} href={`/${item.media_type}/${item.media_id}`} className="group relative">
                <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27]">
                  {item.poster_path ? (
                    <Image src={getPosterUrl(item.poster_path, 'w185')} alt={item.title} fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="160px" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#A0A0B0] text-[10px] text-center p-1">{item.title}</div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {seen && <Eye size={20} className="text-[#FFFD02]" />}
                  </div>
                  {/* Seen badge */}
                  {seen && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#FFFD02]/20 border border-[#FFFD02]/60 flex items-center justify-center">
                      <Eye size={10} className="text-[#FFFD02]" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-tight group-hover:text-white transition-colors">{item.title}</p>
              </Link>
            )
          })}
        </div>
      )}

      {/* Comments */}
      <div className="border-t border-[#2A2A3A] pt-8">
        <h2 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
          <MessageCircle size={18} /> {comments.length > 0 ? `${comments.length} comentarios` : 'Comentarios'}
        </h2>

        {currentUserId && (
          <div className="flex gap-3 mb-6">
            <textarea
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Escribí un comentario..."
              rows={2}
              className="flex-1 bg-[#13131A] border border-[#2A2A3A] focus:border-[#FFFD02] rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none resize-none transition-colors"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
            />
            <button onClick={submitComment} disabled={!newComment.trim() || submitting}
              className="px-4 py-2 rounded-xl bg-[#FFFD02] hover:bg-[#E5EB00] disabled:opacity-40 text-black text-sm font-semibold transition-colors self-end">
              <Send size={16} />
            </button>
          </div>
        )}

        {comments.length === 0 && (
          <p className="text-[#A0A0B0] text-sm text-center py-6">Sin comentarios todavía.</p>
        )}

        <div className="space-y-4">
          {comments.map(c => {
            const name = c.author?.display_name ?? c.author?.username ?? 'Usuario'
            return (
              <div key={c.id} className="flex gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-zinc-700 shrink-0 mt-0.5">
                  {c.author?.avatar_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.author.avatar_url} alt={name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#A0A0B0]">{name[0]?.toUpperCase()}</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <Link href={`/usuario/${c.author?.username}`} className="text-sm font-semibold text-white hover:text-[#FFFD02] transition-colors">{name}</Link>
                    {isVerified(c.author?.username) && <VerifiedBadge size={13} />}
                    <span className="text-[11px] text-[#A0A0B0]">{timeAgo(c.created_at)}</span>
                    {(currentUserId === c.user_id || isOwner) && (
                      <button onClick={() => deleteComment(c.id)} className="text-zinc-700 hover:text-red-400 transition-colors ml-auto">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{c.content}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
