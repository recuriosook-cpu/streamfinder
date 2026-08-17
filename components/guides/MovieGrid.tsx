'use client'

import { MovieCard } from './MovieCard'

/**
 * Grilla de títulos dentro de una guía editorial.
 *
 * `mediaType` es obligatorio a propósito. Los ids de TMDB están namespaceados
 * por tipo, así que el mismo número existe como película y como serie
 * apuntando a cosas distintas: de los 163 ids que usan las guías, 117 existen
 * en los dos lados. Un `mediaType` equivocado no da error, muestra otro título
 * —el id 1398 es "Los Soprano" como serie y "Stalker" (1979) como película—,
 * que es la peor forma de fallar: silenciosa y creíble.
 *
 * El `?` estaba de más: TypeScript no valida el MDX, así que la única defensa
 * real es el chequeo en runtime de abajo.
 */

interface MovieGridProps {
  tmdbIds:   number[]
  mediaType: 'movie' | 'tv'
  label?:    string
}

/** Fuera de producción el error se muestra; en producción se degrada. */
const IS_DEV = process.env.NODE_ENV !== 'production'

export function MovieGrid({ tmdbIds, mediaType, label }: MovieGridProps) {
  if (!tmdbIds?.length) return null

  const valid = mediaType === 'movie' || mediaType === 'tv'

  if (!valid) {
    console.warn('[MovieGrid] mediaType is required. IDs:', tmdbIds)

    // En dev se corta acá para que el error se vea al escribir la guía, en vez
    // de descubrirlo en producción cuando alguien reporta un poster raro.
    if (IS_DEV) {
      return (
        <div className="my-6 rounded-xl border border-orange-500/40 bg-orange-500/5 px-5 py-4">
          <p className="text-sm font-semibold text-orange-400">
            Configuración de guía incompleta
          </p>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Falta <code className="text-orange-300">mediaType</code> en un
            MovieGrid. IDs: {tmdbIds.join(', ')}
          </p>
        </div>
      )
    }
  }

  // En producción se sigue con 'movie', que es lo que hacía el default viejo:
  // una grilla con algún poster equivocado es mejor que una guía que no carga.
  const resolvedType = valid ? mediaType : 'movie'

  return (
    <div className="my-6">
      {label && (
        <p className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-widest mb-3">{label}</p>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {tmdbIds.map(id => (
          <MovieCard key={id} tmdbId={id} mediaType={resolvedType} />
        ))}
      </div>
    </div>
  )
}
