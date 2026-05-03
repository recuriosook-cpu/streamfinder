import type { Metadata, Viewport } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { CountryProvider } from '@/context/CountryContext'

export const viewport: Viewport = {
  themeColor: '#FFFD02',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://glynbox.com'),
  icons: {
    icon: '/favicon.jpg',
    apple: '/favicon.jpg',
  },
  title: 'Glynbox — Descubrí qué ver hoy',
  description: 'Encontrá películas y series según tu estado de ánimo. Reseñas, recomendaciones personalizadas y comunidad de cinéfilos en Argentina y Latinoamérica.',
  keywords: 'películas, series, streaming, recomendaciones, reseñas, Netflix, Disney+, Amazon Prime, cine, Argentina',
  authors:   [{ name: 'Glynbox' }],
  creator:   'Glynbox',
  publisher: 'Glynbox',
  openGraph: {
    type:        'website',
    locale:      'es_AR',
    url:         'https://glynbox.com',
    siteName:    'Glynbox',
    title:       'Glynbox — Descubrí qué ver hoy',
    description: 'Encontrá películas y series según tu estado de ánimo. Reseñas y recomendaciones personalizadas.',
    images: [{ url: 'https://glynbox.com/logo.png', width: 1200, height: 630, alt: 'Glynbox' }],
  },
  twitter: {
    card:        'summary_large_image',
    site:        '@GlynboxApp',
    creator:     '@GlynboxApp',
    title:       'Glynbox — Descubrí qué ver hoy',
    description: 'Encontrá películas y series según tu estado de ánimo. Reseñas y recomendaciones personalizadas.',
    images:      ['https://glynbox.com/logo.png'],
  },
  robots: {
    index:     true,
    follow:    true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  alternates: {
    canonical: 'https://glynbox.com',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" type="image/jpeg" href="/favicon.jpg" />
        <link rel="apple-touch-icon" href="/favicon.jpg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Manrope:wght@400;500;600&family=Inter:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7004694054304140"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-[#0A0A0F] text-white">
        <CountryProvider>
          <Navbar />
          <main>{children}</main>
          <Footer />
        </CountryProvider>
      </body>
    </html>
  )
}
