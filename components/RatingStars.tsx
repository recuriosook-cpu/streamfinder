'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { StarIcon } from '@/components/StarDisplay'

interface Props {
  mediaId: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string | null
  /** Pass the stored rating to skip the initial DB fetch (used in profile page). */
  initialRating?: number
  /** Called after a rating is saved. */
  onChange?: (newRating: number) => void
}

export default function RatingStars({
  mediaId,
  mediaType,
  title,
  posterPath,
  initialRating,
  onChange,
}: Props) {
  const supabase = useRef(createClient()).current
  const router   = useRouter()

  const [rating,  setRating]  = useState(initialRating ?? 0)
  const [hover,   setHover]   = useState(0)
  const [userId,  setUserId]  = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Single init effect: always fetch userId; fetch stored rating only when
  // no initialRating is provided (i.e. on movie/tv detail pages).
  useEffect(() => {
    async function init() {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr) console.error('[RatingStars] auth.getUser:', authErr)
      if (!user) { setLoading(false); return }

      setUserId(user.id)

      if (initialRating !== undefined) {
        // Parent already supplied the value — just capture the userId and stop.
        setRating(initialRating)
        setLoading(false)
        return
      }

      // Fetch the existing rating from the DB
      const { data, error } = await supabase
        .from('ratings')
        .select('rating')
        .eq('user_id', user.id)
        .eq('media_id', mediaId)
        .eq('media_type', mediaType)
        .maybeSingle()

      if (error) console.error('[RatingStars] fetch rating:', error)
      if (data) setRating(data.rating)
      setLoading(false)
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId, mediaType])

  const handleRate = async (value: number) => {
    if (!userId) { router.push('/auth'); return }
    const newValue = value === rating ? 0 : value
    setLoading(true)

    if (newValue === 0) {
      const { error } = await supabase.from('ratings').delete()
        .eq('user_id', userId).eq('media_id', mediaId).eq('media_type', mediaType)
      if (error) console.error('[RatingStars] delete rating:', error)
    } else {
      const { error } = await supabase.from('ratings').upsert({
        user_id:    userId,
        media_id:   mediaId,
        media_type: mediaType,
        title,
        poster_path: posterPath,
        rating:      newValue,
        rated_at:    new Date().toISOString(),
      }, { onConflict: 'user_id,media_id,media_type' })
      if (error) console.error('[RatingStars] upsert rating:', error)
    }

    setRating(newValue)
    onChange?.(newValue)
    setLoading(false)
  }

  const display = hover || rating

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-[#A0A0B0] mr-0.5">Tu nota:</span>
      {[1, 2, 3, 4, 5].map(s => {
        const fill: 'full' | 'half' | 'empty' =
          display >= s ? 'full' : display >= s - 0.5 ? 'half' : 'empty'
        return (
          <button
            key={s}
            type="button"
            disabled={loading}
            onMouseMove={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              setHover(e.clientX - rect.left < rect.width / 2 ? s - 0.5 : s)
            }}
            onMouseLeave={() => setHover(0)}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              handleRate(e.clientX - rect.left < rect.width / 2 ? s - 0.5 : s)
            }}
            className="transition-transform hover:scale-125 disabled:opacity-50"
            aria-label={`Calificar ${s - 0.5} o ${s} estrellas`}
          >
            <StarIcon fill={fill} size={20} />
          </button>
        )
      })}
      {rating > 0 && (
        <span className="text-xs text-[#A0A0B0] ml-1">{rating}/5</span>
      )}
    </div>
  )
}
