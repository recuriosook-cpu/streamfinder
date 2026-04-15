'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

/**
 * Redirect-only page: reads auth state from local cookies (no network request)
 * via onAuthStateChange, then redirects to /usuario/[username] or /auth.
 *
 * Using onAuthStateChange instead of getUser() because:
 * - getUser() makes a network request that can fail or time out in production
 * - onAuthStateChange reads from cookies synchronously on INITIAL_SESSION
 */
export default function ProfileRedirect() {
  const router   = useRouter()
  const supabase = useRef(createClient()).current

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // INITIAL_SESSION fires immediately on mount with the current cookie state
        // SIGNED_OUT fires when the user logs out
        if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN') return

        if (!session?.user) {
          router.replace('/auth')
          subscription.unsubscribe()
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', session.user.id)
          .maybeSingle()

        router.replace(profile?.username ? `/usuario/${profile.username}` : '/auth')
        subscription.unsubscribe()
      }
    )

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
