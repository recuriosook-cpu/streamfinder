import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Listas de películas y series — Glynbox',
  description: 'Descubrí listas curadas de películas y series. Crea tus propias listas y compartilas con la comunidad.',
  openGraph: {
    title: 'Listas de películas y series — Glynbox',
    description: 'Descubrí listas curadas de películas y series. Crea tus propias listas y compartilas con la comunidad.',
    url: 'https://glynbox.com/listas',
    images: [{ url: 'https://glynbox.com/logo.png', width: 1200, height: 630, alt: 'Glynbox Listas' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Listas de películas y series — Glynbox',
    description: 'Descubrí listas curadas de películas y series. Crea tus propias listas y compartilas con la comunidad.',
  },
  alternates: { canonical: 'https://glynbox.com/listas' },
}

export default function ListasLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
