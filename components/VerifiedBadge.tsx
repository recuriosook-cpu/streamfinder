'use client'

import { useEffect, useState } from 'react'
import { cargarVerificados, verificadosCargados } from '@/lib/verified'

/**
 * El tilde azul de cuenta verificada. Se dibuja sólo si `userId` está en
 * `profiles.verified` (ver `lib/verified.ts`); si no, no ocupa lugar.
 *
 * Es el único: cualquier nombre de usuario que se muestre va con
 * `<VerifiedBadge userId={…} />` al lado.
 */
export default function VerifiedBadge({
  userId,
  size = 14,
  className = '',
}: {
  userId: string | null | undefined
  size?: number
  className?: string
}) {
  const [verificados, setVerificados] = useState(verificadosCargados)

  useEffect(() => {
    if (verificados) return
    let vivo = true
    void cargarVerificados().then(set => { if (vivo) setVerificados(set) })
    return () => { vivo = false }
  }, [verificados])

  const verificado = !!userId && !!verificados?.has(userId)
  if (!verificado) return null
  return (
    <span title="Cuenta verificada" className={`inline-flex shrink-0 cursor-default align-middle ${className}`}>
      <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="10" cy="10" r="10" fill="#1D9BF0" />
        <path d="M5.5 10.25L8.5 13.25L14.5 7.25" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
