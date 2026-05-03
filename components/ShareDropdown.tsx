'use client'
import { useState } from 'react'

interface ShareDropdownProps {
  whatsappUrl: string
  twitterUrl: string
  copyUrl: string
  shareText: string
  align?: 'left' | 'right'
  triggerClassName?: string
  trigger?: React.ReactNode
  instagram?: {
    posterPath: string | null
    backdropPath: string | null
    mediaTitle: string
    rating: number | null
    body: string | null
    authorUsername: string
    authorAvatarUrl: string | null
  }
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}

function drawStars(ctx: CanvasRenderingContext2D, rating: number, x: number, y: number, starSize = 50) {
  const gap = 10
  const totalWidth = (starSize + gap) * 5 - gap
  let startX = x - totalWidth / 2

  for (let i = 0; i < 5; i++) {
    const fill = Math.min(1, Math.max(0, rating - i))
    ctx.fillStyle = 'rgba(255,253,2,0.3)'
    drawStar(ctx, startX + starSize / 2, y, starSize / 2)
    if (fill > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(startX, y - starSize / 2, starSize * fill, starSize)
      ctx.clip()
      ctx.fillStyle = '#FFFD02'
      drawStar(ctx, startX + starSize / 2, y, starSize / 2)
      ctx.restore()
    }
    startX += starSize + gap
  }
}

export default function ShareDropdown({
  whatsappUrl,
  twitterUrl,
  copyUrl,
  triggerClassName,
  trigger,
  instagram,
}: ShareDropdownProps) {
  const [open,       setOpen]       = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [generating, setGenerating] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copyUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const generateAndDownload = async (platform: 'instagram' | 'tiktok') => {
    if (!instagram) return
    setGenerating(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width  = 1080
      canvas.height = 1920
      const ctx = canvas.getContext('2d')!

      // Fondo con degradé
      const gradient = ctx.createLinearGradient(0, 0, 1080, 1920)
      gradient.addColorStop(0, '#1a1a2e')
      gradient.addColorStop(0.5, '#16213e')
      gradient.addColorStop(1, '#0f3460')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 1080, 1920)

      // Backdrop con overlay suave
      if (instagram.backdropPath) {
        try {
          const bg = new Image()
          bg.crossOrigin = 'anonymous'
          await new Promise<void>((res, rej) => { bg.onload = () => res(); bg.onerror = rej; bg.src = `https://image.tmdb.org/t/p/w1280${instagram.backdropPath}` })
          const scale = Math.max(1080 / bg.naturalWidth, 1920 / bg.naturalHeight)
          const sw = bg.naturalWidth * scale, sh = bg.naturalHeight * scale
          ctx.drawImage(bg, (1080 - sw) / 2, (1920 - sh) / 2, sw, sh)
          ctx.fillStyle = 'rgba(0,0,0,0.6)'
          ctx.fillRect(0, 0, 1080, 1920)
        } catch { /* keep gradient bg */ }
      }

      // Avatar: centro y=120, radio=60 — solo círculo, sin borde ni texto
      if (instagram.authorAvatarUrl) {
        try {
          const avatar = new Image()
          avatar.crossOrigin = 'anonymous'
          await new Promise<void>((res, rej) => { avatar.onload = () => res(); avatar.onerror = rej; avatar.src = instagram.authorAvatarUrl! })
          ctx.save()
          ctx.beginPath()
          ctx.arc(540, 120, 60, 0, Math.PI * 2)
          ctx.clip()
          ctx.drawImage(avatar, 480, 60, 120, 120)
          ctx.restore()
        } catch { /* skip avatar */ }
      }

      // Póster: y=200, alto=800 → termina en y=1000
      if (instagram.posterPath) {
        try {
          const poster = new Image()
          poster.crossOrigin = 'anonymous'
          await new Promise<void>((res, rej) => { poster.onload = () => res(); poster.onerror = rej; poster.src = `https://image.tmdb.org/t/p/w500${instagram.posterPath}` })
          const pw = 600, ph = 800, px = (1080 - pw) / 2, py = 200
          ctx.save()
          ctx.beginPath()
          ctx.roundRect(px, py, pw, ph, 30)
          ctx.clip()
          ctx.drawImage(poster, px, py, pw, ph)
          ctx.restore()
        } catch { /* skip poster */ }
      }

      // Título: y=1080 (80px después del póster que termina en 1000)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 60px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(instagram.mediaTitle, 540, 1080)

      // Estrellas: y=1180, tamaño 65px con sombra
      if (instagram.rating) {
        ctx.save()
        ctx.shadowColor = 'rgba(0,0,0,0.5)'
        ctx.shadowBlur = 10
        ctx.shadowOffsetY = 3
        drawStars(ctx, instagram.rating, 540, 1180, 65)
        ctx.restore()
      }

      // Texto de reseña: empieza en y=1280
      if (instagram.body) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.font = '36px Arial'
        ctx.textAlign = 'center'
        const maxChars = 120
        const text  = instagram.body.length > maxChars ? instagram.body.slice(0, maxChars) + '...' : instagram.body
        const words = text.split(' ')
        let line = '', y = 1280
        for (const word of words) {
          const test = line + word + ' '
          if (ctx.measureText(test).width > 900 && line) {
            ctx.fillText(line.trim(), 540, y)
            line = word + ' '
            y += 50
            if (y > 1550) break
          } else {
            line = test
          }
        }
        if (line.trim()) ctx.fillText(line.trim(), 540, y)
      }

      // Logo: y=1820 — imagen /logo.png con fallback a texto
      try {
        const logo = new Image()
        logo.crossOrigin = 'anonymous'
        await new Promise<void>((res, rej) => { logo.onload = () => res(); logo.onerror = rej; logo.src = window.location.origin + '/logo.png' })
        const logoW = 300
        const logoH = (logo.height / logo.width) * logoW
        ctx.drawImage(logo, 540 - logoW / 2, 1820 - logoH / 2, logoW, logoH)
      } catch {
        ctx.fillStyle = '#FFFD02'
        ctx.font = 'bold 36px Arial'
        ctx.textAlign = 'center'
        ctx.fillText('glynbox.com', 540, 1820)
      }

      // Descargar
      canvas.toBlob(blob => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const a   = document.createElement('a')
        a.href     = url
        a.download = `glynbox-${platform}-story.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 'image/png')

      setOpen(false)
    } catch (err) {
      console.error('[generateAndDownload]', err)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className={triggerClassName}
      >
        {trigger ?? 'Compartir'}
      </button>

      {open && (
        <>
          {/* Overlay */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setOpen(false)}
          />

          {/* Menu */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 9999,
            background: '#13131A',
            border: '1px solid #2A2A3A',
            borderRadius: '16px',
            padding: '16px',
            width: 'min(280px, 90vw)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>Compartir</span>
              <button
                onClick={() => setOpen(false)}
                style={{ color: '#A0A0B0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '2px 6px' }}
              >×</button>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

              {/* WhatsApp */}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#1C1C27', borderRadius: '10px', color: '#fff', textDecoration: 'none', cursor: 'pointer' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                <span style={{ fontSize: '14px' }}>WhatsApp</span>
              </a>

              {/* Facebook */}
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(copyUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#1C1C27', borderRadius: '10px', color: '#fff', textDecoration: 'none', cursor: 'pointer' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                <span style={{ fontSize: '14px' }}>Facebook</span>
              </a>

              {/* X */}
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#1C1C27', borderRadius: '10px', color: '#fff', textDecoration: 'none', cursor: 'pointer' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.635L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>
                <span style={{ fontSize: '14px' }}>X (Twitter)</span>
              </a>

              {/* Instagram Stories */}
              <button
                onClick={() => generateAndDownload('instagram')}
                disabled={generating}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#1C1C27', borderRadius: '10px', color: '#fff', border: 'none', cursor: generating ? 'wait' : 'pointer', width: '100%', textAlign: 'left', opacity: generating ? 0.7 : 1 }}
              >
                <div style={{ width: 20, height: 20, borderRadius: 6, background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none"/></svg>
                </div>
                <span style={{ fontSize: '14px' }}>{generating ? 'Generando...' : 'Instagram Stories'}</span>
              </button>

              {/* TikTok */}
              <button
                onClick={() => generateAndDownload('tiktok')}
                disabled={generating}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#1C1C27', borderRadius: '10px', color: '#fff', border: 'none', cursor: generating ? 'wait' : 'pointer', width: '100%', textAlign: 'left', opacity: generating ? 0.7 : 1 }}
              >
                <div style={{ width: 20, height: 20, borderRadius: 4, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.77 1.52V6.76a4.85 4.85 0 01-1-.07z"/></svg>
                </div>
                <span style={{ fontSize: '14px' }}>{generating ? 'Generando...' : 'TikTok'}</span>
              </button>

              {/* Copiar link */}
              <button
                onClick={handleCopy}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: copied ? '#FFFD0220' : '#1C1C27', borderRadius: '10px', color: copied ? '#FFFD02' : '#fff', border: copied ? '1px solid #FFFD02' : 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={copied ? '#FFFD02' : 'white'} strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                <span style={{ fontSize: '14px' }}>{copied ? '¡Link copiado!' : 'Copiar link'}</span>
              </button>

            </div>
          </div>
        </>
      )}
    </>
  )
}
