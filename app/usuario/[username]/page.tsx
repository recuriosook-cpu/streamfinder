import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase-server'
import UserProfileClient from '@/components/UserProfileClient'

interface Props {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params
  return { title: `${username} — StreamFinder` }
}

export default async function UserProfilePage({ params }: Props) {
  const { username } = await params
  const supabase = createServerClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio, avatar_url, instagram_username, tiktok_username, x_username, username_changed_at, points, level')
    .eq('username', username)
    .maybeSingle()

  if (!profile) notFound()

  return <UserProfileClient profile={profile} />
}
