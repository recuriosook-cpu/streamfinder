import QueVerClient from '@/components/QueVerClient'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Qué ver hoy — Glynbox',
  description: 'Descubrí películas y series según tu estado de ánimo. Filtrá por género y encontrá qué ver en Netflix, Disney+, Amazon Prime y más.',
  openGraph: {
    title:       'Qué ver hoy — Glynbox',
    description: 'Descubrí películas y series según tu estado de ánimo. Filtrá por género y encontrá qué ver en Netflix, Disney+, Amazon Prime y más.',
    url:         'https://glynbox.com/que-ver',
    images:      [{ url: 'https://glynbox.com/logo.png', width: 1200, height: 630, alt: 'Glynbox' }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Qué ver hoy — Glynbox',
    description: 'Descubrí películas y series según tu estado de ánimo.',
    images:      ['https://glynbox.com/logo.png'],
  },
  alternates: { canonical: 'https://glynbox.com/que-ver' },
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
