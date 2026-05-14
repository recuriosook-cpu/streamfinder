'use client'

import { useState, useEffect } from 'react'
import { UserPlus, UserCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

interface Props {
  targetUserId: string
}

export default function FollowButton({ targetUserId }: Props) {
  const supabase = createClient()
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [following, setFollowing]         = useState(false)
  const [loading, setLoading]             = useState(true)
  const [busy, setBusy]                   = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null
      setCurrentUserId(uid)
      if (uid && uid !== targetUserId) {
        const { data: row } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', uid)
          .eq('following_id', targetUserId)
          .maybeSingle()
        setFollowing(!!row)
      }
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId])

  if (loading) return null
  if (!currentUserId) {
    return (
      <Link
        href="/auth"
        className="flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm px-4 py-2 rounded-lg transition-colors"
      >
        <UserPlus size={15} /> Seguir
      </Link>
    )
  }
  if (currentUserId === targetUserId) return null

  async function toggle() {
    if (!currentUserId || busy) return
    setBusy(true)
    if (following) {
      await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', targetUserId)
      setFollowing(false)
    } else {
      await supabase.from('follows').insert({ follower_id: currentUserId, following_id: targetUserId })
      setFollowing(true)
    }
    setBusy(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
        following
          ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-400'
          : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white'
      }`}
    >
      {following ? <UserCheck size={15} /> : <UserPlus size={15} />}
      {following ? 'Siguiendo' : 'Seguir'}
    </button>
  )
}
