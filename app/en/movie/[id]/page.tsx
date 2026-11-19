import type { Metadata } from 'next'
import FichaPelicula, { metadataPelicula } from '@/app/movie/[id]/ficha'

/**
 * La ficha de una película en inglés, para quien busca "where to watch X" en
 * Estados Unidos y otros países de habla inglesa. Es la misma ficha que
 * `/movie/[id]` (`app/movie/[id]/ficha.tsx`) con `idioma="en"`. Sin ISR: se
 * cachea en la CDN como la de castellano (`next.config.ts`).
 */

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataPelicula((await params).id, 'en')
}

export default async function MoviePageEn({ params }: Props) {
  return <FichaPelicula rawId={(await params).id} idioma="en" />
}
