import QueVerClient from '@/components/QueVerClient'

export const metadata = { title: 'Qué ver — StreamFinder' }

interface Props {
  searchParams: Promise<{ genre?: string; type?: string }>
}

export default async function QueVerPage({ searchParams }: Props) {
  const { genre, type } = await searchParams
  const initialGenre = genre ? Number(genre) : undefined
  const initialType = (type === 'series' || type === 'miniseries' || type === 'docs' || type === 'movies')
    ? type
    : undefined
  return <QueVerClient initialGenre={initialGenre} initialType={initialType} />
}
