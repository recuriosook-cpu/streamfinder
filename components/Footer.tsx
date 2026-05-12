import Link from 'next/link'

function XIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.635L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function TikTokIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.77 1.52V6.76a4.85 4.85 0 01-1-.07z" />
    </svg>
  )
}

const COL_TITLE = 'text-[13px] font-semibold uppercase tracking-wider mb-4'
const NAV_LINK  = 'text-[#A0A0B0] hover:text-white transition-colors text-sm leading-relaxed'

export default function Footer() {
  return (
    <footer className="bg-[#0A0A0F] border-t border-[#2A2A3A]">
      <div className="max-w-7xl mx-auto px-4 pt-12 pb-6">

        {/* Three-column grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 mb-10">

          {/* Col 1 — Brand */}
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Glynbox" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} className="mb-4" />
            <p className="text-[#A0A0B0] text-sm leading-relaxed mb-5">
              La comunidad de cine y series más activa de habla hispana.
            </p>
            <div className="flex items-center gap-3">
              {[
                { label: 'X (Twitter)', href: 'https://x.com/Glynboxapp',        icon: <XIcon /> },
                { label: 'Instagram',  href: 'https://instagram.com/glynboxapp', icon: <InstagramIcon /> },
                { label: 'TikTok',     href: 'https://tiktok.com/@glynboxapp',   icon: <TikTokIcon /> },
              ].map(s => (
                <a
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="text-[#A0A0B0] hover:text-[#FFFD02] transition-colors"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Col 2 — Glynbox links */}
          <div>
            <p className={COL_TITLE} style={{ color: '#FFFD02' }}>Glynbox</p>
            <ul className="space-y-2.5">
              {[
                { label: 'Guías',       href: '/guias'      },
                { label: 'Listas',      href: '/listas'     },
                { label: 'Comunidad',   href: '/comunidad'  },
                { label: 'Qué ver',     href: '/que-ver'    },
                { label: 'Anunciantes', href: '/anunciantes'},
              ].map(l => (
                <li key={l.href}>
                  <Link href={l.href} className={NAV_LINK}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — Support links */}
          <div>
            <p className={COL_TITLE} style={{ color: '#FFFD02' }}>Ayuda</p>
            <ul className="space-y-2.5">
              {[
                { label: 'Soporte',    href: '/soporte'                     },
                { label: 'Privacidad', href: '/privacidad'                  },
                { label: 'Términos',   href: '/terminos'                    },
                { label: 'Contacto',   href: 'mailto:contacto@glynbox.com' },
              ].map(l => (
                <li key={l.href}>
                  <Link href={l.href} className={NAV_LINK}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Divider + copyright */}
        <div className="border-t border-[#2A2A3A] pt-6">
          <p className="text-center text-xs text-[#A0A0B0]">
            © 2026 Glynbox. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
