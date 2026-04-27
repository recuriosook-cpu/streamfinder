'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import MediaCard from '@/components/MediaCard'
import { Heart } from 'lucide-react'
import Link from 'next/link'

interface Favorite {
  id: string
  media_id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  created_at: string
}

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth')
        return
      }
      setUserId(user.id)
      const { data } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setFavorites(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const removeFavorite = async (favId: string) => {
    await supabase.from('favorites').delete().eq('id', favId)
    setFavorites(prev => prev.filter(f => f.id !== favId))
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-[#6B3FE7] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Heart size={24} className="text-red-500" fill="currentColor" />
        <h1 className="text-2xl font-bold">Mis Favoritos</h1>
      </div>

      {favorites.length === 0 ? (
        <div className="text-center py-20">
          <Heart size={48} className="mx-auto text-zinc-700 mb-4" />
          <p className="text-[#A0A0B0] text-lg mb-4">No tenés favoritos guardados todavía</p>
          <Link href="/" className="inline-flex items-center gap-2 bg-[#6B3FE7] hover:bg-[#5A32C7] text-white px-4 py-2 rounded-lg transition-colors">
            Explorar contenido
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {favorites.map(fav => (
            <div key={fav.id} className="relative group">
              <MediaCard
                id={fav.media_id}
                title={fav.title}
                posterPath={fav.poster_path}
                rating={0}
                year=""
                mediaType={fav.media_type}
              />
              <button
                onClick={() => removeFavorite(fav.id)}
                className="absolute top-2 left-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Eliminar de favoritos"
              >
                <Heart size={12} fill="currentColor" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
