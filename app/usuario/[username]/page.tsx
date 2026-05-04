import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase-server'
import UserProfileClient from '@/components/UserProfileClient'

interface Props {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  const supabase = createServerClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, bio, avatar_url')
    .eq('username', username)
    .maybeSingle()

  const displayName = profile?.display_name ?? username
  const description = profile?.bio
    ? profile.bio.slice(0, 160)
    : `Perfil de ${displayName} en Glynbox — reseñas, listas y recomendaciones de películas y series.`
  const imageUrl = profile?.avatar_url ?? 'https://glynbox.com/logo.png'
  const title = `${displayName} (@${username}) — Glynbox`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url:    `https://glynbox.com/usuario/${username}`,
      images: [{ url: imageUrl, width: 400, height: 400, alt: displayName }],
    },
    twitter: {
      card:        'summary',
      title,
      description,
      images:      [imageUrl],
    },
    alternates: { canonical: `https://glynbox.com/usuario/${username}` },
  }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params
  const supabase = createServerClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .maybeSingle()

  if (!profile) notFound()

  return <UserProfileClient profile={profile} />
}
