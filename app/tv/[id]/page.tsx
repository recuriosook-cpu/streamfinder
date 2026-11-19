import type { Metadata } from 'next'
import FichaSerie, { metadataSerie } from './ficha'

/**
 * La ficha de una serie en castellano. Todo está en `ficha.tsx`, compartido con
 * la versión en inglés (`app/en/tv/[id]/page.tsx`). Sin ISR: ver el comentario
 * de `app/movie/[id]/ficha.tsx`.
 */

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataSerie((await params).id, 'es')
}

export default async function TVPage({ params }: Props) {
  return <FichaSerie rawId={(await params).id} idioma="es" />
}
