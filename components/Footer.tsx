'use client'

import Link from 'next/link'

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.635L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function TikTokIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.77 1.52V6.76a4.85 4.85 0 01-1-.07z"/>
    </svg>
  )
}

function EmailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  )
}

const LINKS = [
  { label: 'Privacidad',    href: '/privacidad' },
  { label: 'Términos',      href: '/terminos' },
  { label: 'Soporte',       href: '/soporte' },
  { label: 'Anunciantes',   href: '/anunciantes' },
]

const SOCIAL = [
  { label: 'X (Twitter)', href: 'https://x.com/Glynboxapp',         icon: <XIcon /> },
  { label: 'Instagram',   href: 'https://instagram.com/glynboxapp',  icon: <InstagramIcon /> },
  { label: 'TikTok',      href: 'https://tiktok.com/@glynboxapp',    icon: <TikTokIcon /> },
]

export default function Footer() {
  return (
    <footer className="border-t border-[#2A2A3A] mt-16 bg-[#0A0A0F]">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Top row: links + social */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-5 mb-5">

          {/* Page links */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#A0A0B0]">
            {LINKS.map(l => (
              <Link key={l.href} href={l.href} className="hover:text-white transition-colors">
                {l.label}
              </Link>
            ))}
            <a
              href="mailto:contacto@glynbox.com"
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <EmailIcon />
              contacto@glynbox.com
            </a>
          </div>

          {/* Social icons */}
          <div className="flex items-center gap-3">
            {SOCIAL.map(s => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1C1C27] hover:bg-zinc-700 text-[#A0A0B0] hover:text-white transition-all"
              >
                {s.icon}
              </a>
            ))}
          </div>
        </div>

        {/* Copyright */}
        <p className="text-center text-xs text-[#A0A0B0]">
          © 2026 Glynbox. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  )
}
