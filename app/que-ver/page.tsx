import QueVerClient from '@/components/QueVerClient'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Qué ver hoy — Glynbox',
  description: 'Descubrí películas y series según tu estado de ánimo. Filtrá por género y encontrá qué ver en Netflix, Disney+, Amazon Prime y más.',
  robots: { index: false, follow: true },
  openGraph: {
    title:       'Qué ver hoy — Glynbox',
    description: 'Descubrí películas y series según tu estado de ánimo. Filtrá por género y encontrá qué ver en Netflix, Disney+, Amazon Prime y más.',
    url:         'https://www.glynbox.com/que-ver',
    images:      [{ url: 'https://www.glynbox.com/logo.png', width: 1200, height: 630, alt: 'Glynbox' }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Qué ver hoy — Glynbox',
    description: 'Descubrí películas y series según tu estado de ánimo.',
    images:      ['https://www.glynbox.com/logo.png'],
  },
  alternates: { canonical: 'https://www.glynbox.com/que-ver' },
}

interface Props {
  searchParams: Promise<{ genre?: string; type?: string }>
}

export default async function QueVerPage({ searchParams }: Props) {
  const { genre, type } = await searchParams
  const initialGenre = genre ? Number(genre) : undefined
  const initialType = (type === 'series' || type === 'miniseries' || type === 'docs' || type === 'movies')
    ? type
    : undefined
  return <QueVerClient initialGenre={initialGenre} initialType={initialType} />
}
