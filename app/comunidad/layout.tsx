import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Comunidad — Glynbox',
  description: 'Descubrí qué están viendo otros cinéfilos. Reseñas, calificaciones y actividad de la comunidad Glynbox.',
  openGraph: {
    title: 'Comunidad — Glynbox',
    description: 'Descubrí qué están viendo otros cinéfilos. Reseñas, calificaciones y actividad de la comunidad Glynbox.',
    url: 'https://glynbox.com/comunidad',
  },
  alternates: { canonical: 'https://glynbox.com/comunidad' },
}

export default function ComunidadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
