import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Comunidad de cine y series — Glynbox',
  description: 'Reseñas, debates, actividad de cinéfilos. La comunidad de cine y series más activa de habla hispana.',
  openGraph: {
    title: 'Comunidad de cine y series — Glynbox',
    description: 'Reseñas, debates, actividad de cinéfilos. La comunidad de cine y series más activa de habla hispana.',
    url: 'https://glynbox.com/comunidad',
    images: [{ url: 'https://glynbox.com/logo.png', width: 1200, height: 630, alt: 'Glynbox Comunidad' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Comunidad de cine y series — Glynbox',
    description: 'Reseñas, debates, actividad de cinéfilos. La comunidad de cine y series más activa de habla hispana.',
  },
  alternates: { canonical: 'https://glynbox.com/comunidad' },
}

export default function ComunidadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
