import type { Metadata } from 'next'
import { connection } from 'next/server'
import RuletaClient, { type PeliculaRuleta } from './RuletaClient'

/**
 * `/ruleta` — "La Ruleta de Glynbox": una ruleta de 250 gajos que elige una
 * película al azar de la lista oficial "250 Mejores películas de todos los
 * tiempos" (se regenera con `scripts/regenerar-250-peliculas.mjs`).
 *
 * Las películas se piden acá, en el servidor, para que la ruleta aparezca
 * completa en el primer HTML y funcione sin cuenta. La respuesta de Supabase
 * queda una hora en el Data Cache, y la página se cachea en la CDN con
 * `Vercel-CDN-Cache-Control` (next.config.ts), nunca con ISR: `connection()`
 * la saca del prerenderizado.
 *
 * Se dibuja sin navbar ni pie (`components/ConditionalShell.tsx`): es una
 * pantalla vertical pensada para el celular y para grabar videos.
 */

const LISTA_ID = 'be143bb8-18e8-4982-8ceb-982ecb7cc39a'
const URL_PAGINA = 'https://www.glynbox.com/ruleta'

export const metadata: Metadata = {
  title: 'La Ruleta de Glynbox — ¿Qué película ver hoy? Girá y descubrilo',
  description: 'Girá la ruleta y dejá que el azar elija entre las 250 mejores películas de todos los tiempos. Ideal para cuando no sabés qué ver.',
  alternates: { canonical: URL_PAGINA },
  openGraph: {
    type: 'website',
    url: URL_PAGINA,
    siteName: 'Glynbox',
    locale: 'es_AR',
    title: 'La Ruleta de Glynbox',
    description: 'Girá la ruleta y descubrí qué película del Top 250 te toca ver hoy.',
    images: [{ url: 'https://www.glynbox.com/logo.png', width: 1200, height: 630, alt: 'Glynbox' }],
  },
}

async function peliculas(): Promise<PeliculaRuleta[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !clave) return []
  try {
    const res = await fetch(
      `${url}/rest/v1/list_items?select=media_id,title,poster_path,position&list_id=eq.${LISTA_ID}&media_type=eq.movie&order=position&limit=1000`,
      { headers: { apikey: clave, Authorization: `Bearer ${clave}` }, next: { revalidate: 3600 } },
    )
    if (!res.ok) return []
    const filas = (await res.json()) as { media_id: number; title: string; poster_path: string | null }[]
    // El puesto sale del orden y no de `position`, que puede empezar en 0 o en 1.
    return filas.map((f, i) => ({ id: f.media_id, titulo: f.title, poster: f.poster_path, puesto: i + 1 }))
  } catch {
    return []
  }
}

export default async function RuletaPage() {
  await connection()
  const lista = await peliculas()
  return (
    <>
      <link rel="preconnect" href="https://image.tmdb.org" />
      <RuletaClient peliculas={lista} />
    </>
  )
}
