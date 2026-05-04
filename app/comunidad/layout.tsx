import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Comunidad — Glynbox',
  description: 'Seguí a otros cinéfilos, leé sus reseñas, descubrí listas y explorá qué están viendo en la comunidad de Glynbox.',
  openGraph: {
    title:       'Comunidad — Glynbox',
    description: 'Seguí a otros cinéfilos, leé sus reseñas, descubrí listas y explorá qué están viendo.',
    url:         'https://glynbox.com/comunidad',
    images:      [{ url: 'https://glynbox.com/logo.png', width: 1200, height: 630, alt: 'Glynbox' }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'Comunidad — Glynbox',
    description: 'Seguí a otros cinéfilos y descubrí qué están viendo.',
    images:      ['https://glynbox.com/logo.png'],
  },
  alternates: { canonical: 'https://glynbox.com/comunidad' },
}

export default function ComunidadLayout({ children }: { children: React.ReactNode }) {
  return children
}
