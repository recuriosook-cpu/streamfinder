'use client'

import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase'

/**
 * Cuántos comentarios tiene una guía, al lado de "Compartir guía". Lleva a la
 * sección de comentarios (`#comentarios`, ver `ComentariosHilo`). Va aparte de
 * la sección porque la página de la guía es del servidor y el número se pide
 * en el navegador: así la página se sigue generando estática.
 */
export default function CantidadComentarios({ slug }: { slug: string }) {
  const [supabase] = useState(createClient)
  const [cantidad, setCantidad] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('guide_comments')
      .select('id', { count: 'exact', head: true })
      .eq('guide_slug', slug)
      .then(({ count, error }) => {
        if (error) console.error('[comentarios] cantidad:', error.message)
        setCantidad(count ?? 0)
      })
  }, [supabase, slug])

  return (
    <a
      href="#comentarios"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A0A0B0] hover:text-white transition-colors"
    >
      <MessageCircle size={14} />
      {cantidad === null ? 'Comentarios' : `${cantidad} ${cantidad === 1 ? 'comentario' : 'comentarios'}`}
    </a>
  )
}
