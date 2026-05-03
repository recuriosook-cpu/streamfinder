'use client'

import { useState, useEffect, useRef } from 'react'
import { Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

interface Props {
  actorId: number
  actorName: string
  actorPhoto: string | null
}

export default function FollowActorButton({ actorId, actorName, actorPhoto }: Props) {
  const supabase = useRef(createClient()).current
  const [following, setFollowing] = useState(false)
  const [userId,    setUserId]    = useState<string | null>(null)
  const [busy,      setBusy]      = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null
      setUserId(uid)
      if (!uid) return
      const { data: row } = await supabase
        .from('followed_actors')
        .select('actor_id')
        .eq('user_id', uid)
        .eq('actor_id', actorId)
        .maybeSingle()
      setFollowing(!!row)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!userId) return null

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    if (following) {
      await supabase.from('followed_actors')
        .delete().eq('user_id', userId).eq('actor_id', actorId)
      setFollowing(false)
    } else {
      // Fetch birthday from TMDB to store for birthday notifications
      let birthday: string | null = null
      if (TMDB_KEY) {
        try {
          const res = await fetch(`https://api.themoviedb.org/3/person/${actorId}?api_key=${TMDB_KEY}`)
          if (res.ok) { const d = await res.json(); birthday = d.birthday ?? null }
        } catch { /* proceed without birthday */ }
      }
      const { error } = await supabase.from('followed_actors').insert({
        user_id:     userId,
        actor_id:    actorId,
        actor_name:  actorName,
        actor_photo: actorPhoto,
        birthday,
      })
      if (error) console.error('[follow actor error]', error)
      setFollowing(true)
    }
    setBusy(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-all disabled:opacity-60 ${
        following
          ? 'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20'
          : 'border-[#2A2A3A] text-[#A0A0B0] hover:border-[#FFFD02] hover:text-white'
      }`}
    >
      <Heart size={14} fill={following ? 'currentColor' : 'none'} />
      {following ? 'Siguiendo' : 'Seguir'}
    </button>
  )
}
