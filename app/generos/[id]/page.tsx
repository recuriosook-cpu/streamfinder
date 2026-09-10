import type { Metadata } from 'next'
import GenreClient from './client'
import { GENRE_NAMES } from './genre-constants'

/**
 * Una hora de cache, regenerando de fondo (ISR).
 *
 * El TTL no agrega desactualización sobre lo que la página ya mostraba: todas
 * las llamadas a TMDB pasan por `lib/tmdb.ts`, que fetchea con
 * `{ next: { revalidate: 3600 } }`. Lo único que cambia es que la página
 * deja de re-renderizarse entera en cada visita.
 *
 * Pasado el TTL, Next sirve la versión vieja al instante y regenera de fondo,
 * así que nadie espera por la regeneración.
 */
export const revalidate = 3600

/**
 * Devuelve `[]` a propósito, y sin esto no hay cache.
 *
 * Una ruta con parámetro que no declara `generateStaticParams` no entra al
 * pipeline estático de Next: se sirve dinámica siempre, con
 * `Cache-Control: no-store`, aunque tenga `revalidate`. Así estuvieron estas
 * páginas desde que existen — medido en producción, `x-vercel-cache: MISS` en
 * el 100% de las visitas.
 *
 * La lista va vacía porque el catálogo es prácticamente infinito y no tiene
 * sentido prerenderizarlo en el build. Con `dynamicParams` en `true` (el
 * default), cada id que no esté en la lista se genera en su primera visita y
 * queda cacheado. O sea: build corto, y cache igual.
 */
export async function generateStaticParams() {
  return []
}


interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const name = GENRE_NAMES[Number(id)] ?? 'Género'
  return {
    title: `${name} — Películas y Series | Glynbox`,
    description: `Explorá las mejores películas y series de ${name} disponibles en streaming. Descubrí títulos recomendados en Glynbox.`,
    openGraph: {
      title: `${name} — Películas y Series | Glynbox`,
      description: `Las mejores películas y series de ${name} en Glynbox.`,
      url: `https://glynbox.com/generos/${id}`,
    },
    alternates: { canonical: `https://glynbox.com/generos/${id}` },
  }
}

export default async function GeneroPage({ params }: Props) {
  const { id } = await params
  return <GenreClient genreId={Number(id)} />
}
