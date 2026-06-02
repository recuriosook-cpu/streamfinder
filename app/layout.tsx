import type { Metadata, Viewport } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { CountryProvider } from '@/context/CountryContext'
import { ConditionalShell } from '@/components/ConditionalShell'
import { PingActive } from '@/components/PingActive'
import { Toaster } from 'sonner'

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
    site:        '@glynboxapp',
    creator:     '@glynboxapp',
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
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="icon" type="image/jpeg" href="/favicon.jpg" />
        <link rel="apple-touch-icon" href="/favicon.jpg" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FFFD02" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Glynbox" />
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
        {/* Schema.org: WebSite + SearchAction */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Glynbox',
            url: 'https://www.glynbox.com',
            potentialAction: {
              '@type': 'SearchAction',
              target: 'https://www.glynbox.com/search?q={search_term_string}',
              'query-input': 'required name=search_term_string',
            },
          }) }}
        />
        {/* Schema.org: SiteNavigationElement */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            itemListElement: [
              { '@type': 'SiteNavigationElement', position: 1, name: 'Guías',     description: 'Guías editoriales de cine y series curadas por expertos',         url: 'https://www.glynbox.com/guias'     },
              { '@type': 'SiteNavigationElement', position: 2, name: 'Listas',    description: 'Listas de películas y series creadas por la comunidad',            url: 'https://www.glynbox.com/listas'    },
              { '@type': 'SiteNavigationElement', position: 3, name: 'Comunidad', description: 'Reseñas, debates y actividad de cinéfilos',                        url: 'https://www.glynbox.com/comunidad' },
              { '@type': 'SiteNavigationElement', position: 4, name: 'Qué ver',   description: 'Descubrí qué ver hoy según tu estado de ánimo',                   url: 'https://www.glynbox.com/que-ver'   },
            ],
          }) }}
        />
      </head>
      <body className="min-h-screen bg-[#0A0A0F] text-white">
        <CountryProvider>
          <ConditionalShell><Navbar /></ConditionalShell>
          <main>{children}</main>
          <ConditionalShell><Footer /></ConditionalShell>
          <PingActive />
          <Toaster theme="dark" position="top-right" richColors />
        </CountryProvider>
      </body>
    </html>
  )
}
