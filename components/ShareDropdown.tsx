'use client'

import { useState, useRef, useEffect } from 'react'
import { Share2, Link2, Check } from 'lucide-react'

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[#FFFD02]">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.635L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  )
}

interface Props {
  whatsappUrl: string
  twitterUrl: string
  copyUrl: string
  /** Which side the dropdown aligns to. Default: left */
  align?: 'left' | 'right'
  /** Custom trigger; defaults to a Share2 icon button */
  trigger?: React.ReactNode
  /** Extra class on the trigger wrapper */
  triggerClassName?: string
}

export default function ShareDropdown({
  whatsappUrl,
  twitterUrl,
  copyUrl,
  align = 'left',
  trigger,
  triggerClassName = '',
}: Props) {
  const [open,   setOpen]   = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyUrl)
      setCopied(true)
      setTimeout(() => { setCopied(false); setOpen(false) }, 1500)
    } catch {
      // fallback: just close
      setOpen(false)
    }
  }

  return (
    <div className={`relative ${triggerClassName}`} ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Compartir"
        className="flex items-center gap-1.5 text-[#A0A0B0] hover:text-white transition-colors"
      >
        {trigger ?? <Share2 size={15} />}
      </button>

      {open && (
        <div
          className={`absolute top-full mt-2 z-50 w-52 bg-[#1C1C27] border border-[#2A2A3A] rounded-xl shadow-2xl overflow-hidden
            ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-700/70 transition-colors"
          >
            <WhatsAppIcon />
            Compartir en WhatsApp
          </a>
          <a
            href={twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-700/70 transition-colors border-t border-[#2A2A3A]/50"
          >
            <XIcon />
            Compartir en X
          </a>
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-700/70 transition-colors border-t border-[#2A2A3A]/50"
          >
            {copied ? <Check size={15} className="text-[#FFFD02]" /> : <Link2 size={15} />}
            {copied ? '¡Link copiado!' : 'Copiar link'}
          </button>
        </div>
      )}
    </div>
  )
}
