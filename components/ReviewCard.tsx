'use client'

import { memo, useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Heart, MessageSquare, Pencil, Trash2, Send, X, MoreVertical, Flag, Ban } from 'lucide-react'
import { getPosterUrl } from '@/lib/tmdb'
import { createClient } from '@/lib/supabase'
import StarDisplay from '@/components/StarDisplay'
import MentionTextarea from '@/components/MentionTextarea'
import ShareDropdown from '@/components/ShareDropdown'
import ReportModal from '@/components/ReportModal'
import { useBlockedUsers } from '@/lib/use-blocked-users'
import { sendNotification } from '@/lib/notify'

// Render text with @mentions as yellow links
function BodyWithMentions({ text }: { text: string }) {
  const parts = text.split(/(@\w+)/g)
  return (
    <>
      {parts.map((part, i) =>
        /^@\w+$/.test(part) ? (
          <Link key={i} href={`/usuario/${part.slice(1)}`} style={{ color: '#FFFD02' }} className="hover:underline">
            {part}
          </Link>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

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
  showPoster?: boolean
  // Review content
  rating?: number | null
  recommended: boolean
  hasSpoiler?: boolean
  body?: string | null
  date: string
  // Interaction
  likeCount: number
  likedByCurrentUser: boolean
  isOwn: boolean
  currentUserId: string | null
  onLike: () => void
  onEdit?: () => void
  onDelete?: () => void
}

function ReviewCard({
  id, authorId, authorUsername, authorDisplayName, authorAvatarUrl,
  mediaId, mediaType, mediaTitle, mediaPosterPath, showPoster = true,
  rating, recommended, hasSpoiler, body, date,
  likeCount, likedByCurrentUser, isOwn, currentUserId,
  onLike, onEdit, onDelete,
}: ReviewCardProps) {
  const supabase      = useRef(createClient()).current
  const inputRef      = useRef<HTMLTextAreaElement>(null)
  const menuRef       = useRef<HTMLDivElement>(null)
  const displayName   = authorDisplayName ?? authorUsername
  const initials      = displayName[0]?.toUpperCase() ?? '?'
  const formattedDate = new Date(date).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  const { blockUser } = useBlockedUsers()

  // ── Spoiler state ──────────────────────────────────────────────
  const [spoilerRevealed, setSpoilerRevealed] = useState(false)

  // ── Comments state ─────────────────────────────────────────────
  const [commentsOpen,    setCommentsOpen]    = useState(false)
  const [comments,        setComments]        = useState<CommentData[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsFetched, setCommentsFetched] = useState(false)
  const [newComment,      setNewComment]      = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; username: string; authorId: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // ── Menu / report / block state ────────────────────────────────
  const [menuOpen,          setMenuOpen]          = useState(false)
  const [reportOpen,        setReportOpen]        = useState(false)
  const [blockConfirm,      setBlockConfirm]      = useState(false)
  const [blockBusy,         setBlockBusy]         = useState(false)
  const [commentReport,     setCommentReport]     = useState<{ id: string; authorId: string } | null>(null)
  const [commentBlockUser,  setCommentBlockUser]  = useState<{ id: string; username: string } | null>(null)
  const [commentBlockBusy,  setCommentBlockBusy]  = useState(false)

  // Close "..." menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [menuOpen])

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
    if (nowOpen && !commentsFetched) await fetchComments()
    if (nowOpen) setTimeout(() => inputRef.current?.focus(), 100)
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

      const actorUsername = myProfile?.username ?? ''
      const actorAvatar   = myProfile?.avatar_url ?? null

      const sb = supabase as Parameters<typeof sendNotification>[0]
      if (replyTo && replyTo.authorId !== currentUserId) {
        await sendNotification(sb, {
          user_id: replyTo.authorId, actor_id: currentUserId, type: 'comment_reply',
          review_id: id, review_title: mediaTitle, actor_username: actorUsername,
          actor_avatar: actorAvatar, read: false, comment_id: replyTo.id,
        })
      } else if (!replyTo && authorId !== currentUserId) {
        await sendNotification(sb, {
          user_id: authorId, actor_id: currentUserId, type: 'review_comment',
          review_id: id, review_title: mediaTitle, actor_username: actorUsername,
          actor_avatar: actorAvatar, read: false,
        })
      }

      try {
        const mentioned = [...new Set((data.content.match(/@(\w+)/g) ?? []).map((m: string) => m.slice(1)))]
        if (mentioned.length > 0) {
          const { data: mentionedProfiles } = await supabase
            .from('profiles').select('id').in('username', mentioned)
          for (const mp of mentionedProfiles ?? []) {
            if (mp.id !== currentUserId) {
              await sendNotification(sb, {
                user_id: mp.id, actor_id: currentUserId, type: 'mention',
                review_id: id, review_title: mediaTitle, actor_username: actorUsername,
                actor_avatar: actorAvatar, read: false,
              })
            }
          }
        }
      } catch (mentionError) {
        console.error('[mention notification error]', mentionError)
      }

      setNewComment('')
      setReplyTo(null)
    }
    setSubmitting(false)
  }

  async function deleteComment(commentId: string) {
    if (!window.confirm('¿Eliminar este comentario?')) return
    await supabase.from('review_comments').delete().eq('id', commentId)
    setComments(prev => prev.filter(c => c.id !== commentId && c.parent_id !== commentId))
  }

  function startReply(comment: CommentData) {
    setReplyTo({ id: comment.id, username: comment.author?.username ?? 'usuario', authorId: comment.user_id })
    setNewComment('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  async function handleBlockAuthor() {
    setBlockBusy(true)
    await blockUser(authorId)
    setBlockConfirm(false)
    setBlockBusy(false)
  }

  async function handleBlockCommentUser() {
    if (!commentBlockUser) return
    setCommentBlockBusy(true)
    await blockUser(commentBlockUser.id)
    setCommentBlockUser(null)
    setCommentBlockBusy(false)
  }

  const topLevel   = comments.filter(c => !c.parent_id)
  const repliesMap = comments.reduce<Record<string, CommentData[]>>((acc, c) => {
    if (c.parent_id) acc[c.parent_id] = [...(acc[c.parent_id] ?? []), c]
    return acc
  }, {})
  const commentCount = comments.length

  return (
    <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="p-4 pb-3">
        <div className="flex items-start gap-3">

          {/* Avatar */}
          <Link href={`/usuario/${authorUsername}`} className="shrink-0 mt-0.5">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-700 ring-2 ring-zinc-700 hover:ring-[#FFFD02] transition-all">
              {authorAvatarUrl ? (
                <img src={authorAvatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold bg-[#2A2A3A] text-[#FFFD02] select-none">
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
                className="text-sm font-bold text-white hover:text-[#FFFD02] transition-colors"
              >
                {displayName}
              </Link>
              {(authorUsername === 'Ferlageok' || authorUsername === 'ferlageok') && (
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="10" cy="10" r="10" fill="#1D9BF0"/>
                  <path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <Link
              href={`/${mediaType}/${mediaId}`}
              className="block text-sm font-semibold text-zinc-300 hover:text-[#FFFD02] transition-colors mt-0.5 line-clamp-1"
            >
              {mediaTitle}
            </Link>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
              {rating != null && <StarDisplay rating={rating} size={12} color="text-[#F5A623]" />}
              <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                recommended ? 'bg-[#FFFD02]/10 text-[#FFFD02]' : 'bg-red-900/50 text-red-400'
              }`}>
                {recommended ? '👍 Recomendada' : '👎 No recomendada'}
              </span>
            </div>

            <p className="text-[11px] text-zinc-600 mt-1">{formattedDate}</p>
          </div>

          {/* Right column: poster + "..." menu */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {showPoster && mediaPosterPath && (
              <Link href={`/${mediaType}/${mediaId}`}>
                <div className="relative w-10 aspect-[2/3] rounded-md overflow-hidden bg-[#1C1C27] ring-1 ring-zinc-700 hover:ring-[#FFFD02] transition-all">
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

            {/* "..." context menu — shown to any logged-in user */}
            {currentUserId && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  className="text-zinc-600 hover:text-[#A0A0B0] transition-colors p-1 rounded"
                  title="Opciones"
                >
                  <MoreVertical size={15} />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-7 w-44 bg-[#1C1C27] border border-[#2A2A3A] rounded-xl shadow-2xl z-10 overflow-hidden py-1">
                    {isOwn ? (
                      <>
                        {onEdit && (
                          <button
                            onClick={() => { setMenuOpen(false); onEdit() }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-left"
                          >
                            <Pencil size={13} /> Editar reseña
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => { setMenuOpen(false); onDelete() }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-950/30 hover:text-red-300 transition-colors text-left"
                          >
                            <Trash2 size={13} /> Eliminar
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setMenuOpen(false); setReportOpen(true) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-left"
                        >
                          <Flag size={13} /> Reportar reseña
                        </button>
                        <button
                          onClick={() => { setMenuOpen(false); setBlockConfirm(true) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-left"
                        >
                          <Ban size={13} /> Bloquear usuario
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      {body && (
        <div className="px-4 pb-3">
          {hasSpoiler && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full mb-2">
              ⚠️ Spoiler
            </span>
          )}
          {hasSpoiler && !spoilerRevealed ? (
            <div className="relative rounded-lg overflow-hidden">
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap blur-sm select-none pointer-events-none line-clamp-3">
                {body}
              </p>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#13131A]/70 backdrop-blur-[2px] rounded-lg">
                <p className="text-xs text-[#A0A0B0] font-medium">Esta reseña contiene spoilers</p>
                <button
                  onClick={() => setSpoilerRevealed(true)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-full border border-zinc-600 text-zinc-300 hover:border-zinc-400 hover:text-white transition-colors"
                >
                  Ver igual
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
              <BodyWithMentions text={body} />
            </p>
          )}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div className="px-4 py-2.5 border-t border-[#2A2A3A]/80 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onLike}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              likedByCurrentUser ? 'text-red-400' : 'text-[#A0A0B0] hover:text-red-400'
            }`}
          >
            <Heart size={13} fill={likedByCurrentUser ? 'currentColor' : 'none'} />
            <span>{likeCount > 0 ? `${likeCount} me gusta` : 'Me gusta'}</span>
          </button>

          <button
            onClick={toggleComments}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
              commentsOpen ? 'text-[#FFFD02]' : 'text-[#A0A0B0] hover:text-zinc-300'
            }`}
          >
            <MessageSquare size={13} />
            <span>
              {commentsFetched && commentCount > 0
                ? `${commentCount} comentario${commentCount !== 1 ? 's' : ''}`
                : 'Comentar'}
            </span>
          </button>

          {(() => {
            const BASE = typeof window !== 'undefined' ? window.location.origin : 'https://glynbox.com'
            const reviewUrl = `${BASE}/review/${id}`
            const ratingStr = rating ? `⭐${rating}/5` : ''
            const shareText = `${authorUsername} le dio ${ratingStr} a "${mediaTitle}" en Glynbox`
            const excerpt = body ? body.slice(0, 100).trim() : ''
            const waText = encodeURIComponent(
              `${shareText}\n"${excerpt}${excerpt.length < (body?.length ?? 0) ? '...' : ''}"\n👉 ${reviewUrl}`
            )
            const stars = rating ? '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '') : ''
            const tweetText = encodeURIComponent(`Mi reseña de ${stars} de "${mediaTitle}" en @Glynboxapp`)
            return (
              <ShareDropdown
                whatsappUrl={`https://wa.me/?text=${waText}`}
                twitterUrl={`https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(reviewUrl)}`}
                copyUrl={reviewUrl}
                shareText={shareText}
                align="left"
                triggerClassName="text-[#A0A0B0] hover:text-zinc-300"
                trigger={
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                    Compartir
                  </span>
                }
                instagram={{
                  posterPath: mediaPosterPath ?? null,
                  backdropPath: null,
                  mediaTitle,
                  rating: rating ?? null,
                  body: body ?? null,
                  authorUsername,
                  authorAvatarUrl: authorAvatarUrl ?? null,
                }}
              />
            )
          })()}
        </div>
      </div>

      {/* ── Comments section ────────────────────────────────────── */}
      {commentsOpen && (
        <div className="border-t border-[#2A2A3A] bg-[#0A0A0F]/50">

          {currentUserId && (
            <div className="px-4 pt-3 pb-2">
              {replyTo && (
                <div className="flex items-center gap-1.5 mb-1.5 text-xs text-[#A0A0B0]">
                  <span>Respondiendo a <span className="text-zinc-300 font-medium">@{replyTo.username}</span></span>
                  <button onClick={() => setReplyTo(null)} className="text-zinc-600 hover:text-white transition-colors ml-1">
                    <X size={11} />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <MentionTextarea
                  textareaRef={inputRef}
                  value={newComment}
                  onChange={setNewComment}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() }
                  }}
                  placeholder={replyTo ? `Responder a @${replyTo.username}...` : 'Escribí un comentario...'}
                  rows={1}
                  className="flex-1 bg-[#1C1C27] border border-[#2A2A3A] focus:border-[#FFFD02] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none resize-none"
                />
                <button
                  onClick={submitComment}
                  disabled={!newComment.trim() || submitting}
                  className="shrink-0 bg-[#FFFD02] hover:bg-[#E5EB00] disabled:opacity-40 disabled:cursor-not-allowed text-black px-3 py-2 rounded-lg transition-colors"
                  title="Publicar"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>
          )}

          <div className="px-4 pb-3">
            {commentsLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-4 h-4 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
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
                  const isOwnComment = comment.user_id === currentUserId
                  return (
                    <div key={comment.id}>
                      {/* Top-level comment */}
                      <div className="flex gap-2.5 group/comment">
                        <Link href={`/usuario/${comment.author?.username ?? ''}`} className="shrink-0 mt-0.5">
                          <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-700">
                            {comment.author?.avatar_url ? (
                              <img src={comment.author.avatar_url} alt={cName} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold bg-[#2A2A3A] text-[#FFFD02]">
                                {cName[0]?.toUpperCase()}
                              </div>
                            )}
                          </div>
                        </Link>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <Link
                              href={`/usuario/${comment.author?.username ?? ''}`}
                              className="text-xs font-semibold text-white hover:text-[#FFFD02] transition-colors"
                            >
                              {cName}
                            </Link>
                            {(comment.author?.username === 'Ferlageok' || comment.author?.username === 'ferlageok') && (
                              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="10" cy="10" r="10" fill="#1D9BF0"/>
                                <path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                            <span className="text-[10px] text-zinc-600">{cDate}</span>

                            {/* Own comment: delete; Other's comment: report + block */}
                            {isOwnComment ? (
                              <button
                                onClick={() => deleteComment(comment.id)}
                                className="ml-auto opacity-0 group-hover/comment:opacity-100 text-[#A0A0B0] hover:text-red-400 transition-all"
                                title="Eliminar comentario"
                              >
                                <Trash2 size={11} />
                              </button>
                            ) : currentUserId ? (
                              <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover/comment:opacity-100 transition-all">
                                <button
                                  onClick={() => setCommentReport({ id: comment.id, authorId: comment.user_id })}
                                  className="text-[#A0A0B0] hover:text-[#FFFD02] transition-colors"
                                  title="Reportar comentario"
                                >
                                  <Flag size={11} />
                                </button>
                                <button
                                  onClick={() => setCommentBlockUser({ id: comment.user_id, username: comment.author?.username ?? '' })}
                                  className="text-[#A0A0B0] hover:text-red-400 transition-colors"
                                  title="Bloquear usuario"
                                >
                                  <Ban size={11} />
                                </button>
                              </div>
                            ) : null}
                          </div>
                          <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">
                            <BodyWithMentions text={comment.content} />
                          </p>
                          {currentUserId && (
                            <button
                              onClick={() => startReply(comment)}
                              className="text-[10px] text-zinc-600 hover:text-[#A0A0B0] transition-colors mt-0.5"
                            >
                              Responder
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Replies */}
                      {replies.length > 0 && (
                        <div className="ml-8 mt-2 space-y-2 border-l border-[#2A2A3A] pl-3">
                          {replies.map(reply => {
                            const rName = reply.author?.display_name ?? reply.author?.username ?? 'Usuario'
                            const rDate = new Date(reply.created_at).toLocaleDateString('es-AR', {
                              day: 'numeric', month: 'short',
                            })
                            const isOwnReply = reply.user_id === currentUserId
                            return (
                              <div key={reply.id} className="flex gap-2 group/reply">
                                <Link href={`/usuario/${reply.author?.username ?? ''}`} className="shrink-0 mt-0.5">
                                  <div className="w-5 h-5 rounded-full overflow-hidden bg-zinc-700">
                                    {reply.author?.avatar_url ? (
                                      <img src={reply.author.avatar_url} alt={rName} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[9px] font-bold bg-[#2A2A3A] text-[#FFFD02]">
                                        {rName[0]?.toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                </Link>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <Link
                                      href={`/usuario/${reply.author?.username ?? ''}`}
                                      className="text-xs font-semibold text-white hover:text-[#FFFD02] transition-colors"
                                    >
                                      {rName}
                                    </Link>
                                    {(reply.author?.username === 'Ferlageok' || reply.author?.username === 'ferlageok') && (
                                      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="10" cy="10" r="10" fill="#1D9BF0"/>
                                        <path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                    )}
                                    <span className="text-[10px] text-zinc-600">{rDate}</span>

                                    {isOwnReply ? (
                                      <button
                                        onClick={() => deleteComment(reply.id)}
                                        className="ml-auto opacity-0 group-hover/reply:opacity-100 text-[#A0A0B0] hover:text-red-400 transition-all"
                                        title="Eliminar respuesta"
                                      >
                                        <Trash2 size={10} />
                                      </button>
                                    ) : currentUserId ? (
                                      <div className="ml-auto flex items-center gap-1.5 opacity-0 group-hover/reply:opacity-100 transition-all">
                                        <button
                                          onClick={() => setCommentReport({ id: reply.id, authorId: reply.user_id })}
                                          className="text-[#A0A0B0] hover:text-[#FFFD02] transition-colors"
                                          title="Reportar comentario"
                                        >
                                          <Flag size={10} />
                                        </button>
                                        <button
                                          onClick={() => setCommentBlockUser({ id: reply.user_id, username: reply.author?.username ?? '' })}
                                          className="text-[#A0A0B0] hover:text-red-400 transition-colors"
                                          title="Bloquear usuario"
                                        >
                                          <Ban size={10} />
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                  <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">
                                    <BodyWithMentions text={reply.content} />
                                  </p>
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

      {/* ── Report modal (review) ────────────────────────────────── */}
      <ReportModal
        contentType="review"
        contentId={id}
        contentAuthorId={authorId}
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
      />

      {/* ── Report modal (comment) ───────────────────────────────── */}
      {commentReport && (
        <ReportModal
          contentType="comment"
          contentId={commentReport.id}
          contentAuthorId={commentReport.authorId}
          isOpen={true}
          onClose={() => setCommentReport(null)}
        />
      )}

      {/* ── Block review author confirm ──────────────────────────── */}
      {blockConfirm && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget && !blockBusy) setBlockConfirm(false) }}
        >
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl w-full max-w-xs shadow-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-white">¿Bloquear a @{authorUsername}?</p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              No verás más su contenido y no podrá interactuar con vos.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setBlockConfirm(false)}
                disabled={blockBusy}
                className="flex-1 py-2 rounded-lg border border-[#2A2A3A] text-sm text-zinc-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={handleBlockAuthor}
                disabled={blockBusy}
                className="flex-1 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm text-white font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {blockBusy
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Ban size={13} /> Bloquear</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Block comment author confirm ─────────────────────────── */}
      {commentBlockUser && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget && !commentBlockBusy) setCommentBlockUser(null) }}
        >
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl w-full max-w-xs shadow-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-white">
              ¿Bloquear a @{commentBlockUser.username}?
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">
              No verás más su contenido y no podrá interactuar con vos.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setCommentBlockUser(null)}
                disabled={commentBlockBusy}
                className="flex-1 py-2 rounded-lg border border-[#2A2A3A] text-sm text-zinc-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={handleBlockCommentUser}
                disabled={commentBlockBusy}
                className="flex-1 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm text-white font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {commentBlockBusy
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Ban size={13} /> Bloquear</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(ReviewCard)
