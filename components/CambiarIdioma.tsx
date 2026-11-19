'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Languages } from 'lucide-react'
import type { Idioma } from '@/lib/idioma'

const sinSuscripcion = () => () => {}

/** Si el navegador prefiere inglés (el primer idioma de la lista). */
function navegadorEnIngles(): boolean {
  try {
    const preferido = navigator.languages?.[0] ?? navigator.language ?? ''
    return preferido.toLowerCase().startsWith('en')
  } catch {
    return false
  }
}

/**
 * El enlace chico de la ficha a su versión en el otro idioma ("English" /
 * "Español").
 *
 * En la ficha en castellano, si el navegador está en inglés, sale además un
 * aviso más visible con el enlace a la versión en inglés. Nunca se redirige
 * solo: Google rastrea desde Estados Unidos con el navegador en inglés y tiene
 * que poder ver las dos versiones. El aviso se decide en el navegador, después
 * de cargar: el HTML (el mismo para todos, cacheado en la CDN) no lo trae.
 */
export default function CambiarIdioma({ idioma, otra }: {
  /** El idioma de esta ficha. */
  idioma: Idioma
  /** La ruta de la misma ficha en el otro idioma. */
  otra: string
}) {
  const sugerir = useSyncExternalStore(sinSuscripcion, navegadorEnIngles, () => false) && idioma === 'es'

  if (sugerir) {
    return (
      <Link
        prefetch={false}
        href={otra}
        hrefLang="en"
        lang="en"
        className="mb-4 flex items-center gap-2 rounded-xl border border-[#FFFD02]/30 bg-[#FFFD02]/10 px-4 py-2.5 text-sm text-white hover:border-[#FFFD02]/60 transition-colors"
      >
        <Languages size={16} className="shrink-0 text-[#FFFD02]" aria-hidden="true" />
        <span className="flex-1">This page is also available in English.</span>
        <span className="shrink-0 font-semibold text-[#FFFD02]">Read in English →</span>
      </Link>
    )
  }

  return (
    <p className="-mt-2 mb-3 text-xs">
      <Link
        prefetch={false}
        href={otra}
        hrefLang={idioma === 'es' ? 'en' : 'es'}
        lang={idioma === 'es' ? 'en' : 'es'}
        className="inline-flex items-center gap-1 text-[#A0A0B0] hover:text-white transition-colors"
      >
        <Languages size={12} aria-hidden="true" />
        {idioma === 'es' ? 'English' : 'Español'}
      </Link>
    </p>
  )
}
