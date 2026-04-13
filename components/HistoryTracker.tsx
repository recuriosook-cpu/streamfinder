'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'

interface Props {
  mediaId: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string | null
}

// Silently records a visit to watch_history when the detail page mounts.
// useRef prevents double-inserts in React StrictMode (dev).
export default function HistoryTracker({ mediaId, mediaType, title, posterPath }: Props) {
  const recorded = useRef(false)

  useEffect(() => {
    if (recorded.current) return
    recorded.current = true

    async function record() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('watch_history').insert({
        user_id: user.id,
        media_id: mediaId,
        media_type: mediaType,
        title,
        poster_path: posterPath,
      })
    }
    record()
  }, [mediaId, mediaType, title, posterPath])

  return null
}
