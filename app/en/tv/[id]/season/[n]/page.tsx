import type { Metadata } from 'next'
import FichaTemporada, { metadataTemporada } from '@/app/tv/[id]/temporada/[n]/ficha'

/**
 * Una temporada en inglés: la misma página que `/tv/[id]/temporada/[n]`
 * (`app/tv/[id]/temporada/[n]/ficha.tsx`) con `idioma="en"`.
 */

interface Props {
  params: Promise<{ id: string; n: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataTemporada(await params, 'en')
}

export default async function SeasonPageEn({ params }: Props) {
  return <FichaTemporada params={await params} idioma="en" />
}
