import type { Metadata } from 'next'
import FichaPelicula, { metadataPelicula } from './ficha'

/**
 * La ficha de una película en castellano. Todo está en `ficha.tsx`, compartido
 * con la versión en inglés (`app/en/movie/[id]/page.tsx`). Sin ISR: ver el
 * comentario de `ficha.tsx`.
 */

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataPelicula((await params).id, 'es')
}

export default async function MoviePage({ params }: Props) {
  return <FichaPelicula rawId={(await params).id} idioma="es" />
}
