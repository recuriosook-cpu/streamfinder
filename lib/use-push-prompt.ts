'use client'

import { useCallback } from 'react'
import { isPushSupported, requestPushPermission, getCurrentPushEndpoint } from './push-notifications'

const STORAGE_KEY = 'glynbox_push_prompted'

export function usePushPrompt(userId: string | null) {
  const promptForPush = useCallback(async () => {
    if (!userId || !isPushSupported()) return

    try {
      const alreadyPrompted = localStorage.getItem(STORAGE_KEY) === '1'

      if (alreadyPrompted) {
        // Already asked — silently re-subscribe if permission was granted but subscription was lost
        if (Notification.permission === 'granted') {
          const endpoint = await getCurrentPushEndpoint()
          if (!endpoint) await requestPushPermission(userId)
        }
        return
      }

      // First time — only show browser dialog if permission is still undecided
      localStorage.setItem(STORAGE_KEY, '1')
      if (Notification.permission !== 'default') return

      await requestPushPermission(userId)
    } catch { /* ignore storage/permission errors */ }
  }, [userId])

  return { promptForPush }
}
