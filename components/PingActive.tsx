'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export function PingActive() {
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        fetch('/api/ping-active', { method: 'POST' }).catch(() => {})
      }
    })
  }, [])
  return null
}
