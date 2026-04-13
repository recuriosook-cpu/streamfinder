'use client'

import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Props {
  mediaId: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string | null
}

export default function FavoriteButton({ mediaId, mediaType, title, posterPath }: Props) {
  const [isFav, setIsFav] = useState(false)
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
        .from('favorites')
        .select('id')
        .eq('user_id', user.id)
        .eq('media_id', mediaId)
        .eq('media_type', mediaType)
        .maybeSingle()
      setIsFav(!!data)
      setLoading(false)
    }
    init()
  }, [mediaId, mediaType])

  const toggle = async () => {
    if (!userId) {
      router.push('/auth')
      return
    }
    setLoading(true)
    if (isFav) {
      await supabase.from('favorites').delete()
        .eq('user_id', userId)
        .eq('media_id', mediaId)
        .eq('media_type', mediaType)
      setIsFav(false)
    } else {
      await supabase.from('favorites').insert({
        user_id: userId,
        media_id: mediaId,
        media_type: mediaType,
        title,
        poster_path: posterPath,
      })
      setIsFav(true)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        isFav
          ? 'bg-red-600 hover:bg-red-700 text-white'
          : 'bg-zinc-700 hover:bg-zinc-600 text-white'
      }`}
    >
      <Heart size={18} fill={isFav ? 'currentColor' : 'none'} />
      {isFav ? 'En favoritos' : 'Agregar a favoritos'}
    </button>
  )
}
