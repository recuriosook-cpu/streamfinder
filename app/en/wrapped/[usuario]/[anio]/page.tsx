import type { Metadata } from 'next'
import Wrapped, { metadataWrapped } from '@/app/wrapped/[usuario]/[anio]/wrapped'

/** The Wrapped in English: the same page as `/wrapped/[usuario]/[anio]` with `idioma="en"`. */

interface Props {
  params: Promise<{ usuario: string; anio: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataWrapped(await params, 'en')
}

export default async function WrappedPageEn({ params }: Props) {
  return <Wrapped params={await params} idioma="en" />
}
