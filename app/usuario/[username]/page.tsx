import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { Star, Users, MessageSquare, ThumbsUp, ThumbsDown } from 'lucide-react'
import { createServerClient } from '@/lib/supabase-server'
import { getPosterUrl } from '@/lib/tmdb'
import FollowButton from '@/components/FollowButton'

interface Props {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: Props) {
  const { username } = await params
  return { title: `${username} — StreamFinder` }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params
  const supabase = createServerClient()

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url')
    .eq('username', username)
    .maybeSingle()

  if (!profile) notFound()

  // Fetch counts in parallel
  const [reviewsRes, followersRes, followingRes] = await Promise.all([
    supabase
      .from('reviews')
      .select('id, media_id, media_type, title, poster_path, rating, body, recommended, created_at, review_likes(count)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false }),
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', profile.id),
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', profile.id),
  ])

  const reviews      = reviewsRes.data ?? []
  const followersCount = followersRes.count ?? 0
  const followingCount = followingRes.count ?? 0

  const displayName = profile.display_name ?? profile.username ?? 'Usuario'

  return (
    <div className="min-h-screen">
      {/* Profile header */}
      <div className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-3xl mx-auto px-4 py-10 flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-700 ring-4 ring-zinc-600 shrink-0">
            {profile.avatar_url ? (
              <Image src={profile.avatar_url} alt={displayName} width={96} height={96} className="w-full h-full object-cover" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-zinc-400">
                {displayName[0]?.toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">{displayName}</h1>
              <FollowButton targetUserId={profile.id} />
            </div>
            <p className="text-zinc-500 text-sm mb-1">@{profile.username}</p>
            {profile.bio && <p className="text-zinc-400 text-sm mt-2 max-w-lg">{profile.bio}</p>}

            {/* Stats */}
            <div className="flex flex-wrap justify-center sm:justify-start gap-6 mt-4">
              {[
                { label: 'Reseñas', value: reviews.length },
                { label: 'Seguidores', value: followersCount },
                { label: 'Siguiendo', value: followingCount },
              ].map(s => (
                <div key={s.label} className="text-center sm:text-left">
                  <p className="text-xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-zinc-500">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Reviews */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-5">
          <MessageSquare size={18} />
          Reseñas de {displayName}
        </h2>

        {reviews.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-16">Este usuario aún no escribió reseñas.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((review: {
              id: string; media_id: number; media_type: string; title: string
              poster_path: string | null; rating: number | null; body: string | null
              recommended: boolean; created_at: string; review_likes: { count: number }[]
            }) => {
              const href       = `/${review.media_type}/${review.media_id}`
              const likeCount  = review.review_likes?.[0]?.count ?? 0
              return (
                <div key={review.id} className="flex gap-4 bg-zinc-800/50 border border-zinc-700/40 rounded-xl p-4">
                  {/* Poster */}
                  <Link href={href} className="shrink-0">
                    <div className="relative w-14 aspect-[2/3] rounded-lg overflow-hidden bg-zinc-700">
                      {review.poster_path ? (
                        <Image src={getPosterUrl(review.poster_path, 'w92')} alt={review.title} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs text-center px-1">?</div>
                      )}
                    </div>
                  </Link>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <Link href={href} className="text-sm font-semibold text-white hover:text-emerald-400 transition-colors line-clamp-1">
                        {review.title}
                      </Link>
                      <span className="text-xs text-zinc-600 shrink-0">
                        {new Date(review.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {review.rating && (
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map(s => (
                            <Star key={s} size={11} className="text-yellow-400" fill={s <= review.rating! ? 'currentColor' : 'none'} />
                          ))}
                        </div>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        review.recommended ? 'bg-emerald-900/60 text-emerald-400' : 'bg-red-900/60 text-red-400'
                      }`}>
                        {review.recommended ? <><ThumbsUp className="inline w-3 h-3 mr-1" />Recomendada</> : <><ThumbsDown className="inline w-3 h-3 mr-1" />No recomendada</>}
                      </span>
                    </div>

                    {review.body && (
                      <p className="text-xs text-zinc-400 line-clamp-3 leading-relaxed">{review.body}</p>
                    )}

                    {likeCount > 0 && (
                      <p className="text-xs text-zinc-600 mt-2 flex items-center gap-1">
                        <Users size={11} /> {likeCount} {likeCount === 1 ? 'like' : 'likes'}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
