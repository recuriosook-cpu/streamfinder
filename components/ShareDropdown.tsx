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

export default function ShareDropdown({
  whatsappUrl,
  twitterUrl,
  copyUrl,
  shareText,
  triggerClassName,
  trigger,
  instagram,
}: ShareDropdownProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copyUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleInstagram = () => {
    alert('Función de Instagram Stories próximamente disponible')
    setOpen(false)
  }

  const handleTikTok = () => {
    alert('Función de TikTok Stories próximamente disponible')
    setOpen(false)
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
            width: '280px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>Compartir</span>
              <button
                onClick={() => setOpen(false)}
                style={{ color: '#A0A0B0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}
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
                <span style={{ fontSize: '20px' }}>💬</span>
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
                <span style={{ fontSize: '20px' }}>📘</span>
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
                <span style={{ fontSize: '20px' }}>𝕏</span>
                <span style={{ fontSize: '14px' }}>X (Twitter)</span>
              </a>

              {/* Instagram Stories */}
              <button
                onClick={handleInstagram}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#1C1C27', borderRadius: '10px', color: '#fff', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
              >
                <span style={{ fontSize: '20px' }}>📸</span>
                <span style={{ fontSize: '14px' }}>Instagram Stories</span>
              </button>

              {/* TikTok */}
              <button
                onClick={handleTikTok}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#1C1C27', borderRadius: '10px', color: '#fff', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
              >
                <span style={{ fontSize: '20px' }}>🎵</span>
                <span style={{ fontSize: '14px' }}>TikTok</span>
              </button>

              {/* Copiar link */}
              <button
                onClick={handleCopy}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: copied ? '#FFFD0220' : '#1C1C27', borderRadius: '10px', color: copied ? '#FFFD02' : '#fff', border: copied ? '1px solid #FFFD02' : 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
              >
                <span style={{ fontSize: '20px' }}>{copied ? '✅' : '🔗'}</span>
                <span style={{ fontSize: '14px' }}>{copied ? '¡Link copiado!' : 'Copiar link'}</span>
              </button>

            </div>
          </div>
        </>
      )}
    </>
  )
}
