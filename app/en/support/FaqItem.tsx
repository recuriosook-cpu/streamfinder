'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

/** Una pregunta frecuente que se abre y se cierra. Igual a la de `app/soporte/page.tsx`. */
export default function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-[#2A2A3A] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left bg-[#13131A] hover:bg-[#1C1C27] transition-colors"
      >
        <span className="text-sm font-semibold text-white">{q}</span>
        <ChevronDown size={16} className={`text-[#A0A0B0] shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 py-4 text-sm text-[#A0A0B0] leading-relaxed bg-[#0F0F14] border-t border-[#2A2A3A]">
          {a}
        </div>
      )}
    </div>
  )
}
