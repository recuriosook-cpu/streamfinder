'use client'

import { useState, useRef, useEffect } from 'react'
import { Link2, Check, Loader2 } from 'lucide-react'

// ── Icons ──────────────────────────────────────────────────────────────────

function WhatsAppIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[#25D366] shrink-0">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.635L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  )
}

function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-pink-400 shrink-0">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  )
}

// ── Canvas helpers ─────────────────────────────────────────────────────────

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load: ' + url))
    img.src = url
  })
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = word }
    else cur = test
  }
  if (cur) lines.push(cur)
  return lines
}

function rrPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

async function generateStoryBlob(opts: {
  mediaTitle: string
  rating: number | null
  body: string | null
  authorUsername: string
  authorAvatarUrl: string | null
  posterPath: string | null
  backdropPath: string | null
}): Promise<Blob | null> {
  const { mediaTitle, rating, body, authorUsername, authorAvatarUrl, posterPath, backdropPath } = opts
  const W = 1080, H = 1920
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Background
  const drawGrad = () => {
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, '#1a1a2e'); g.addColorStop(1, '#0a0a0f')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  }
  if (backdropPath) {
    try {
      const bg = await loadImage(`https://image.tmdb.org/t/p/w1280${backdropPath}`)
      const scale = Math.max(W / bg.naturalWidth, H / bg.naturalHeight)
      const sw = bg.naturalWidth * scale, sh = bg.naturalHeight * scale
      ctx.drawImage(bg, (W - sw) / 2, (H - sh) / 2, sw, sh)
    } catch { drawGrad() }
  } else { drawGrad() }

  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H)

  // Avatar (80px diameter, yellow border 3px)
  const AVR = 40, AX = W / 2, AY = 110
  ctx.beginPath(); ctx.arc(AX, AY, AVR + 3, 0, Math.PI * 2)
  ctx.fillStyle = '#FFFD02'; ctx.fill()
  ctx.save(); ctx.beginPath(); ctx.arc(AX, AY, AVR, 0, Math.PI * 2); ctx.clip()
  let drawnAvatar = false
  if (authorAvatarUrl) {
    try {
      const av = await loadImage(authorAvatarUrl)
      ctx.drawImage(av, AX - AVR, AY - AVR, AVR * 2, AVR * 2)
      drawnAvatar = true
    } catch { /* fall through to initials */ }
  }
  if (!drawnAvatar) {
    ctx.fillStyle = '#2A2A3A'; ctx.fillRect(AX - AVR, AY - AVR, AVR * 2, AVR * 2)
    ctx.fillStyle = '#FFFD02'; ctx.font = 'bold 40px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(authorUsername[0]?.toUpperCase() ?? '?', AX, AY)
  }
  ctx.restore(); ctx.textBaseline = 'alphabetic'

  let curY = AY + AVR + 32  // ≈ 182

  // Poster 700×1050 (~55% of 1920)
  const PW = 700, PH = 1050, PX = (W - PW) / 2, PY = curY
  if (posterPath) {
    try {
      const p = await loadImage(`https://image.tmdb.org/t/p/w500${posterPath}`)
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20
      ctx.save(); rrPath(ctx, PX, PY, PW, PH, 20); ctx.clip()
      ctx.drawImage(p, PX, PY, PW, PH)
      ctx.restore(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
    } catch { ctx.fillStyle = '#27272A'; rrPath(ctx, PX, PY, PW, PH, 20); ctx.fill() }
  } else { ctx.fillStyle = '#27272A'; rrPath(ctx, PX, PY, PW, PH, 20); ctx.fill() }
  curY = PY + PH + 50  // ≈ 1282

  // Title
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 52px system-ui,-apple-system,sans-serif'; ctx.textAlign = 'center'
  for (const line of wrapText(ctx, mediaTitle, W - 120).slice(0, 2)) { ctx.fillText(line, W / 2, curY); curY += 65 }
  curY += 12

  // Stars
  if (rating != null) {
    const full = Math.floor(rating), half = rating % 1 >= 0.5, empty = 5 - full - (half ? 1 : 0)
    ctx.fillStyle = '#1DB954'; ctx.font = 'bold 56px system-ui,-apple-system,sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`${'★'.repeat(full)}${half ? '½' : ''}${'☆'.repeat(empty)}  ${rating}/5`, W / 2, curY)
    curY += 75
  }

  // Body excerpt (max 4 lines)
  if (body?.trim()) {
    curY += 20
    const excerpt = body.trim().slice(0, 200) + (body.trim().length > 200 ? '...' : '')
    ctx.fillStyle = '#FFFFFF'; ctx.font = '36px system-ui,-apple-system,sans-serif'; ctx.textAlign = 'center'
    for (const line of wrapText(ctx, excerpt, W - 160).slice(0, 4)) { ctx.fillText(line, W / 2, curY); curY += 50 }
  }

  // Logo Glynbox
  ctx.fillStyle = '#FFFD02'; ctx.font = 'bold 44px system-ui,-apple-system,sans-serif'; ctx.textAlign = 'center'
  ctx.fillText('Glynbox', W / 2, H - 130)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '30px system-ui,-apple-system,sans-serif'
  ctx.fillText('glynbox.com', W / 2, H - 84)

  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png'))
}

// ── Types ──────────────────────────────────────────────────────────────────

interface InstagramOpts {
  posterPath: string | null
  backdropPath: string | null
  mediaTitle: string
  rating: number | null
  body: string | null
  authorUsername: string
  authorAvatarUrl: string | null
}

interface Props {
  whatsappUrl: string
  twitterUrl: string
  copyUrl: string
  shareText?: string
  align?: 'left' | 'right'
  trigger?: React.ReactNode
  triggerClassName?: string
  /** When provided, shows the "Imagen para Instagram Stories" button */
  instagram?: InstagramOpts
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ShareDropdown({
  whatsappUrl,
  twitterUrl,
  copyUrl,
  align = 'left',
  trigger,
  triggerClassName = '',
  instagram,
}: Props) {
  const [open,      setOpen]      = useState(false)
  const [copied,    setCopied]    = useState(false)
  const [igLoading, setIgLoading] = useState(false)
  const [igToast,   setIgToast]   = useState(false)
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
    } catch { setOpen(false) }
  }

  const handleInstagram = async () => {
    if (!instagram) return
    setIgLoading(true)
    setOpen(false)
    try {
      const blob = await generateStoryBlob({
        mediaTitle:     instagram.mediaTitle,
        rating:         instagram.rating,
        body:           instagram.body,
        authorUsername: instagram.authorUsername,
        authorAvatarUrl: instagram.authorAvatarUrl,
        posterPath:     instagram.posterPath,
        backdropPath:   instagram.backdropPath,
      })
      if (!blob) return

      const fileName = `glynbox-${instagram.mediaTitle.replace(/\s+/g, '-').toLowerCase()}.png`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fileName
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setIgToast(true)
      setTimeout(() => setIgToast(false), 4000)
    } catch (err) {
      console.error('[Instagram story]', err)
    } finally {
      setIgLoading(false)
    }
  }

  return (
    <div className={`relative ${triggerClassName}`} ref={ref}>
      {/* Toast */}
      {igToast && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#13131A] border border-pink-500/40 text-white text-xs px-3 py-2 rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none">
          ¡Imagen lista! Subila a tus Instagram Stories
        </div>
      )}

      {/* Trigger button — always opens the custom menu */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Compartir"
        className="flex items-center gap-1.5 text-[#A0A0B0] hover:text-white transition-colors"
      >
        {trigger}
      </button>

      {open && (
        <div
          className={`absolute top-full mt-2 z-50 w-[220px] bg-[#13131A] border border-[#2A2A3A] rounded-xl shadow-2xl overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {/* 1. WhatsApp */}
          <button
            onClick={() => { window.open(whatsappUrl, '_blank'); setOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-white/5 transition-colors"
          >
            <WhatsAppIcon />
            Compartir en WhatsApp
          </button>

          {/* 2. X */}
          <button
            onClick={() => { window.open(twitterUrl, '_blank'); setOpen(false) }}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-white/5 transition-colors border-t border-[#2A2A3A]/60"
          >
            <XIcon />
            Compartir en X
          </button>

          {/* 3. Instagram Stories */}
          {instagram && (
            <button
              onClick={handleInstagram}
              disabled={igLoading}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-white/5 transition-colors border-t border-[#2A2A3A]/60 disabled:opacity-60"
            >
              {igLoading
                ? <Loader2 size={15} className="animate-spin text-pink-400 shrink-0" />
                : <InstagramIcon />
              }
              {igLoading ? 'Generando imagen...' : 'Compartir en Instagram'}
            </button>
          )}

          {/* 4. Copiar link */}
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-zinc-200 hover:bg-white/5 transition-colors border-t border-[#2A2A3A]/60"
          >
            {copied
              ? <Check size={15} className="text-[#FFFD02] shrink-0" />
              : <Link2  size={15} className="shrink-0" />
            }
            {copied ? '¡Link copiado!' : 'Copiar link'}
          </button>
        </div>
      )}
    </div>
  )
}
