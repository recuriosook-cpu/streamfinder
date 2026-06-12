import type { Metadata } from 'next'
import GenreClient from './client'

export const GENRE_NAMES: Record<number, string> = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
  14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Musical',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia ficción',
  53: 'Thriller', 10752: 'Guerra', 37: 'Western',
  10759: 'Acción y Aventura', 10762: 'Infantil', 10765: 'Sci-Fi y Fantasía',
  10766: 'Telenovela', 10767: 'Talk Show', 10768: 'Guerra y Política',
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
