'use client'

import { useState } from 'react'
import { Loader2, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { track } from '@/lib/analytics'

/**
 * El botón de las historias de compartir (calificación, lista y top 5): pide
 * la imagen a `/api/share/...` con la sesión (es del mismo sitio, así que va
 * la cookie) y abre el menú de compartir del navegador con la imagen. Donde
 * el navegador no deja compartir archivos (casi todas las computadoras), la
 * descarga.
 *
 * El texto lleva el link a la descarga con `?src=compartir`, igual que en la
 * app (`LINK_COMPARTIR` en `lib/share.ts` de glynbox-mobile).
 */

export const LINK_COMPARTIR = 'https://www.glynbox.com/descargar?src=compartir'

type Que = 'calificacion' | 'lista' | 'top5' | 'que_veo_hoy' | 'guia'
type Desde = 'ficha' | 'lista' | 'perfil' | 'que_veo_hoy' | 'guia'

interface Props {
  que: Que
  desde: Desde
  imagen: string
  mensaje: string
  etiqueta: string
  /**
   * Un link para copiar al tocar, con el aviso para pegarlo con el sticker de
   * enlace de la historia (Instagram no deja precargarlo). Lo usan las guías.
   */
  copiar?: string
  className?: string
}

export default function CompartirHistoria({ que, desde, imagen, mensaje, etiqueta, copiar, className }: Props) {
  const [armando, setArmando] = useState(false)

  async function compartir() {
    if (armando) return
    setArmando(true)
    track('compartir_abierto', { que, desde })
    // Antes de bajar la imagen: el portapapeles pide que sea apenas se tocó.
    if (copiar) {
      try {
        await navigator.clipboard.writeText(copiar)
        toast.success('Link copiado: pegalo en la historia con el sticker de enlace')
      } catch { /* sin permiso: se comparte igual */ }
    }
    try {
      const res = await fetch(imagen, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Imagen: ${res.status}`)
      // PNG o JPEG (`?jpg=1`): el nombre del archivo, según lo que vino.
      const blob = await res.blob()
      const jpeg = blob.type === 'image/jpeg'
      const archivo = new File([blob], `glynbox-${que}.${jpeg ? 'jpg' : 'png'}`, { type: jpeg ? 'image/jpeg' : 'image/png' })
      const texto = `${mensaje} ${LINK_COMPARTIR}`

      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo], text: texto })
          track('compartir_hecho', { que, desde, metodo: 'menu' })
        } catch { /* cerró el menú */ }
        return
      }

      const url = URL.createObjectURL(archivo)
      const a = document.createElement('a')
      a.href = url
      a.download = archivo.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      track('compartir_hecho', { que, desde, metodo: 'descarga' })
      toast.success('Imagen descargada: subila a tu historia')
    } catch (err) {
      console.error('[CompartirHistoria]', err)
      toast.error('No se pudo armar la imagen. Probá de nuevo.')
    } finally {
      setArmando(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void compartir()}
      disabled={armando}
      className={className ?? 'inline-flex items-center gap-1.5 text-xs font-semibold text-[#FFFD02] hover:underline disabled:opacity-50'}
    >
      {armando ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
      {etiqueta}
    </button>
  )
}
