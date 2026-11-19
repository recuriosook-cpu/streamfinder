import type { Metadata } from 'next'
import FichaTemporada, { metadataTemporada } from './ficha'

/**
 * Una temporada en castellano. Todo está en `ficha.tsx`, compartido con la
 * versión en inglés (`app/en/tv/[id]/season/[n]/page.tsx`).
 */

interface Props {
  params: Promise<{ id: string; n: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataTemporada(await params, 'es')
}

export default async function SeasonPage({ params }: Props) {
  return <FichaTemporada params={await params} idioma="es" />
}
