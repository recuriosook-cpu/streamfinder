'use client'

import { Heart } from 'lucide-react'

/**
 * El me gusta de un comentario: el corazón y cuántos tiene. Sin sesión se ve
 * pero no se puede tocar. El estado lo lleva `useMeGustaComentarios`.
 */
export default function MeGustaComentario({
  cantidad,
  mio,
  onClick,
  puedeTocar,
  size = 11,
}: {
  cantidad: number
  mio: boolean
  onClick: () => void
  puedeTocar: boolean
  size?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!puedeTocar}
      aria-pressed={mio}
      title={mio ? 'Sacar me gusta' : 'Me gusta'}
      className={`inline-flex items-center gap-1 text-[10px] transition-colors disabled:cursor-default ${
        mio ? 'text-red-400' : 'text-zinc-600 hover:text-red-400 disabled:hover:text-zinc-600'
      }`}
    >
      <Heart size={size} fill={mio ? 'currentColor' : 'none'} />
      {cantidad > 0 && <span className="tabular-nums">{cantidad}</span>}
    </button>
  )
}
