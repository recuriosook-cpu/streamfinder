'use client'
import { useEffect, useState } from 'react'

interface ShareDropdownProps {
  whatsappUrl: string
  twitterUrl: string
  copyUrl: string
  shareText: string
  align?: 'left' | 'right'
  triggerClassName?: string
  trigger?: React.ReactNode
  /**
   * Imágenes para compartir, como rutas relativas de /api/share (ver
   * lib/share-urls.ts). Con esto aparecen Instagram y "Descargar imagen".
   * Las reseñas la pasan sólo si son de quien mira.
   */
  image?: {
    historia: string
    publicacion?: string
    /** Base del nombre del archivo, sin extensión. */
    nombre: string
  }
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#1C1C27',
  borderRadius: '10px', color: '#fff', textDecoration: 'none', cursor: 'pointer', border: 'none',
  width: '100%', textAlign: 'left',
}

async function fetchImage(path: string, nombre: string): Promise<File> {
  // `same-origin` manda la cookie: el autor puede bajar su reseña aunque tenga
  // "Ocultar actividad".
  const res = await fetch(path, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`No se pudo generar la imagen (${res.status})`)
  const blob = await res.blob()
  return new File([blob], `${nombre}.png`, { type: blob.type || 'image/png' })
}

function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function ShareDropdown({
  whatsappUrl,
  twitterUrl,
  copyUrl,
  shareText,
  triggerClassName,
  trigger,
  image,
}: ShareDropdownProps) {
  const [open,    setOpen]    = useState(false)
  const [copied,  setCopied]  = useState(false)
  const [working, setWorking] = useState<null | 'instagram' | 'historia' | 'publicacion'>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [canNativeShare, setCanNativeShare] = useState(false)

  // Se mira al montar y no en el render: en el servidor no hay `navigator`.
  useEffect(() => { setCanNativeShare(typeof navigator !== 'undefined' && !!navigator.share) }, [])

  const close = () => { setOpen(false); setError(null) }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copyUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /**
   * Instagram no tiene link para compartir desde la web. En el celular se abre
   * el menú del sistema con la imagen de historia (ahí está Instagram); donde
   * no se puede compartir un archivo (la compu), se descarga.
   */
  const handleInstagram = async () => {
    if (!image) return
    setWorking('instagram')
    setError(null)
    try {
      const file = await fetchImage(image.historia, `${image.nombre}-historia`)
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] })
      } else {
        download(file)
      }
      close()
    } catch (err) {
      // Cerrar el menú del sistema no es un error.
      if ((err as Error).name !== 'AbortError') setError((err as Error).message)
    } finally {
      setWorking(null)
    }
  }

  const handleDownload = async (formato: 'historia' | 'publicacion') => {
    const path = formato === 'historia' ? image?.historia : image?.publicacion
    if (!path || !image) return
    setWorking(formato)
    setError(null)
    try {
      download(await fetchImage(path, `${image.nombre}-${formato}`))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking(null)
    }
  }

  const handleNativeShare = async () => {
    try {
      await navigator.share({ text: shareText, url: copyUrl })
      close()
    } catch { /* cancelado */ }
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
            onClick={close}
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
            width: 'min(300px, 90vw)',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ color: '#fff', fontWeight: 600, fontSize: '15px' }}>Compartir</span>
              <button
                onClick={close}
                aria-label="Cerrar"
                style={{ color: '#A0A0B0', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '2px 6px' }}
              >×</button>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>

              {/* WhatsApp */}
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" onClick={close} style={rowStyle}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                <span style={{ fontSize: '14px' }}>WhatsApp</span>
              </a>

              {/* Facebook. `sharer.php` sólo acepta el link: el texto lo pone
                  quien publica (Meta ignora cualquier texto precargado). La
                  vista previa sale de los metadatos de la página. */}
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(copyUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                style={rowStyle}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                <span style={{ fontSize: '14px' }}>Facebook</span>
              </a>

              {/* X */}
              <a href={twitterUrl} target="_blank" rel="noopener noreferrer" onClick={close} style={rowStyle}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.635L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg>
                <span style={{ fontSize: '14px' }}>X</span>
              </a>

              {image && (
                <>
                  {/* Instagram */}
                  <button onClick={handleInstagram} disabled={working !== null} style={{ ...rowStyle, cursor: working ? 'wait' : 'pointer', opacity: working && working !== 'instagram' ? 0.6 : 1 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none"/></svg>
                    </div>
                    <span style={{ fontSize: '14px' }}>{working === 'instagram' ? 'Generando…' : 'Historia de Instagram'}</span>
                  </button>

                  {/* Descargar */}
                  <button onClick={() => handleDownload('historia')} disabled={working !== null} style={{ ...rowStyle, cursor: working ? 'wait' : 'pointer', opacity: working && working !== 'historia' ? 0.6 : 1 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span style={{ fontSize: '14px' }}>{working === 'historia' ? 'Generando…' : 'Descargar imagen (historia)'}</span>
                  </button>
                  {image.publicacion && (
                    <button onClick={() => handleDownload('publicacion')} disabled={working !== null} style={{ ...rowStyle, cursor: working ? 'wait' : 'pointer', opacity: working && working !== 'publicacion' ? 0.6 : 1 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      <span style={{ fontSize: '14px' }}>{working === 'publicacion' ? 'Generando…' : 'Descargar imagen (publicación)'}</span>
                    </button>
                  )}
                </>
              )}

              {/* Copiar link */}
              <button
                onClick={handleCopy}
                style={{ ...rowStyle, background: copied ? '#FFFD0220' : '#1C1C27', color: copied ? '#FFFD02' : '#fff', border: copied ? '1px solid #FFFD02' : 'none' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={copied ? '#FFFD02' : 'white'} strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                <span style={{ fontSize: '14px' }}>{copied ? '¡Link copiado!' : 'Copiar link'}</span>
              </button>

              {/* El menú del sistema, donde lo hay (celulares): todas las apps. */}
              {canNativeShare && (
                <button onClick={handleNativeShare} style={rowStyle}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
                  <span style={{ fontSize: '14px' }}>Más opciones…</span>
                </button>
              )}

              {error && (
                <div style={{ color: '#fca5a5', fontSize: '13px', padding: '4px 2px' }}>{error}</div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}
