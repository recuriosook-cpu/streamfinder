import type { Metadata } from 'next'
import Wrapped, { metadataWrapped } from './wrapped'

/** El Wrapped en castellano. La página es `wrapped.tsx`, compartida con `/en/wrapped`. */

interface Props {
  params: Promise<{ usuario: string; anio: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataWrapped(await params, 'es')
}

export default async function WrappedPage({ params }: Props) {
  return <Wrapped params={await params} idioma="es" />
}
