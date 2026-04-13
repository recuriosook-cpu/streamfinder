'use client'

import { useState, useEffect } from 'react'
import { CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Props {
  mediaId: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string | null
}

export default function WatchedButton({ mediaId, mediaType, title, posterPath }: Props) {
  const [isWatched, setIsWatched] = useState(false)
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
        .from('watched')
        .select('id')
        .eq('user_id', user.id)
        .eq('media_id', mediaId)
        .eq('media_type', mediaType)
        .maybeSingle()
      setIsWatched(!!data)
      setLoading(false)
    }
    init()
  }, [mediaId, mediaType])

  const toggle = async () => {
    if (!userId) { router.push('/auth'); return }
    setLoading(true)
    if (isWatched) {
      await supabase.from('watched').delete()
        .eq('user_id', userId).eq('media_id', mediaId).eq('media_type', mediaType)
      setIsWatched(false)
    } else {
      await supabase.from('watched').insert({
        user_id: userId,
        media_id: mediaId,
        media_type: mediaType,
        title,
        poster_path: posterPath,
      })
      setIsWatched(true)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
        isWatched
          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
          : 'bg-zinc-700 hover:bg-zinc-600 text-white'
      }`}
    >
      <CheckCircle size={18} fill={isWatched ? 'currentColor' : 'none'} />
      {isWatched ? 'Ya lo vi' : 'Marcar como visto'}
    </button>
  )
}
