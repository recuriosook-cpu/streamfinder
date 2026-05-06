'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'

// Module-level cache: avoids re-fetching across multiple hook instances (e.g., many ReviewCards)
const blockedCache = new Map<string, Set<string>>()

export function useBlockedUsers() {
  const supabase = useRef(createClient()).current
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())
  const [currentUid, setCurrentUid] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      const uid = data.user?.id ?? null
      setCurrentUid(uid)
      if (!uid) { setReady(true); return }
      if (blockedCache.has(uid)) {
        setBlockedIds(blockedCache.get(uid)!)
        setReady(true)
        return
      }
      supabase
        .from('blocked_users')
        .select('blocked_id')
        .eq('blocker_id', uid)
        .then(({ data: rows }) => {
          if (cancelled) return
          const ids = new Set<string>((rows ?? []).map((r: { blocked_id: string }) => r.blocked_id))
          blockedCache.set(uid, ids)
          setBlockedIds(new Set(ids))
          setReady(true)
        })
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function blockUser(userId: string) {
    if (!currentUid) return
    const { error } = await supabase.from('blocked_users').insert({
      blocker_id: currentUid,
      blocked_id: userId,
    })
    if (!error) {
      const next = new Set(blockedIds)
      next.add(userId)
      blockedCache.set(currentUid, next)
      setBlockedIds(new Set(next))
    }
    return error
  }

  async function unblockUser(userId: string) {
    if (!currentUid) return
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', currentUid)
      .eq('blocked_id', userId)
    if (!error) {
      const next = new Set(blockedIds)
      next.delete(userId)
      blockedCache.set(currentUid, next)
      setBlockedIds(new Set(next))
    }
    return error
  }

  return { blockedIds, ready, currentUid, blockUser, unblockUser }
}
