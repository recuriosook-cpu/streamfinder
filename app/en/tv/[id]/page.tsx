import type { Metadata } from 'next'
import FichaSerie, { metadataSerie } from '@/app/tv/[id]/ficha'

/**
 * La ficha de una serie en inglés: la misma que `/tv/[id]`
 * (`app/tv/[id]/ficha.tsx`) con `idioma="en"`. Sin ISR: se cachea en la CDN
 * como la de castellano (`next.config.ts`).
 */

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataSerie((await params).id, 'en')
}

export default async function TVPageEn({ params }: Props) {
  return <FichaSerie rawId={(await params).id} idioma="en" />
}
