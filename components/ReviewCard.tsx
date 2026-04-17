'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Heart, MessageSquare, Pencil, Trash2, Send, X } from 'lucide-react'
import { getPosterUrl } from '@/lib/tmdb'
import { createClient } from '@/lib/supabase'
import VerifiedBadge, { isVerified } from '@/components/VerifiedBadge'
import StarDisplay from '@/components/StarDisplay'

// ── Comment types ──────────────────────────────────────────────────────────

interface CommentData {
  id: string
  user_id: string
  parent_id: string | null
  content: string
  created_at: string
  author: {
    username: string | null
    display_name: string | null
    avatar_url: string | null
  } | null
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface ReviewCardProps {
  id: string
  // Author
  authorId: string
  authorUsername: string
  authorDisplayName?: string | null
  authorAvatarUrl?: string | null
  // Media
  mediaId: number
  mediaType: 'movie' | 'tv'
  mediaTitle: string
  mediaPosterPath?: string | null
  showPoster?: boolean   // default true — pass false on movie/tv detail pages
  // Review content
  rating?: number | null
  recommended: boolean
  body?: string | null
  date: string          // ISO string (created_at or watched_at)
  // Interaction
  likeCount: number
  likedByCurrentUser: boolean
  isOwn: boolean
  currentUserId: string | null
  onLike: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export default function ReviewCard({
  id, authorId, authorUsername, authorDisplayName, authorAvatarUrl,
  mediaId, mediaType, mediaTitle, mediaPosterPath, showPoster = true,
  rating, recommended, body, date,
  likeCount, likedByCurrentUser, isOwn, currentUserId,
  onLike, onEdit, onDelete,
}: ReviewCardProps) {
  const supabase      = useRef(createClient()).current
  const inputRef      = useRef<HTMLTextAreaElement>(null)
  const displayName   = authorDisplayName ?? authorUsername
  const initials      = displayName[0]?.toUpperCase() ?? '?'
  const formattedDate = new Date(date).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  // ── Comments state ─────────────────────────────────────────────
  const [commentsOpen,    setCommentsOpen]    = useState(false)
  const [comments,        setComments]        = useState<CommentData[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsFetched, setCommentsFetched] = useState(false)
  const [newComment,      setNewComment]      = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; username: string; authorId: string } | null>(null)
  const [submitting,      setSubmitting]      = useState(false)

  async function fetchComments() {
    setCommentsLoading(true)
    const { data } = await supabase
      .from('review_comments')
      .select('id, user_id, parent_id, content, created_at')
      .eq('review_id', id)
      .order('created_at', { ascending: true })

    if (!data?.length) {
      setCommentsLoading(false)
      setCommentsFetched(true)
      return
    }

    const userIds = [...new Set(data.map(c => c.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds)
    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

    setComments(data.map(c => ({ ...c, author: profileMap[c.user_id] ?? null })))
    setCommentsLoading(false)
    setCommentsFetched(true)
  }

  async function toggleComments() {
    const nowOpen = !commentsOpen
    setCommentsOpen(nowOpen)
    if (nowOpen && !commentsFetched) {
      await fetchComments()
    }
    if (nowOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  async function submitComment() {
    if (!currentUserId || !newComment.trim() || submitting) return
    setSubmitting(true)

    const { data, error } = await supabase
      .from('review_comments')
      .insert({
        review_id: id,
        user_id:   currentUserId,
        parent_id: replyTo?.id ?? null,
        content:   newComment.trim(),
      })
      .select('id, user_id, parent_id, content, created_at')
      .single()

    if (!error && data) {
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', currentUserId)
        .maybeSingle()

      setComments(prev => [...prev, { ...data, author: myProfile ?? null }])

      // Notifications (fire-and-forget)
      if (replyTo && replyTo.authorId !== currentUserId) {
        supabase.from('notifications').insert({
          user_id:      replyTo.authorId,
          actor_id:     currentUserId,
          type:         'comment_reply',
          review_id:    id,
          review_title: mediaTitle,
          comment_id:   replyTo.id,
        })
      } else if (!replyTo && authorId !== currentUserId) {
        supabase.from('notifications').insert({
          user_id:      authorId,
          actor_id:     currentUserId,
          type:         'review_comment',
          review_id:    id,
          review_title: mediaTitle,
        })
      }

      setNewComment('')
      setReplyTo(null)
    }
    setSubmitting(false)
  }

  function startReply(comment: CommentData) {
    setReplyTo({
      id:       comment.id,
      username: comment.author?.username ?? 'usuario',
      authorId: comment.user_id,
    })
    setNewComment('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // Build flat tree: top-level comments + replies map
  const topLevel  = comments.filter(c => !c.parent_id)
  const repliesMap = comments.reduce<Record<string, CommentData[]>>((acc, c) => {
    if (c.parent_id) acc[c.parent_id] = [...(acc[c.parent_id] ?? []), c]
    return acc
  }, {})
  const commentCount = comments.length

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">

          {/* Avatar */}
          <Link href={`/usuario/${authorUsername}`} className="shrink-0 mt-0.5">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-700 ring-2 ring-zinc-700 hover:ring-emerald-500 transition-all">
              {authorAvatarUrl ? (
                <img src={authorAvatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-400 select-none">
                  {initials}
                </div>
              )}
            </div>
          </Link>

          {/* Name + media title + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <Link
                href={`/usuario/${authorUsername}`}
                className="text-sm font-bold text-white hover:text-emerald-400 transition-colors"
              >
                {displayName}
              </Link>
              {isVerified(authorUsername) && <VerifiedBadge />}
            </div>
            <Link
              href={`/${mediaType}/${mediaId}`}
              className="block text-sm font-semibold text-zinc-300 hover:text-emerald-400 transition-colors mt-0.5 line-clamp-1"
            >
              {mediaTitle}
            </Link>

            {/* Stars + recommended */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              {rating != null && (
                <StarDisplay rating={rating} size={12} color="text-emerald-400" />
              )}
              <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                recommended
                  ? 'bg-emerald-900/50 text-emerald-400'
                  : 'bg-red-900/50 text-red-400'
              }`}>
                {recommended ? '👍 Recomendada' : '👎 No recomendada'}
              </span>
            </div>

            <p className="text-[11px] text-zinc-600 mt-1">{formattedDate}</p>
          </div>

          {/* Right column: poster (optional) + owner actions */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {showPoster && mediaPosterPath && (
              <Link href={`/${mediaType}/${mediaId}`}>
                <div className="relative w-10 aspect-[2/3] rounded-md overflow-hidden bg-zinc-800 ring-1 ring-zinc-700 hover:ring-emerald-500 transition-all">
                  <Image
                    src={getPosterUrl(mediaPosterPath, 'w92')}
                    alt={mediaTitle}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                </div>
              </Link>
            )}
            {isOwn && (
              <div className="flex items-center gap-1.5">
                {onEdit && (
                  <button
                    onClick={onEdit}
                    className="text-zinc-600 hover:text-white transition-colors"
                    title="Editar reseña"
                  >
                    <Pencil size={13} />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="text-zinc-600 hover:text-red-400 transition-colors"
                    title="Eliminar reseña"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      {body && (
        <div className="px-4 pb-3">
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{body}</p>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-t border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onLike}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              likedByCurrentUser ? 'text-red-400' : 'text-zinc-500 hover:text-red-400'
            }`}
          >
            <Heart size={13} fill={likedByCurrentUser ? 'currentColor' : 'none'} />
            <span>
              {likeCount > 0 ? `${likeCount} me gusta` : 'Me gusta'}
            </span>
          </button>

          <button
            onClick={toggleComments}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              commentsOpen ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <MessageSquare size={13} />
            <span>
              {commentsFetched && commentCount > 0
                ? `${commentCount} comentario${commentCount !== 1 ? 's' : ''}`
                : 'Comentar'}
            </span>
          </button>
        </div>
      </div>

      {/* ── Comments section ────────────────────────────────────── */}
      {commentsOpen && (
        <div className="border-t border-zinc-800 bg-zinc-950/50">

          {/* Comment input */}
          {currentUserId && (
            <div className="px-4 pt-3 pb-2">
              {replyTo && (
                <div className="flex items-center gap-1.5 mb-1.5 text-xs text-zinc-500">
                  <span>
                    Respondiendo a{' '}
                    <span className="text-zinc-300 font-medium">@{replyTo.username}</span>
                  </span>
                  <button
                    onClick={() => setReplyTo(null)}
                    className="text-zinc-600 hover:text-white transition-colors ml-1"
                  >
                    <X size={11} />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  ref={inputRef}
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() }
                  }}
                  placeholder={replyTo ? `Responder a @${replyTo.username}...` : 'Escribí un comentario...'}
                  rows={1}
                  className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none resize-none"
                />
                <button
                  onClick={submitComment}
                  disabled={!newComment.trim() || submitting}
                  className="shrink-0 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg transition-colors"
                  title="Publicar"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>
          )}

          {/* Comments list */}
          <div className="px-4 pb-3">
            {commentsLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : topLevel.length === 0 && commentsFetched ? (
              !currentUserId ? (
                <p className="text-xs text-zinc-600 text-center py-2">Sin comentarios todavía.</p>
              ) : null
            ) : (
              <div className="space-y-3 mt-1">
                {topLevel.map(comment => {
                  const replies = repliesMap[comment.id] ?? []
                  const cName   = comment.author?.display_name ?? comment.author?.username ?? 'Usuario'
                  const cDate   = new Date(comment.created_at).toLocaleDateString('es-AR', {
                    day: 'numeric', month: 'short',
                  })
                  return (
                    <div key={comment.id}>
                      {/* Top-level comment */}
                      <div className="flex gap-2.5">
                        <Link href={`/usuario/${comment.author?.username ?? ''}`} className="shrink-0 mt-0.5">
                          <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-700">
                            {comment.author?.avatar_url ? (
                              <img src={comment.author.avatar_url} alt={cName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-zinc-400">
                                {cName[0]?.toUpperCase()}
                              </div>
                            )}
                          </div>
                        </Link>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <Link
                              href={`/usuario/${comment.author?.username ?? ''}`}
                              className="text-xs font-semibold text-white hover:text-emerald-400 transition-colors"
                            >
                              {cName}
                            </Link>
                            {isVerified(comment.author?.username) && <VerifiedBadge size={12} />}
                            <span className="text-[10px] text-zinc-600">{cDate}</span>
                          </div>
                          <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">{comment.content}</p>
                          {currentUserId && (
                            <button
                              onClick={() => startReply(comment)}
                              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors mt-0.5"
                            >
                              Responder
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Replies (indented) */}
                      {replies.length > 0 && (
                        <div className="ml-8 mt-2 space-y-2 border-l border-zinc-800 pl-3">
                          {replies.map(reply => {
                            const rName = reply.author?.display_name ?? reply.author?.username ?? 'Usuario'
                            const rDate = new Date(reply.created_at).toLocaleDateString('es-AR', {
                              day: 'numeric', month: 'short',
                            })
                            return (
                              <div key={reply.id} className="flex gap-2">
                                <Link href={`/usuario/${reply.author?.username ?? ''}`} className="shrink-0 mt-0.5">
                                  <div className="w-5 h-5 rounded-full overflow-hidden bg-zinc-700">
                                    {reply.author?.avatar_url ? (
                                      <img src={reply.author.avatar_url} alt={rName} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-zinc-400">
                                        {rName[0]?.toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                </Link>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <Link
                                      href={`/usuario/${reply.author?.username ?? ''}`}
                                      className="text-xs font-semibold text-white hover:text-emerald-400 transition-colors"
                                    >
                                      {rName}
                                    </Link>
                                    {isVerified(reply.author?.username) && <VerifiedBadge size={12} />}
                                    <span className="text-[10px] text-zinc-600">{rDate}</span>
                                  </div>
                                  <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">{reply.content}</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
