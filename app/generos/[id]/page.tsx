import type { Metadata } from 'next'
import { itunesPara } from '@/lib/tiendas'
import { notFound } from 'next/navigation'
import GenreClient, { type InicialGenero, type MediaItem } from './client'
import { DEFAULT_COUNTRY } from '@/lib/countries'
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
      url: `https://www.glynbox.com/generos/${id}`,
    },
    alternates: { canonical: `https://www.glynbox.com/generos/${id}` },
    itunes: itunesPara(`/generos/${id}`),
  }
}

/**
 * La primera página de películas y series, en el HTML: antes la pedía sólo el
 * navegador y Google veía un género sin ningún título. Mismos pedidos que
 * `GenreClient`, con Argentina (el país con que se arma la página).
 */
async function primeraPagina(genreId: number): Promise<InicialGenero | undefined> {
  const key = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!key) return undefined
  const base = `https://api.themoviedb.org/3/discover`
  try {
    const [m, t] = await Promise.all([
      fetch(`${base}/movie?api_key=${key}&with_genres=${genreId}&language=es-AR&region=${DEFAULT_COUNTRY}&sort_by=popularity.desc&vote_count.gte=50&page=1`, { next: { revalidate: 3600 } }).then(r => (r.ok ? r.json() : null)),
      fetch(`${base}/tv?api_key=${key}&with_genres=${genreId}&language=es-AR&sort_by=popularity.desc&vote_count.gte=20&page=1`, { next: { revalidate: 3600 } }).then(r => (r.ok ? r.json() : null)),
    ])
    if (!m || !t) return undefined
    type R = { id: number; title?: string; name?: string; poster_path: string | null; vote_average: number; release_date?: string; first_air_date?: string }
    const item = (tipo: 'movie' | 'tv') => (x: R): MediaItem => ({
      id: x.id,
      title: (tipo === 'movie' ? x.title : x.name) ?? '',
      posterPath: x.poster_path,
      voteAverage: x.vote_average,
      year: ((tipo === 'movie' ? x.release_date : x.first_air_date) ?? '').slice(0, 4),
      type: tipo,
    })
    return { movies: (m.results ?? []).map(item('movie')), tvShows: (t.results ?? []).map(item('tv')) }
  } catch {
    return undefined
  }
}

export default async function GeneroPage({ params }: Props) {
  const { id } = await params
  // Un id que no es un género: 404 (y no una página "Género" vacía que, con
  // ISR, además se guardaba por cada id que inventara un bot).
  if (!GENRE_NAMES[Number(id)]) notFound()
  return <GenreClient genreId={Number(id)} inicial={await primeraPagina(Number(id))} />
}
