import type { Metadata } from 'next'
import GenreClient from './client'
import { GENRE_NAMES } from './genre-constants'

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
