import { createServerClient } from '@/lib/supabase-server'
import { getMovieDetails, getTVDetails } from '@/lib/tmdb'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import ReviewPageClient from './ReviewPageClient'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = createServerClient()

  const { data: review } = await supabase
    .from('reviews')
    .select('title, body, rating, poster_path, media_id, media_type')
    .eq('id', id)
    .maybeSingle()

  if (!review) return {}

  const posterUrl = review.poster_path
    ? `https://image.tmdb.org/t/p/w500${review.poster_path}`
    : 'https://glynbox.com/logo.png'

  const stars = review.rating
    ? '★'.repeat(Math.floor(review.rating)) + (review.rating % 1 >= 0.5 ? '½' : '')
    : ''

  const title       = `${stars} ${review.title} — Glynbox`.trim()
  const description = review.body?.slice(0, 160) ?? `Reseña de ${review.title} en Glynbox`

  return {
    title,
    description,
    openGraph: {
      title:       `${stars} ${review.title}`.trim(),
      description,
      images:      [{ url: posterUrl, width: 500, height: 750 }],
      type:        'article',
    },
    twitter: {
      card:        'summary_large_image',
      title,
      description,
      images:      [posterUrl],
    },
  }
}

export default async function ReviewPage({ params }: Props) {
  const { id } = await params
  const supabase = createServerClient()

  // Fetch review
  const { data: review } = await supabase
    .from('reviews')
    .select('id, user_id, media_id, media_type, title, poster_path, rating, body, recommended, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!review) notFound()

  // Fetch author profile + like count in parallel
  const [profileRes, likeRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('username, display_name, avatar_url')
      .eq('id', review.user_id)
      .maybeSingle(),
    supabase
      .from('review_likes')
      .select('*', { count: 'exact', head: true })
      .eq('review_id', id),
  ])

  // Fetch release year from TMDB (best-effort, cached 1h)
  let mediaYear: string | null = null
  try {
    const tmdb = review.media_type === 'movie'
      ? await getMovieDetails(review.media_id)
      : await getTVDetails(review.media_id)
    mediaYear = (tmdb.release_date ?? tmdb.first_air_date ?? '').slice(0, 4) || null
  } catch {
    // year is optional — fail silently
  }

  return (
    <ReviewPageClient
      review={{
        id:                review.id,
        authorId:          review.user_id,
        authorUsername:    profileRes.data?.username    ?? 'Usuario',
        authorDisplayName: profileRes.data?.display_name ?? null,
        authorAvatarUrl:   profileRes.data?.avatar_url   ?? null,
        mediaId:           review.media_id,
        mediaType:         review.media_type  as 'movie' | 'tv',
        mediaTitle:        review.title,
        mediaPosterPath:   review.poster_path,
        mediaYear,
        rating:            review.rating,
        recommended:       review.recommended,
        body:              review.body,
        date:              review.created_at,
      }}
      initialLikeCount={likeRes.count ?? 0}
    />
  )
}
