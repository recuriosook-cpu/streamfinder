'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

declare global {
  interface Window {
    adsbygoogle: unknown[]
  }
}

function AdBanner() {
  const ref = useRef<HTMLDivElement>(null)
  const pushed = useRef(false)

  useEffect(() => {
    if (pushed.current) return
    try {
      if (typeof window !== 'undefined' && window.adsbygoogle) {
        window.adsbygoogle.push({})
        pushed.current = true
      }
    } catch { /* AdSense not ready yet */ }
  }, [])

  return (
    <div ref={ref} className="w-full flex justify-center overflow-hidden">
      {/* Desktop: 728×90 */}
      <ins
        className="adsbygoogle hidden sm:block"
        style={{ display: 'block', width: 728, height: 90 }}
        data-ad-client="ca-pub-7004694054304140"
        data-ad-slot="XXXXXXXXXX"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      {/* Mobile: 320×50 */}
      <ins
        className="adsbygoogle sm:hidden"
        style={{ display: 'block', width: 320, height: 50 }}
        data-ad-client="ca-pub-7004694054304140"
        data-ad-slot="XXXXXXXXXX"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}

export default function Footer() {
  const supabase = useRef(createClient()).current
  const [isPremium, setIsPremium] = useState(false)
  const [checked,   setChecked]   = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setChecked(true); return }
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_premium')
        .eq('id', data.user.id)
        .maybeSingle()
      setIsPremium(profile?.is_premium === true)
      setChecked(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <footer className="border-t border-[#2A2A3A] mt-16 bg-[#0A0A0F]">
      {/* Ad banner — hidden for premium users */}
      {checked && !isPremium && (
        <div className="py-3 bg-[#13131A] border-b border-[#2A2A3A]">
          <AdBanner />
        </div>
      )}

      {/* Footer links */}
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#A0A0B0]">
        <p>© 2026 Glynbox</p>
        <div className="flex items-center gap-4">
          <Link href="/privacidad" className="hover:text-white transition-colors">
            Privacidad
          </Link>
          <Link href="/terminos" className="hover:text-white transition-colors">
            Términos
          </Link>
        </div>
      </div>
    </footer>
  )
}
