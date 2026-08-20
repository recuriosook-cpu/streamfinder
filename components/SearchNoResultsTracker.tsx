'use client'

import { useEffect } from 'react'
import { track } from '@/lib/analytics'

/**
 * Dispara `search_no_results` cuando una búsqueda no devuelve nada.
 *
 * Existe como componente porque `/search` es un server component: no puede
 * llamar a `track()`, que corre en el navegador. Renderiza null; sólo está para
 * el efecto.
 *
 * El `query` se manda tal cual lo escribió la persona porque es justamente el
 * dato que sirve —saber qué buscan y no encuentran es la mitad del valor del
 * evento—, pero pasa por el sanitizador de `/api/track` como todo lo demás: si
 * alguien escribe un mail en el buscador, se guarda como `[email]`.
 */
export default function SearchNoResultsTracker({
  query,
  tipo,
}: {
  query: string
  tipo: string
}) {
  useEffect(() => {
    if (!query) return
    track('search_no_results', { query, tipo })
  }, [query, tipo])

  return null
}
