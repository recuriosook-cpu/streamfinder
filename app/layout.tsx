import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'

export const metadata: Metadata = {
  title: 'StreamFinder - Encontrá dónde ver tus películas y series',
  description: 'Buscá películas y series, descubrí en qué plataformas de streaming están disponibles en Argentina.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-zinc-950 text-white">
        <Navbar />
        <main>{children}</main>
      </body>
    </html>
  )
}
