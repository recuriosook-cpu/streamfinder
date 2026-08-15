'use client'

import { useState, useEffect } from 'react'
import { ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import ReviewCard from '@/components/ReviewCard'
import MentionTextarea from '@/components/MentionTextarea'
import { StarIcon } from '@/components/StarDisplay'
import { addPoints } from '@/lib/points'
import { sendNotification } from '@/lib/notify'
import { usePushPrompt } from '@/lib/use-push-prompt'
import { toast } from 'sonner'

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
  // currentUserId starts null — hook reads it after auth resolves
  const [currentUserId, setCurrentUserId]     = useState<string | null>(null)
  // Reseña resaltada al llegar desde un link `#review-{id}`
  const [highlightedId, setHighlightedId]     = useState<string | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [showForm, setShowForm]               = useState(false)
  const [editingId, setEditingId]             = useState<string | null>(null)
  const [formRating, setFormRating]           = useState(0)
  const [hoverRating, setHoverRating]         = useState(0)
  const [formBody, setFormBody]               = useState('')
  const [formRecommended, setFormRecommended] = useState(true)
  const [formHasSpoiler, setFormHasSpoiler]   = useState(false)
  const [submitting, setSubmitting]           = useState(false)
  const [ratingLocked, setRatingLocked]       = useState(false)
  const [glynboxStats, setGlynboxStats]       = useState<{ avg: number; count: number; dist: Record<number, number> } | null>(null)

  const { promptForPush } = usePushPrompt(currentUserId)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null))
    loadReviews()
    // Fetch Glynbox rating distribution
    supabase.from('ratings').select('rating').eq('media_id', mediaId).eq('media_type', mediaType)
      .then(({ data }) => {
        if (!data?.length) return
        const dist: Record<number, number> = {}
        let sum = 0
        for (const r of data) {
          const star = Math.round(r.rating)
          dist[star] = (dist[star] ?? 0) + 1
          sum += r.rating
        }
        setGlynboxStats({ avg: sum / data.length, count: data.length, dist })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, mediaType])

  // ── Anchor scroll (#review-{id}) ────────────────────────────────────────
  // La app nativa comparte links con el fragmento `#review-{id}`. El navegador
  // no puede saltar solo porque las reseñas se cargan en el cliente: cuando
  // resuelve el hash, el elemento todavía no existe.
  useEffect(() => {
    if (loading || reviews.length === 0) return

    const match = /^#review-(.+)$/.exec(window.location.hash)
    if (!match) return

    const reviewId = match[1]
    const target = document.getElementById(`review-${reviewId}`)

    if (!target) {
      // Sólo se cargan las 10 más recientes: si la compartida es más vieja, no
      // está en el DOM y no hay nada a dónde scrollear. La página propia de la
      // reseña sí la muestra siempre, así que se manda para allá en vez de
      // dejar al visitante mirando una lista donde no está lo que vino a ver.
      window.location.replace(`/review/${reviewId}`)
      return
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedId(reviewId)

    const timer = setTimeout(() => setHighlightedId(null), 3000)
    return () => clearTimeout(timer)
  }, [loading, reviews])

  async function loadReviews() {
    setLoading(true)

    // Step 1 — fetch the 10 most recent reviews + their like rows
    const { data: raw, error } = await supabase
      .from('reviews')
      .select('*, review_likes(user_id)')
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

  async function openForm(review?: Review) {
    if (review) {
      setEditingId(review.id)
      setFormRating(review.rating ?? 0)
      setFormBody(review.body ?? '')
      setFormRecommended(review.recommended)
      setFormHasSpoiler(review.has_spoiler ?? false)
      setRatingLocked(false)
    } else {
      setEditingId(null)
      setFormRating(0)
      setFormBody('')
      setFormRecommended(true)
      setFormHasSpoiler(false)
      setRatingLocked(false)

      if (currentUserId) {
        const { data } = await supabase
          .from('ratings')
          .select('rating')
          .eq('user_id', currentUserId)
          .eq('media_id', mediaId)
          .eq('media_type', mediaType)
          .maybeSingle()
        if (data?.rating) {
          setFormRating(data.rating)
          setRatingLocked(true)
        }
      }
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

    try {
      let reviewId: string | null = editingId
      if (editingId) {
        const { error } = await supabase.from('reviews').update(payload).eq('id', editingId)
        if (error) {
          console.error('[submitReview]', error)
          toast.error('No se pudo publicar la reseña. Intentá de nuevo.')
          return
        }
      } else {
        const { data, error } = await supabase
          .from('reviews')
          .upsert(payload, { onConflict: 'user_id,media_id,media_type' })
          .select('id')
          .single()
        if (error) {
          console.error('[submitReview]', error)
          toast.error('No se pudo publicar la reseña. Intentá de nuevo.')
          return
        }
        reviewId = data?.id ?? null
        if (reviewId) promptForPush()
      }

      addPoints(currentUserId, 10)
      if (formBody.trim().length >= 200) addPoints(currentUserId, 5)

      if (reviewId && formBody.trim()) {
        const mentionedUsernames = [...new Set([...formBody.matchAll(/@(\w+)/g)].map(m => m[1]))]
        if (mentionedUsernames.length > 0) {
          const { data: mentionedProfiles } = await supabase
            .from('profiles')
            .select('id, username')
            .in('username', mentionedUsernames)
          for (const p of mentionedProfiles ?? []) {
            if (p.id !== currentUserId) {
              sendNotification(supabase as Parameters<typeof sendNotification>[0], {
                user_id:      p.id,
                actor_id:     currentUserId,
                type:         'mention',
                review_id:    reviewId,
                review_title: title,
              })
              addPoints(p.id, 2)
            }
          }
        }
      }

      toast.success(editingId ? 'Reseña actualizada' : 'Reseña publicada')
      setShowForm(false)
      setEditingId(null)
      await loadReviews()
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteReview(id: string) {
    if (!confirm('¿Eliminar reseña?')) return
    await supabase.from('reviews').delete().eq('id', id)
    setReviews(prev => prev.filter(r => r.id !== id))
    toast.success('Reseña eliminada')
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
      if (review.user_id !== currentUserId) addPoints(review.user_id, 2)
    }
  }

  const displayRating = hoverRating || formRating

  return (
    <div className="mt-10">
      {/* ── Glynbox rating distribution ─────────────────────────── */}
      {glynboxStats && glynboxStats.count > 0 && (
        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 mb-6 flex items-start gap-5">
          <div className="text-center shrink-0">
            <p className="text-4xl font-bold leading-none" style={{ color: '#FFFD02' }}>
              {glynboxStats.avg.toFixed(1)}
            </p>
            <p className="text-xs text-[#A0A0B0] mt-1">/5</p>
            <p className="text-[11px] text-zinc-600 mt-0.5">{glynboxStats.count} {glynboxStats.count === 1 ? 'calificación' : 'calificaciones'}</p>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map(star => {
              const count = glynboxStats.dist[star] ?? 0
              const pct = (count / glynboxStats.count) * 100
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-[11px] text-[#A0A0B0] w-2.5 text-right tabular-nums">{star}</span>
                  <span className="text-yellow-400 text-[10px] leading-none">★</span>
                  <div className="flex-1 h-1.5 bg-[#1C1C27] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: '#FFFD02' }}
                    />
                  </div>
                  <span className="text-[11px] text-zinc-600 w-5 text-right tabular-nums">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MessageSquare size={19} />
          Reseñas
          {reviews.length > 0 && (
            <span className="text-sm font-normal text-[#A0A0B0]">({reviews.length})</span>
          )}
        </h2>
        {currentUserId && !showForm && (
          <button
            onClick={() => openForm(myReview)}
            className="text-sm bg-[#1C1C27] hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {myReview ? 'Editar reseña' : '+ Escribir reseña'}
          </button>
        )}
      </div>

      {/* ── Form ────────────────────────────────────────────────── */}
      {showForm && currentUserId && (
        <div className="bg-[#1C1C27]/70 border border-[#2A2A3A] rounded-xl p-5 mb-6">
          {/* Star selector */}
          {ratingLocked ? (
            <div className="flex items-center gap-1.5 mb-4">
              <span className="text-sm text-[#A0A0B0] mr-1">Tu calificación:</span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map(s => {
                  const fill: 'full' | 'half' | 'empty' =
                    formRating >= s ? 'full' : formRating >= s - 0.5 ? 'half' : 'empty'
                  return <StarIcon key={s} fill={fill} size={22} />
                })}
              </div>
              <span className="text-sm text-[#A0A0B0] ml-1">{formRating}/5</span>
              <button
                type="button"
                onClick={() => setRatingLocked(false)}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline ml-2 transition-colors"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mb-4">
              <span className="text-sm text-[#A0A0B0] mr-1">Nota:</span>
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
              {formRating > 0 && <span className="text-sm text-[#A0A0B0] ml-1">{formRating}/5</span>}
            </div>
          )}

          {/* Recommended */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-[#A0A0B0]">¿La recomendás?</span>
            <button
              onClick={() => setFormRecommended(true)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                formRecommended ? 'bg-[#FFFD02] text-black' : 'bg-zinc-700 text-[#A0A0B0] hover:bg-zinc-600'
              }`}
            >
              <ThumbsUp size={12} /> Sí
            </button>
            <button
              onClick={() => setFormRecommended(false)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                !formRecommended ? 'bg-red-600 text-white' : 'bg-zinc-700 text-[#A0A0B0] hover:bg-zinc-600'
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
            className="w-full bg-zinc-700 border border-zinc-600 focus:border-[#FFFD02] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none resize-none"
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
              className="bg-[#FFFD02] hover:bg-[#E5EB00] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-medium px-4 py-2 rounded-lg transition-colors"
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
            <div key={i} className="h-28 bg-[#1C1C27]/50 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-[#A0A0B0] text-sm text-center py-10">
          Sin reseñas todavía.{currentUserId ? ' ¡Sé el primero en opinar!' : ''}
        </p>
      ) : (
        <div className="space-y-4">
          {reviews.map(review => (
            <div
              key={review.id}
              // Destino de los links `#review-{id}` que comparte la app nativa.
              id={`review-${review.id}`}
              className={
                highlightedId === review.id
                  ? 'rounded-xl ring-2 ring-[#FFFD02]/70 transition-shadow duration-500'
                  : 'rounded-xl transition-shadow duration-500'
              }
            >
            <ReviewCard
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
              hasSpoiler={review.has_spoiler ?? false}
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
