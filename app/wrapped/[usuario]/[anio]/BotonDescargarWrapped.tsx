'use client'

import { useSyncExternalStore } from 'react'
import { isRunningInApp } from '@/lib/app-mode'

/**
 * "Descargá Glynbox y armá el tuyo", para quien mira un Wrapped ajeno sin la
 * app. Dentro de la app (o la PWA instalada) no se muestra. Lleva a
 * /descargar con `src=wrapped`, así las tiendas cuentan de dónde vino.
 */
const noHayASuscribirse = () => () => {}

export default function BotonDescargarWrapped({ texto }: { texto: string }) {
  // En el servidor no se sabe: se muestra, y se saca al hidratar si es la app.
  const enApp = useSyncExternalStore(noHayASuscribirse, isRunningInApp, () => false)
  if (enApp) return null
  return (
    <a
      href="/descargar?src=wrapped"
      className="w-full rounded-full py-3.5 text-center font-bold text-white transition-opacity hover:opacity-90"
      style={{ background: 'linear-gradient(90deg, #8B5CF6, #EC4899)' }}
    >
      {texto}
    </a>
  )
}
