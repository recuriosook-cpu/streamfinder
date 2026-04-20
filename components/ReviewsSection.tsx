'use client'

import { useState, useEffect } from 'react'
import { ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import ReviewCard from '@/components/ReviewCard'
import MentionTextarea from '@/components/MentionTextarea'
import { StarIcon } from '@/components/StarDisplay'

// ── Types ──────────────────────────────────────────────────────────────────

interface Profile { id: string; username: string | null; display_name: string | null; avatar_url: string | null }
interface Like    { user_id: string }

interface RawReview {
  id: string; user_id: string; media_id: number; media_type: 'movie' | 'tv'
  title: string; poster_path: string | null; rating: number | null
  body: string | null; recommended: boolean; has_spoiler: boolean; created_at: string
  review_likes: Like[]
}

interface Review extends RawReview {
  profile: Profile
}

interface Props {
  mediaId: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string | null
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ReviewsSection({ mediaId, mediaType, title, posterPath }: Props) {
  const supabase = createClient()

  const [reviews, setReviews]                 = useState<Review[]>([])
  const [currentUserId, setCurrentUserId]     = useState<string | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [showForm, setShowForm]               = useState(false)
  const [editingId, setEditingId]             = useState<string | null>(null)
  const [formRating, setFormRating]           = useState(0)
  const [hoverRating, setHoverRating]         = useState(0)
  const [formBody, setFormBody]               = useState('')
  const [formRecommended, setFormRecommended] = useState(true)
  const [formHasSpoiler, setFormHasSpoiler]   = useState(false)
  const [submitting, setSubmitting]           = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null))
    loadReviews()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, mediaType])

  async function loadReviews() {
    setLoading(true)

    // Step 1 — fetch the 10 most recent reviews + their like rows
    const { data: raw, error } = await supabase
      .from('reviews')
      .select('id, user_id, media_id, media_type, title, poster_path, rating, body, recommended, has_spoiler, created_at, review_likes(user_id)')
      .eq('media_id', mediaId)
      .eq('media_type', mediaType)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error || !raw) { setLoading(false); return }

    // Step 2 — fetch author profiles in one query
    const userIds = [...new Set((raw as RawReview[]).map(r => r.user_id))]
    const profileMap: Record<string, Profile> = {}

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', userIds)
      for (const p of (profiles ?? []) as Profile[]) {
        profileMap[p.id] = p
      }
    }

    // Step 3 — merge
    const merged: Review[] = (raw as RawReview[]).map(r => ({
      ...r,
      profile: profileMap[r.user_id] ?? { id: r.user_id, username: null, avatar_url: null },
    }))

    setReviews(merged)
    setLoading(false)
  }

  const myReview = reviews.find(r => r.user_id === currentUserId)

  function openForm(review?: Review) {
    if (review) {
      setEditingId(review.id)
      setFormRating(review.rating ?? 0)
      setFormBody(review.body ?? '')
      setFormRecommended(review.recommended)
      setFormHasSpoiler(review.has_spoiler ?? false)
    } else {
      setEditingId(null)
      setFormRating(0)
      setFormBody('')
      setFormRecommended(true)
      setFormHasSpoiler(false)
    }
    setShowForm(true)
  }

  async function submitReview() {
    if (!currentUserId || formRating === 0) return
    setSubmitting(true)
    const payload = {
      user_id:     currentUserId,
      media_id:    mediaId,
      media_type:  mediaType,
      title,
      poster_path: posterPath,
      rating:      formRating,
      body:        formBody.trim() || null,
      recommended: formRecommended,
      has_spoiler: formHasSpoiler,
      created_at:  new Date().toISOString(),
    }

    let reviewId: string | null = editingId
    if (editingId) {
      const { error } = await supabase.from('reviews').update(payload).eq('id', editingId)
      if (error) { console.error('[submitReview]', error); setSubmitting(false); return }
    } else {
      const { data, error } = await supabase
        .from('reviews')
        .upsert(payload, { onConflict: 'user_id,media_id,media_type' })
        .select('id')
        .single()
      if (error) { console.error('[submitReview]', error); setSubmitting(false); return }
      reviewId = data?.id ?? null
    }

    // @mention notifications (fire-and-forget)
    if (reviewId && formBody.trim()) {
      const mentionedUsernames = [...new Set([...formBody.matchAll(/@(\w+)/g)].map(m => m[1]))]
      if (mentionedUsernames.length > 0) {
        const { data: mentionedProfiles } = await supabase
          .from('profiles')
          .select('id, username')
          .in('username', mentionedUsernames)
        for (const p of mentionedProfiles ?? []) {
          if (p.id !== currentUserId) {
            supabase.from('notifications').insert({
              user_id:      p.id,
              actor_id:     currentUserId,
              type:         'mention',
              review_id:    reviewId,
              review_title: title,
            })
          }
        }
      }
    }

    setShowForm(false)
    setEditingId(null)
    await loadReviews()
    setSubmitting(false)
  }

  async function deleteReview(id: string) {
    if (!confirm('¿Eliminar reseña?')) return
    await supabase.from('reviews').delete().eq('id', id)
    setReviews(prev => prev.filter(r => r.id !== id))
  }

  async function toggleLike(reviewId: string) {
    if (!currentUserId) return
    const review = reviews.find(r => r.id === reviewId)
    if (!review) return
    const liked = review.review_likes.some(l => l.user_id === currentUserId)
    if (liked) {
      await supabase.from('review_likes').delete().eq('review_id', reviewId).eq('user_id', currentUserId)
      setReviews(prev => prev.map(r =>
        r.id === reviewId
          ? { ...r, review_likes: r.review_likes.filter(l => l.user_id !== currentUserId) }
          : r
      ))
    } else {
      await supabase.from('review_likes').insert({ review_id: reviewId, user_id: currentUserId })
      setReviews(prev => prev.map(r =>
        r.id === reviewId
          ? { ...r, review_likes: [...r.review_likes, { user_id: currentUserId }] }
          : r
      ))
    }
  }

  const displayRating = hoverRating || formRating

  return (
    <div className="mt-10">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MessageSquare size={19} />
          Reseñas
          {reviews.length > 0 && (
            <span className="text-sm font-normal text-zinc-500">({reviews.length})</span>
          )}
        </h2>
        {currentUserId && !showForm && (
          <button
            onClick={() => openForm(myReview)}
            className="text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {myReview ? 'Editar reseña' : '+ Escribir reseña'}
          </button>
        )}
      </div>

      {/* ── Form ────────────────────────────────────────────────── */}
      {showForm && currentUserId && (
        <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-5 mb-6">
          {/* Star selector */}
          <div className="flex items-center gap-1.5 mb-4">
            <span className="text-sm text-zinc-400 mr-1">Nota:</span>
            {[1, 2, 3, 4, 5].map(s => {
              const fill: 'full' | 'half' | 'empty' =
                displayRating >= s ? 'full' : displayRating >= s - 0.5 ? 'half' : 'empty'
              return (
                <button
                  key={s}
                  type="button"
                  onMouseMove={e => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setHoverRating(e.clientX - rect.left < rect.width / 2 ? s - 0.5 : s)
                  }}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    setFormRating(e.clientX - rect.left < rect.width / 2 ? s - 0.5 : s)
                  }}
                  className="transition-transform hover:scale-110"
                >
                  <StarIcon fill={fill} size={24} />
                </button>
              )
            })}
            {formRating > 0 && <span className="text-sm text-zinc-400 ml-1">{formRating}/5</span>}
          </div>

          {/* Recommended */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-zinc-400">¿La recomendás?</span>
            <button
              onClick={() => setFormRecommended(true)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                formRecommended ? 'bg-emerald-500 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
              }`}
            >
              <ThumbsUp size={12} /> Sí
            </button>
            <button
              onClick={() => setFormRecommended(false)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                !formRecommended ? 'bg-red-600 text-white' : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
              }`}
            >
              <ThumbsDown size={12} /> No
            </button>
          </div>

          {/* Body with @mention support */}
          <MentionTextarea
            value={formBody}
            onChange={setFormBody}
            placeholder="¿Qué te pareció? Usá @usuario para mencionar a alguien (opcional)"
            rows={4}
            className="w-full bg-zinc-700 border border-zinc-600 focus:border-emerald-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none resize-none"
          />

          {/* Spoiler toggle */}
          <label className="flex items-center gap-2.5 mt-3 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={formHasSpoiler}
              onChange={e => setFormHasSpoiler(e.target.checked)}
              className="w-4 h-4 accent-red-500 cursor-pointer"
            />
            <span className="text-sm text-zinc-300">⚠️ Esta reseña contiene spoilers</span>
          </label>

          <div className="flex gap-2 mt-3">
            <button
              onClick={submitReview}
              disabled={formRating === 0 || submitting}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {submitting ? 'Guardando...' : 'Publicar reseña'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditingId(null) }}
              className="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── List ────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-zinc-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-10">
          Sin reseñas todavía.{currentUserId ? ' ¡Sé el primero en opinar!' : ''}
        </p>
      ) : (
        <div className="space-y-4">
          {reviews.map(review => (
            <ReviewCard
              key={review.id}
              id={review.id}
              authorId={review.user_id}
              authorUsername={review.profile.username ?? 'Usuario'}
              authorDisplayName={review.profile.display_name}
              authorAvatarUrl={review.profile.avatar_url}
              mediaId={review.media_id}
              mediaType={review.media_type}
              mediaTitle={review.title}
              mediaPosterPath={review.poster_path}
              showPoster={false}
              rating={review.rating}
              recommended={review.recommended}
              hasSpoiler={review.has_spoiler}
              body={review.body}
              date={review.created_at}
              likeCount={review.review_likes.length}
              likedByCurrentUser={review.review_likes.some(l => l.user_id === currentUserId)}
              isOwn={review.user_id === currentUserId}
              currentUserId={currentUserId}
              onLike={() => toggleLike(review.id)}
              onEdit={review.user_id === currentUserId ? () => openForm(review) : undefined}
              onDelete={review.user_id === currentUserId ? () => deleteReview(review.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
