'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const PING_THROTTLE_MS = 5 * 60 * 1000 // 5 minutos

export function PingActive() {
  useEffect(() => {
    const lastPing = sessionStorage.getItem('last_ping_active')
    if (lastPing && Date.now() - parseInt(lastPing, 10) < PING_THROTTLE_MS) return

    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        sessionStorage.setItem('last_ping_active', Date.now().toString())
        fetch('/api/ping-active', { method: 'POST' }).catch(() => {})
      }
    })
  }, [])
  return null
}
