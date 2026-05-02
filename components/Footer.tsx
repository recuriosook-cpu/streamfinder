'use client'

import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="border-t border-[#2A2A3A] mt-16 bg-[#0A0A0F]">
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
