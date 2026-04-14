'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Star, ThumbsUp, ThumbsDown, Heart, Pencil, Trash2, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface ReviewProfile { username: string | null; avatar_url: string | null }
interface ReviewLike   { user_id: string }

interface Review {
  id: string
  user_id: string
  media_id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  rating: number | null
  body: string | null
  recommended: boolean
  created_at: string
  profiles: ReviewProfile
  review_likes: ReviewLike[]
}

interface Props {
  mediaId: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string | null
}

export default function ReviewsSection({ mediaId, mediaType, title, posterPath }: Props) {
  const supabase = createClient()

  const [reviews, setReviews]               = useState<Review[]>([])
  const [currentUserId, setCurrentUserId]   = useState<string | null>(null)
  const [loading, setLoading]               = useState(true)
  const [showForm, setShowForm]             = useState(false)
  const [editingId, setEditingId]           = useState<string | null>(null)
  const [formRating, setFormRating]         = useState(0)
  const [hoverRating, setHoverRating]       = useState(0)
  const [formBody, setFormBody]             = useState('')
  const [formRecommended, setFormRecommended] = useState(true)
  const [submitting, setSubmitting]         = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null))
    loadReviews()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, mediaType])

  async function loadReviews() {
    const { data } = await supabase
      .from('reviews')
      .select('*, profiles(username, avatar_url), review_likes(user_id)')
      .eq('media_id', mediaId)
      .eq('media_type', mediaType)
      .order('created_at', { ascending: false })
    setReviews((data as Review[]) ?? [])
    setLoading(false)
  }

  const myReview = reviews.find(r => r.user_id === currentUserId)

  function openForm(review?: Review) {
    if (review) {
      setEditingId(review.id)
      setFormRating(review.rating ?? 0)
      setFormBody(review.body ?? '')
      setFormRecommended(review.recommended)
    } else {
      setEditingId(null)
      setFormRating(0)
      setFormBody('')
      setFormRecommended(true)
    }
    setShowForm(true)
  }

  async function submitReview() {
    if (!currentUserId || formRating === 0) return
    setSubmitting(true)
    const payload = {
      user_id: currentUserId,
      media_id: mediaId,
      media_type: mediaType,
      title,
      poster_path: posterPath,
      rating: formRating,
      body: formBody.trim() || null,
      recommended: formRecommended,
    }
    if (editingId) {
      await supabase.from('reviews').update(payload).eq('id', editingId)
    } else {
      await supabase.from('reviews').upsert(payload, { onConflict: 'user_id,media_id,media_type' })
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
        r.id === reviewId ? { ...r, review_likes: r.review_likes.filter(l => l.user_id !== currentUserId) } : r
      ))
    } else {
      await supabase.from('review_likes').insert({ review_id: reviewId, user_id: currentUserId })
      setReviews(prev => prev.map(r =>
        r.id === reviewId ? { ...r, review_likes: [...r.review_likes, { user_id: currentUserId }] } : r
      ))
    }
  }

  const displayRating = hoverRating || formRating

  return (
    <div className="mt-10">
      {/* Header */}
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

      {/* Form */}
      {showForm && currentUserId && (
        <div className="bg-zinc-800/70 border border-zinc-700 rounded-xl p-5 mb-6">
          {/* Star rating */}
          <div className="flex items-center gap-1.5 mb-4">
            <span className="text-sm text-zinc-400 mr-1">Nota:</span>
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                onClick={() => setFormRating(s)}
                onMouseEnter={() => setHoverRating(s)}
                onMouseLeave={() => setHoverRating(0)}
                className="text-yellow-400 transition-transform hover:scale-110"
              >
                <Star size={24} fill={s <= displayRating ? 'currentColor' : 'none'} />
              </button>
            ))}
            {formRating > 0 && (
              <span className="text-sm text-zinc-400 ml-1">{formRating}/5</span>
            )}
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

          {/* Body */}
          <textarea
            value={formBody}
            onChange={e => setFormBody(e.target.value)}
            placeholder="¿Qué te pareció? (opcional)"
            rows={4}
            className="w-full bg-zinc-700 border border-zinc-600 focus:border-emerald-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none resize-none"
          />

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

      {/* List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <div key={i} className="h-28 bg-zinc-800/50 rounded-xl animate-pulse" />)}
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-zinc-500 text-sm text-center py-10">
          Sin reseñas todavía.{currentUserId ? ' ¡Sé el primero en opinar!' : ''}
        </p>
      ) : (
        <div className="space-y-4">
          {reviews.map(review => {
            const likeCount = review.review_likes.length
            const liked     = review.review_likes.some(l => l.user_id === currentUserId)
            const isOwn     = review.user_id === currentUserId
            const username  = review.profiles?.username ?? 'Usuario'

            return (
              <div key={review.id} className="bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-5">
                {/* Review header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <Link href={`/usuario/${username}`} className="shrink-0">
                      <div className="w-9 h-9 rounded-full bg-zinc-700 overflow-hidden ring-2 ring-zinc-600 hover:ring-emerald-500 transition-all">
                        {review.profiles?.avatar_url ? (
                          <img src={review.profiles.avatar_url} alt={username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm font-bold text-zinc-400">
                            {username[0]?.toUpperCase()}
                          </div>
                        )}
                      </div>
                    </Link>
                    <div>
                      <Link href={`/usuario/${username}`} className="text-sm font-semibold text-white hover:text-emerald-400 transition-colors">
                        {username}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        {review.rating && (
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map(s => (
                              <Star key={s} size={11} className="text-yellow-400" fill={s <= review.rating! ? 'currentColor' : 'none'} />
                            ))}
                          </div>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          review.recommended
                            ? 'bg-emerald-900/60 text-emerald-400'
                            : 'bg-red-900/60 text-red-400'
                        }`}>
                          {review.recommended ? '👍 Recomendada' : '👎 No recomendada'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-zinc-600">
                      {new Date(review.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    {isOwn && (
                      <>
                        <button onClick={() => openForm(review)} className="text-zinc-500 hover:text-white transition-colors" title="Editar">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteReview(review.id)} className="text-zinc-500 hover:text-red-400 transition-colors" title="Eliminar">
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {review.body && (
                  <p className="text-sm text-zinc-300 leading-relaxed mb-3 whitespace-pre-wrap">{review.body}</p>
                )}

                <button
                  onClick={() => toggleLike(review.id)}
                  className={`flex items-center gap-1.5 text-xs transition-colors ${
                    liked ? 'text-red-400' : 'text-zinc-500 hover:text-red-400'
                  }`}
                >
                  <Heart size={13} fill={liked ? 'currentColor' : 'none'} />
                  {likeCount > 0 && <span>{likeCount} {likeCount === 1 ? 'me gusta' : 'me gusta'}</span>}
                  {likeCount === 0 && <span>Me gusta</span>}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
