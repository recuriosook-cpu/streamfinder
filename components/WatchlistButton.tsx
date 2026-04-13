'use client'

import { useState, useEffect } from 'react'
import { Bookmark } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Props {
  mediaId: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string | null
}

export default function WatchlistButton({ mediaId, mediaType, title, posterPath }: Props) {
  const [inList, setInList] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data } = await supabase
        .from('watchlist')
        .select('id')
        .eq('user_id', user.id)
        .eq('media_id', mediaId)
        .eq('media_type', mediaType)
        .maybeSingle()
      setInList(!!data)
      setLoading(false)
    }
    init()
  }, [mediaId, mediaType])

  const toggle = async () => {
    if (!userId) { router.push('/auth'); return }
    setLoading(true)
    if (inList) {
      await supabase.from('watchlist').delete()
        .eq('user_id', userId).eq('media_id', mediaId).eq('media_type', mediaType)
      setInList(false)
    } else {
      await supabase.from('watchlist').insert({
        user_id: userId,
        media_id: mediaId,
        media_type: mediaType,
        title,
        poster_path: posterPath,
      })
      setInList(true)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
        inList
          ? 'bg-blue-600 hover:bg-blue-700 text-white'
          : 'bg-zinc-700 hover:bg-zinc-600 text-white'
      }`}
    >
      <Bookmark size={18} fill={inList ? 'currentColor' : 'none'} />
      {inList ? 'En mi lista' : 'Ver después'}
    </button>
  )
}
