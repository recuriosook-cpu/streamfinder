import type { ReactNode } from 'react'
import { rutaFicha, rutaTemporada, type Idioma } from '@/lib/idioma'

/**
 * Lo que necesitan las fichas para salir en castellano o en inglés (ver
 * `lib/idioma.ts`): los textos fijos, los hreflang y los nombres de idioma.
 *
 * Los textos en castellano son exactamente los de siempre (y armados igual, con
 * los mismos nodos de texto en JSX): la ficha en castellano no cambia.
 */

const BASE = 'https://www.glynbox.com'

/**
 * Los hreflang de una ficha: castellano, inglés y `x-default` (el castellano).
 * Para `alternates.languages` de la metadata, en las dos versiones.
 */
export function alternativas(tipo: 'movie' | 'tv', id: number | string): Record<string, string> {
  return {
    es: `${BASE}${rutaFicha('es', tipo, id)}`,
    en: `${BASE}${rutaFicha('en', tipo, id)}`,
    'x-default': `${BASE}${rutaFicha('es', tipo, id)}`,
  }
}

/** Lo mismo para una temporada. */
export function alternativasTemporada(id: number | string, n: number | string): Record<string, string> {
  return {
    es: `${BASE}${rutaTemporada('es', id, n)}`,
    en: `${BASE}${rutaTemporada('en', id, n)}`,
    'x-default': `${BASE}${rutaTemporada('es', id, n)}`,
  }
}

/** "Japanese" para 'ja'. `undefined` si `Intl` no lo conoce. */
export function nombreIdioma(code: string): string | undefined {
  try {
    const n = new Intl.DisplayNames(['en'], { type: 'language' }).of(code)
    return n && n !== code ? n : undefined
  } catch {
    return undefined
  }
}

/** La sinopsis de la ficha en inglés: sólo la de TMDB en inglés (sin ella, `null`). */
export function sinopsisEn(overview: string | null | undefined): { texto: string; ingles: boolean } | null {
  const texto = overview?.trim()
  return texto ? { texto, ingles: false } : null
}

export function textosFicha(idioma: Idioma) {
  if (idioma === 'en') {
    return {
      queVer: 'What to watch',
      sinImagen: 'No image',
      tituloOriginal: 'Original title: ',
      idioma: 'Language',
      pais: 'Country',
      red: 'Network',
      presupuesto: 'Budget',
      recaudacion: 'Box office',
      enGlynbox: 'On Glynbox',
      laVieron: (n: string): ReactNode => <>👁 {n} watched it</>,
      sinopsis: 'Overview',
      temporadas: (n: number): ReactNode => <>{n} season{n !== 1 ? 's' : ''}</>,
      serie: 'Series',
      creadores: 'Creators',
      creador: 'Creator',
    }
  }
  return {
    queVer: 'Qué ver',
    sinImagen: 'Sin imagen',
    tituloOriginal: 'Título original: ',
    idioma: 'Idioma',
    pais: 'País',
    red: 'Red',
    presupuesto: 'Presupuesto',
    recaudacion: 'Recaudación',
    enGlynbox: 'En Glynbox',
    laVieron: (n: string): ReactNode => <>👁 {n} la vieron</>,
    sinopsis: 'Sinopsis',
    temporadas: (n: number): ReactNode => <>{n} temporada{n !== 1 ? 's' : ''}</>,
    serie: 'Serie',
    creadores: 'Creadores',
    creador: 'Creador/a',
  }
}
