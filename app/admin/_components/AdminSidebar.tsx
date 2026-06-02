'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, Activity, Flag, BarChart3,
  Shield, X, Menu, ArrowLeft, ChevronRight,
} from 'lucide-react'

const NAV = [
  { href: '/admin',           icon: LayoutDashboard, label: 'Resumen',   emoji: '📊' },
  { href: '/admin/usuarios',  icon: Users,            label: 'Usuarios',  emoji: '👥' },
  { href: '/admin/actividad', icon: Activity,         label: 'Actividad', emoji: '🎬' },
  { href: '/admin/reportes',  icon: Flag,             label: 'Reportes',  emoji: '🚨' },
  { href: '/admin/metricas',  icon: BarChart3,        label: 'Métricas',  emoji: '📈' },
]

interface Props {
  username: string
  avatarUrl: string | null
  displayName: string | null
}

export default function AdminSidebar({ username, avatarUrl, displayName }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const [open, setOpen] = useState(false)

  // Close on route change
  useEffect(() => { setOpen(false) }, [pathname])

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  const SidebarContent = () => (
    <>
      {/* Logo / title */}
      <div className="px-5 py-5 border-b border-[#2A2A3A]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#FFFD02]/20 flex items-center justify-center shrink-0">
            <Shield size={18} className="text-[#FFFD02]" />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-none">Admin</p>
            <p className="text-[11px] text-[#FFFD02] mt-0.5 font-medium">Glynbox</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label, emoji }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                active
                  ? 'bg-[#FFFD02] text-black'
                  : 'text-[#A0A0B0] hover:text-white hover:bg-[#1C1C27]'
              }`}
            >
              <span className="text-base leading-none">{emoji}</span>
              <span>{label}</span>
              {active && <ChevronRight size={14} className="ml-auto" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-[#2A2A3A] space-y-3">
        {/* Admin profile */}
        <div className="flex items-center gap-3 px-1">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-[#1C1C27] shrink-0">
            {avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-xs font-bold text-[#FFFD02]">
                  {username[0]}
                </div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{displayName ?? username}</p>
            <p className="text-[10px] text-[#A0A0B0]">@{username}</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#1D9BF0"/><path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>

        {/* Back to app */}
        <button
          onClick={() => router.push('/')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[#A0A0B0] hover:text-white hover:bg-[#1C1C27] transition-colors"
        >
          <ArrowLeft size={13} />
          Volver a la app
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[#0A0A0F] border-b border-[#2A2A3A] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-[#FFFD02]" />
          <span className="text-sm font-bold text-white">Admin Glynbox</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="p-2 text-[#A0A0B0] hover:text-white transition-colors"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Mobile offset */}
      <div className="lg:hidden h-[49px] shrink-0" />

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-72 bg-[#0D0D14] border-r border-[#2A2A3A] flex flex-col h-full z-10">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-[#A0A0B0] hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-full w-64 bg-[#0D0D14] border-r border-[#2A2A3A] flex-col z-30">
        <SidebarContent />
      </aside>
    </>
  )
}
