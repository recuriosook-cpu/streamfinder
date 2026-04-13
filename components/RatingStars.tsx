'use client'

import { useState, useEffect } from 'react'
import { Star } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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
  const [rating, setRating] = useState(initialRating ?? 0)
  const [hover, setHover] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(!initialRating)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (initialRating !== undefined) return // skip fetch when parent provides it
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data } = await supabase
        .from('ratings')
        .select('rating')
        .eq('user_id', user.id)
        .eq('media_id', mediaId)
        .eq('media_type', mediaType)
        .maybeSingle()
      if (data) setRating(data.rating)
      setLoading(false)
    }
    init()
  }, [mediaId, mediaType, initialRating])

  // Also fetch userId lazily when using initialRating mode
  useEffect(() => {
    if (initialRating === undefined) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null)
      setLoading(false)
    })
  }, [initialRating])

  const handleRate = async (value: number) => {
    if (!userId) { router.push('/auth'); return }
    // Clicking the same star again → remove rating
    const newValue = value === rating ? 0 : value
    setLoading(true)
    if (newValue === 0) {
      await supabase.from('ratings').delete()
        .eq('user_id', userId).eq('media_id', mediaId).eq('media_type', mediaType)
    } else {
      await supabase.from('ratings').upsert({
        user_id: userId,
        media_id: mediaId,
        media_type: mediaType,
        title,
        poster_path: posterPath,
        rating: newValue,
      }, { onConflict: 'user_id,media_id,media_type' })
    }
    setRating(newValue)
    onChange?.(newValue)
    setLoading(false)
  }

  const display = hover || rating

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-zinc-400 mr-0.5">Tu nota:</span>
      {[1, 2, 3, 4, 5].map(v => (
        <button
          key={v}
          disabled={loading}
          onMouseEnter={() => setHover(v)}
          onMouseLeave={() => setHover(0)}
          onClick={() => handleRate(v)}
          className="transition-transform hover:scale-125 disabled:opacity-50"
          aria-label={`Calificar ${v} estrellas`}
        >
          <Star
            size={20}
            className={`transition-colors ${v <= display ? 'text-yellow-400' : 'text-zinc-600'}`}
            fill={v <= display ? 'currentColor' : 'none'}
          />
        </button>
      ))}
      {rating > 0 && (
        <span className="text-xs text-zinc-500 ml-1">{rating}/5</span>
      )}
    </div>
  )
}
