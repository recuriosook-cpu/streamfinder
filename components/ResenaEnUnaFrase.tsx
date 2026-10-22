'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase'
import { track } from '@/lib/analytics'
import { avisoDeLinks, esRechazoPorLinks, MENSAJE_SIN_LINKS } from '@/lib/sin-links'

/**
 * "¿La resumís en una frase?", debajo de las estrellas, después de calificar
 * con 4 o 5. Casi nadie escribía reseñas: el formulario completo es mucho para
 * alguien que sólo quería poner la nota. Una frase corta, y si la escribe,
 * queda como reseña normal (con la nota que acaba de poner).
 *
 * Se ignora sin molestar: no tapa nada, se cierra con la X y no vuelve a salir
 * ese día (`puedeOfrecerFrase`). Es lo mismo que `ResumenEnUnaFrase` de la app.
 */

/** Hasta dónde llega "una frase". La reseña completa sigue en "Escribir reseña". */
export const FRASE_MAX = 140

const claveDia = (userId: string) => `glynbox_frase_ofrecida_${userId}`

function hoy(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/**
 * ¿Se le puede ofrecer ahora? Una vez por día por persona (en este
 * navegador), y nunca si ya tiene una reseña escrita de este título. Si algo
 * falla, no: es mejor no ofrecer que ofrecer dos veces.
 */
export async function puedeOfrecerFrase(userId: string, mediaId: number, mediaType: 'movie' | 'tv'): Promise<boolean> {
  try {
    if (localStorage.getItem(claveDia(userId)) === hoy()) return false
  } catch { return false }
  const { data, error } = await createClient()
    .from('reviews')
    .select('body')
    .eq('user_id', userId)
    .eq('media_id', mediaId)
    .eq('media_type', mediaType)
    .maybeSingle()
  if (error) return false
  return !(data?.body ?? '').trim()
}

export function anotarFraseOfrecida(userId: string): void {
  try { localStorage.setItem(claveDia(userId), hoy()) } catch { /* sin storage, puede volver a salir */ }
}

interface Props {
  userId: string
  mediaId: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string | null
  rating: number
  onClose: () => void
}

export default function ResenaEnUnaFrase({ userId, mediaId, mediaType, title, posterPath, rating, onClose }: Props) {
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const frase = texto.trim()

  const cerrar = () => {
    track('resena_frase_descartada', { media_type: mediaType, media_id: mediaId })
    onClose()
  }

  async function publicar() {
    if (frase.length < 2 || guardando) return
    const aviso = avisoDeLinks('resena', frase)
    if (aviso) { toast.error(aviso); return }
    setGuardando(true)
    const { error } = await createClient().from('reviews').upsert({
      user_id:     userId,
      media_id:    mediaId,
      media_type:  mediaType,
      title,
      poster_path: posterPath,
      rating,
      body:        frase,
      recommended: rating >= 4,
      has_spoiler: false,
      created_at:  new Date().toISOString(),
    }, { onConflict: 'user_id,media_id,media_type' })
    setGuardando(false)
    if (error) {
      console.error('[ResenaEnUnaFrase]', error)
      toast.error(esRechazoPorLinks(error) ? MENSAJE_SIN_LINKS.resena : 'No se pudo publicar. Intentá de nuevo.')
      return
    }
    track('resena_frase_guardada', { media_type: mediaType, media_id: mediaId, nota: rating, largo: frase.length })
    toast.success('¡Reseña publicada!')
    // La lista de reseñas de la ficha (`ReviewsSection`) la escucha y recarga.
    window.dispatchEvent(new CustomEvent('glynbox:resena-guardada', { detail: { mediaId, mediaType } }))
    onClose()
  }

  return (
    <div className="mt-3 w-full max-w-md rounded-xl border border-[#2A2A3A] bg-[#13131A] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-white">¿La resumís en una frase?</p>
        <button
          type="button"
          onClick={cerrar}
          className="text-[#A0A0B0] hover:text-white transition-colors"
          aria-label="Ahora no"
        >
          <X size={16} />
        </button>
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={e => { e.preventDefault(); void publicar() }}
      >
        <input
          type="text"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          maxLength={FRASE_MAX}
          placeholder="Ej.: El final te deja pensando días"
          className="flex-1 min-w-0 bg-[#0A0A0F] border border-[#2A2A3A] rounded-lg px-3 py-2 text-sm text-white outline-none placeholder-[#6B6B7B] focus:border-[#FFFD02]"
        />
        <button
          type="submit"
          disabled={frase.length < 2 || guardando}
          className="shrink-0 rounded-lg bg-[#FFFD02] px-3 py-2 text-sm font-bold text-black disabled:opacity-40"
        >
          {guardando ? '…' : 'Publicar'}
        </button>
      </form>
    </div>
  )
}
