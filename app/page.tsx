import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import HomeClient from '@/components/HomeClient'
import PortadaPublica from '@/components/PortadaPublica'
import { obtenerPostersPopulares } from './descargar/posters'

/**
 * `/`: la portada pública para quien no tiene sesión, el inicio de siempre
 * para quien sí.
 *
 * Se decide en el servidor y sólo con la cookie de sesión de Supabase
 * (`sb-<proyecto>-auth-token`, a veces partida en `.0`, `.1`…): no se llama a
 * Supabase, así que no agrega espera. Si la cookie está pero venció, va a
 * `HomeClient`, que valida con `getUser()` y se muestra como antes para
 * alguien sin sesión. Sin cookie, el HTML ya sale con la portada escrita, que
 * es lo que leen los verificadores de Google y Googlebot (ver
 * `components/PortadaPublica.tsx`).
 *
 * `?explorar=1` abre el inicio de siempre sin sesión (tendencias, reseñas,
 * listas), desde el link "Explorar sin cuenta" de la portada.
 *
 * Leer cookies hace dinámica la ruta; los posters del mosaico salen del Data
 * Cache de 6 horas de `obtenerPostersPopulares`.
 */

export const metadata: Metadata = {
  title: { absolute: 'Glynbox — Descubrí qué ver en tus plataformas' },
  description:
    'Glynbox es una app gratuita para encontrar películas y series según tus plataformas de streaming, calificar lo que viste y recibir recomendaciones a tu medida.',
}

function tieneSesion(nombres: string[]): boolean {
  return nombres.some(n => n.startsWith('sb-') && /-auth-token(\.\d+)?$/.test(n))
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ explorar?: string | string[] }>
}) {
  const [almacen, query] = await Promise.all([cookies(), searchParams])

  if (tieneSesion(almacen.getAll().map(c => c.name)) || query.explorar === '1') {
    return <HomeClient />
  }

  const posters = await obtenerPostersPopulares()
  return (
    <>
      <link rel="preconnect" href="https://image.tmdb.org" />
      <PortadaPublica posters={posters} />
    </>
  )
}
