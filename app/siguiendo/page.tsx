'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Star, ThumbsUp, ThumbsDown, Users, Heart, LogIn } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { getPosterUrl } from '@/lib/tmdb'

interface ActivityReview {
  id: string
  user_id: string
  media_id: number
  media_type: string
  title: string
  poster_path: string | null
  rating: number | null
  body: string | null
  recommended: boolean
  created_at: string
  profiles: { username: string | null; avatar_url: string | null }
  review_likes: { user_id: string }[]
}

export default function SiguiendoPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [loading, setLoading]           = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [reviews, setReviews]           = useState<ActivityReview[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setCurrentUserId(user.id)

      // Get IDs of people this user follows
      const { data: followRows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)

      const followingIds = (followRows ?? []).map((r: { following_id: string }) => r.following_id)

      if (followingIds.length === 0) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('reviews')
        .select('*, profiles(username, avatar_url), review_likes(user_id)')
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(50)

      setReviews((data as ActivityReview[]) ?? [])
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!currentUserId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <LogIn size={40} className="text-zinc-600" />
        <p className="text-zinc-400">Iniciá sesión para ver la actividad de tus seguidos</p>
        <Link href="/auth" className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg font-medium transition-colors">
          Iniciar sesión
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Users size={22} />
        Siguiendo
      </h1>

      {reviews.length === 0 ? (
        <div className="text-center py-20">
          <Users size={40} className="mx-auto text-zinc-700 mb-3" />
          <p className="text-zinc-400 mb-2">No hay actividad todavía.</p>
          <p className="text-zinc-600 text-sm">Seguí usuarios para ver sus reseñas acá.</p>
          <Link href="/que-ver" className="inline-block mt-6 bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-5 py-2 rounded-lg transition-colors">
            Explorar contenido
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {reviews.map(review => {
            const liked     = review.review_likes.some(l => l.user_id === currentUserId)
            const likeCount = review.review_likes.length
            const username  = review.profiles?.username ?? 'Usuario'
            const href      = `/${review.media_type}/${review.media_id}`

            return (
              <div key={review.id} className="bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-5">
                {/* Author */}
                <div className="flex items-center gap-3 mb-4">
                  <Link href={`/usuario/${username}`}>
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
                    <p className="text-xs text-zinc-500">
                      {new Date(review.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                {/* Media + review */}
                <div className="flex gap-4">
                  <Link href={href} className="shrink-0">
                    <div className="relative w-16 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-700">
                      {review.poster_path ? (
                        <Image src={getPosterUrl(review.poster_path, 'w92')} alt={review.title} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center p-1">Sin imagen</div>
                      )}
                    </div>
                  </Link>

                  <div className="flex-1 min-w-0">
                    <Link href={href} className="text-sm font-semibold text-white hover:text-emerald-400 transition-colors line-clamp-1 block mb-1.5">
                      {review.title}
                    </Link>

                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {review.rating && (
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map(s => (
                            <Star key={s} size={12} className="text-yellow-400" fill={s <= review.rating! ? 'currentColor' : 'none'} />
                          ))}
                        </div>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        review.recommended ? 'bg-emerald-900/60 text-emerald-400' : 'bg-red-900/60 text-red-400'
                      }`}>
                        {review.recommended
                          ? <><ThumbsUp className="inline w-3 h-3 mr-1" />Recomendada</>
                          : <><ThumbsDown className="inline w-3 h-3 mr-1" />No recomendada</>}
                      </span>
                    </div>

                    {review.body && (
                      <p className="text-sm text-zinc-300 line-clamp-4 leading-relaxed">{review.body}</p>
                    )}

                    <button
                      onClick={() => toggleLike(review.id)}
                      className={`mt-3 flex items-center gap-1.5 text-xs transition-colors ${
                        liked ? 'text-red-400' : 'text-zinc-500 hover:text-red-400'
                      }`}
                    >
                      <Heart size={13} fill={liked ? 'currentColor' : 'none'} />
                      {likeCount > 0 ? `${likeCount} me gusta` : 'Me gusta'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
