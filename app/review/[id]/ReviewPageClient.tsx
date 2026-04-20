'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Heart, Link2, MessageSquare, Send, Share2, X } from 'lucide-react'
import { getPosterUrl } from '@/lib/tmdb'
import { createClient } from '@/lib/supabase'
import VerifiedBadge, { isVerified } from '@/components/VerifiedBadge'
import StarDisplay from '@/components/StarDisplay'

// ── Types ──────────────────────────────────────────────────────────────────

interface ReviewData {
  id: string
  authorId: string
  authorUsername: string
  authorDisplayName: string | null
  authorAvatarUrl: string | null
  mediaId: number
  mediaType: 'movie' | 'tv'
  mediaTitle: string
  mediaPosterPath: string | null
  mediaYear: string | null
  rating: number | null
  recommended: boolean
  body: string | null
  date: string
}

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

interface Props {
  review: ReviewData
  initialLikeCount: number
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ReviewPageClient({ review, initialLikeCount }: Props) {
  const supabase    = useRef(createClient()).current
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const router      = useRouter()
  const displayName = review.authorDisplayName ?? review.authorUsername
  const initials    = displayName[0]?.toUpperCase() ?? '?'

  const formattedDate = new Date(review.date).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  // ── Auth & like state ──────────────────────────────────────────
  const [currentUserId,    setCurrentUserId]    = useState<string | null>(null)
  const [likeCount,        setLikeCount]        = useState(initialLikeCount)
  const [liked,            setLiked]            = useState(false)
  const [likeBusy,         setLikeBusy]         = useState(false)

  // ── Share state ────────────────────────────────────────────────
  const [shareOpen,   setShareOpen]   = useState(false)
  const [linkCopied,  setLinkCopied]  = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!shareOpen) return
    const handler = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [shareOpen])

  function shareWhatsApp() {
    const url  = window.location.href
    const text = `${review.authorUsername} le dio ${review.rating ?? '?'}⭐ a "${review.mediaTitle}" en StreamFinder\n"${(review.body ?? '').slice(0, 100)}..."\n👉 ${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
    setShareOpen(false)
  }

  function shareTwitter() {
    const url  = window.location.href
    const text = `Le di ${review.rating ?? '?'}⭐ a "${review.mediaTitle}" en #StreamFinder\n"${(review.body ?? '').slice(0, 80)}..."`
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank')
    setShareOpen(false)
  }

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href)
    setLinkCopied(true)
    setTimeout(() => { setLinkCopied(false); setShareOpen(false) }, 1500)
  }

  // ── Comments state ─────────────────────────────────────────────
  const [commentsOpen,    setCommentsOpen]    = useState(false)
  const [comments,        setComments]        = useState<CommentData[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsFetched, setCommentsFetched] = useState(false)
  const [newComment,      setNewComment]      = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; username: string; authorId: string } | null>(null)
  const [submitting,      setSubmitting]      = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null
      setCurrentUserId(uid)
      if (uid) {
        supabase.from('review_likes')
          .select('user_id')
          .eq('review_id', review.id)
          .eq('user_id', uid)
          .maybeSingle()
          .then(({ data: row }) => setLiked(!!row))
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggleLike() {
    if (!currentUserId || likeBusy) return
    setLikeBusy(true)
    if (liked) {
      await supabase.from('review_likes').delete().eq('review_id', review.id).eq('user_id', currentUserId)
      setLiked(false)
      setLikeCount(c => c - 1)
    } else {
      await supabase.from('review_likes').insert({ review_id: review.id, user_id: currentUserId })
      setLiked(true)
      setLikeCount(c => c + 1)
    }
    setLikeBusy(false)
  }

  async function fetchComments() {
    setCommentsLoading(true)
    const { data } = await supabase
      .from('review_comments')
      .select('id, user_id, parent_id, content, created_at')
      .eq('review_id', review.id)
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
    if (nowOpen) setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function submitComment() {
    if (!currentUserId || !newComment.trim() || submitting) return
    setSubmitting(true)

    const { data, error } = await supabase
      .from('review_comments')
      .insert({
        review_id: review.id,
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

      if (replyTo && replyTo.authorId !== currentUserId) {
        supabase.from('notifications').insert({
          user_id:      replyTo.authorId,
          actor_id:     currentUserId,
          type:         'comment_reply',
          review_id:    review.id,
          review_title: review.mediaTitle,
          comment_id:   replyTo.id,
        })
      } else if (!replyTo && review.authorId !== currentUserId) {
        supabase.from('notifications').insert({
          user_id:      review.authorId,
          actor_id:     currentUserId,
          type:         'review_comment',
          review_id:    review.id,
          review_title: review.mediaTitle,
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

  const topLevel   = comments.filter(c => !c.parent_id)
  const repliesMap = comments.reduce<Record<string, CommentData[]>>((acc, c) => {
    if (c.parent_id) acc[c.parent_id] = [...(acc[c.parent_id] ?? []), c]
    return acc
  }, {})
  const commentCount = comments.length

  return (
    <div className="min-h-screen bg-zinc-950 py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* ── Back button ─────────────────────────────────────── */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Volver
        </button>

        {/* ── Main card ───────────────────────────────────────── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">

          {/* Header */}
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">

              {/* Author info */}
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Link href={`/usuario/${review.authorUsername}`} className="shrink-0">
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-zinc-700 ring-2 ring-zinc-700 hover:ring-emerald-500 transition-all">
                    {review.authorAvatarUrl ? (
                      <img src={review.authorAvatarUrl} alt={displayName} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-base font-bold text-zinc-400 select-none">
                        {initials}
                      </div>
                    )}
                  </div>
                </Link>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/usuario/${review.authorUsername}`}
                      className="text-base font-bold text-white hover:text-emerald-400 transition-colors"
                    >
                      {displayName}
                    </Link>
                    {isVerified(review.authorUsername) && <VerifiedBadge />}
                  </div>
                  <p className="text-xs text-zinc-500">@{review.authorUsername}</p>
                </div>
              </div>

              {/* Poster thumbnail */}
              {review.mediaPosterPath && (
                <Link href={`/${review.mediaType}/${review.mediaId}`} className="shrink-0">
                  <div className="relative w-16 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-800 ring-1 ring-zinc-700 hover:ring-emerald-500 transition-all">
                    <Image
                      src={getPosterUrl(review.mediaPosterPath, 'w185')}
                      alt={review.mediaTitle}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </div>
                </Link>
              )}
            </div>

            {/* Movie title + year */}
            <div className="mt-4 mb-3">
              <Link
                href={`/${review.mediaType}/${review.mediaId}`}
                className="text-xl font-bold text-white hover:text-emerald-400 transition-colors"
              >
                {review.mediaTitle}
              </Link>
              {review.mediaYear && (
                <span className="ml-2 text-base text-zinc-500 font-normal">{review.mediaYear}</span>
              )}
            </div>

            {/* Stars + recommended */}
            <div className="flex flex-wrap items-center gap-3 mb-2">
              {review.rating != null && (
                <StarDisplay rating={review.rating} size={16} color="text-emerald-400" />
              )}
              <span className={`inline-flex items-center text-xs px-2 py-1 rounded-full font-medium ${
                review.recommended ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
              }`}>
                {review.recommended ? '👍 Recomendada' : '👎 No recomendada'}
              </span>
            </div>

            {/* Date */}
            <p className="text-xs text-zinc-600">{formattedDate}</p>
          </div>

          {/* Review body */}
          {review.body && (
            <div className="px-6 pb-6">
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{review.body}</p>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-zinc-800" />

          {/* Footer: likes + comments */}
          <div className="px-6 py-4 flex items-center gap-6">
            <button
              onClick={toggleLike}
              disabled={!currentUserId || likeBusy}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                liked ? 'text-red-400' : 'text-zinc-500 hover:text-red-400'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
              <span>{likeCount > 0 ? `${likeCount} me gusta` : 'Me gusta'}</span>
            </button>

            <button
              onClick={toggleComments}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                commentsOpen ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <MessageSquare size={16} />
              <span>
                {commentsFetched && commentCount > 0
                  ? `${commentCount} comentario${commentCount !== 1 ? 's' : ''}`
                  : 'Comentar'}
              </span>
            </button>

            <div className="relative" ref={shareRef}>
              <button
                onClick={() => setShareOpen(v => !v)}
                className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Share2 size={16} />
                Compartir
              </button>

              {shareOpen && (
                <div className="absolute right-0 bottom-full mb-2 z-50 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
                  <button
                    onClick={shareWhatsApp}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors text-left"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-emerald-400 shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                    </svg>
                    Compartir en WhatsApp
                  </button>

                  <button
                    onClick={shareTwitter}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors text-left border-t border-zinc-700/50"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.635L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
                    </svg>
                    Compartir en X
                  </button>

                  <button
                    onClick={copyLink}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors text-left border-t border-zinc-700/50"
                  >
                    <Link2 size={14} className="shrink-0 text-zinc-400" />
                    {linkCopied ? '¡Link copiado!' : 'Copiar link'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Comments section ──────────────────────────────── */}
          {commentsOpen && (
            <div className="border-t border-zinc-800 bg-zinc-950/40">

              {/* Input */}
              {currentUserId && (
                <div className="px-6 pt-4 pb-3">
                  {replyTo && (
                    <div className="flex items-center gap-1.5 mb-2 text-xs text-zinc-500">
                      <span>
                        Respondiendo a{' '}
                        <span className="text-zinc-300 font-medium">@{replyTo.username}</span>
                      </span>
                      <button
                        onClick={() => setReplyTo(null)}
                        className="text-zinc-600 hover:text-white transition-colors ml-1"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <textarea
                      ref={inputRef}
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() }
                      }}
                      placeholder={replyTo ? `Responder a @${replyTo.username}...` : 'Escribí un comentario...'}
                      rows={2}
                      className="flex-1 bg-zinc-800 border border-zinc-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none resize-none"
                    />
                    <button
                      onClick={submitComment}
                      disabled={!newComment.trim() || submitting}
                      className="shrink-0 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl transition-colors self-end"
                      title="Publicar"
                    >
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              )}

              {/* List */}
              <div className="px-6 pb-5">
                {commentsLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : topLevel.length === 0 && commentsFetched ? (
                  <p className="text-sm text-zinc-600 text-center py-4">Sin comentarios todavía.</p>
                ) : (
                  <div className="space-y-4">
                    {topLevel.map(comment => {
                      const replies = repliesMap[comment.id] ?? []
                      const cName   = comment.author?.display_name ?? comment.author?.username ?? 'Usuario'
                      const cDate   = new Date(comment.created_at).toLocaleDateString('es-AR', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })
                      return (
                        <div key={comment.id}>
                          <div className="flex gap-3">
                            <Link href={`/usuario/${comment.author?.username ?? ''}`} className="shrink-0 mt-0.5">
                              <div className="w-7 h-7 rounded-full overflow-hidden bg-zinc-700">
                                {comment.author?.avatar_url ? (
                                  <img src={comment.author.avatar_url} alt={cName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs font-bold text-zinc-400">
                                    {cName[0]?.toUpperCase()}
                                  </div>
                                )}
                              </div>
                            </Link>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 flex-wrap">
                                <Link
                                  href={`/usuario/${comment.author?.username ?? ''}`}
                                  className="text-sm font-semibold text-white hover:text-emerald-400 transition-colors"
                                >
                                  {cName}
                                </Link>
                                {isVerified(comment.author?.username) && <VerifiedBadge size={14} />}
                                <span className="text-xs text-zinc-600">{cDate}</span>
                              </div>
                              <p className="text-sm text-zinc-300 mt-0.5 leading-relaxed">{comment.content}</p>
                              {currentUserId && (
                                <button
                                  onClick={() => startReply(comment)}
                                  className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mt-1"
                                >
                                  Responder
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Replies */}
                          {replies.length > 0 && (
                            <div className="ml-10 mt-3 space-y-3 border-l-2 border-zinc-800 pl-4">
                              {replies.map(reply => {
                                const rName = reply.author?.display_name ?? reply.author?.username ?? 'Usuario'
                                const rDate = new Date(reply.created_at).toLocaleDateString('es-AR', {
                                  day: 'numeric', month: 'short',
                                })
                                return (
                                  <div key={reply.id} className="flex gap-2.5">
                                    <Link href={`/usuario/${reply.author?.username ?? ''}`} className="shrink-0 mt-0.5">
                                      <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-700">
                                        {reply.author?.avatar_url ? (
                                          <img src={reply.author.avatar_url} alt={rName} className="w-full h-full object-cover" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-zinc-400">
                                            {rName[0]?.toUpperCase()}
                                          </div>
                                        )}
                                      </div>
                                    </Link>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <Link
                                          href={`/usuario/${reply.author?.username ?? ''}`}
                                          className="text-sm font-semibold text-white hover:text-emerald-400 transition-colors"
                                        >
                                          {rName}
                                        </Link>
                                        {isVerified(reply.author?.username) && <VerifiedBadge size={14} />}
                                        <span className="text-xs text-zinc-600">{rDate}</span>
                                      </div>
                                      <p className="text-sm text-zinc-300 mt-0.5 leading-relaxed">{reply.content}</p>
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
      </div>
    </div>
  )
}
