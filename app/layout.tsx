import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import { CountryProvider } from '@/context/CountryContext'

export const metadata: Metadata = {
  metadataBase: new URL('https://glynbox.com'),
  title: 'Glynbox — Descubrí qué ver hoy',
  description: 'Encontrá películas y series según tu estado de ánimo. Reseñas, recomendaciones personalizadas y disponibilidad en streaming por país.',
  keywords: [
    'películas', 'series', 'streaming', 'recomendaciones',
    'donde ver', 'netflix', 'disney', 'qué ver hoy',
    'reseñas de películas', 'plataformas de streaming',
  ],
  openGraph: {
    type: 'website',
    url: 'https://glynbox.com',
    title: 'Glynbox — Descubrí qué ver hoy',
    description: 'Encontrá películas y series según tu estado de ánimo. Reseñas, recomendaciones personalizadas y disponibilidad en streaming por país.',
    siteName: 'Glynbox',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Glynbox — Descubrí qué ver hoy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Glynbox — Descubrí qué ver hoy',
    description: 'Encontrá películas y series según tu estado de ánimo. Reseñas y recomendaciones personalizadas.',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-zinc-950 text-white">
        <CountryProvider>
          <Navbar />
          <main>{children}</main>
        </CountryProvider>
      </body>
    </html>
  )
}
