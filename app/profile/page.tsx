'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/**
 * Auth-aware redirect:
 *
 * onAuthStateChange fires in this order depending on the scenario:
 *
 *  Already logged in:  INITIAL_SESSION(session)  → redirect to /usuario/[username]
 *  Just logged in:     INITIAL_SESSION(null)      → wait
 *                      SIGNED_IN(session)         → redirect to /usuario/[username]
 *  Not logged in:      INITIAL_SESSION(null)      → wait 1.5 s → redirect to /auth
 *
 * We NEVER redirect to /auth on INITIAL_SESSION null alone — the user
 * may have just completed signInWithPassword and SIGNED_IN is about to fire.
 */
export default function ProfileRedirect() {
  const router   = useRouter()
  const supabase = useRef(createClient()).current

  useEffect(() => {
    let done  = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function toProfile(userId: string) {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .maybeSingle()

      router.replace(profile?.username ? `/usuario/${profile.username}` : '/auth')
    }

    function toAuth() {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      router.replace('/auth')
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          // Session present — go to profile immediately
          toProfile(session.user.id)
        } else if (event === 'INITIAL_SESSION') {
          // No session yet — may be mid-login; give SIGNED_IN 1.5 s to arrive
          timer = setTimeout(toAuth, 1500)
        } else if (event === 'SIGNED_OUT') {
          toAuth()
        }
      }
    )

    return () => {
      subscription.unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
