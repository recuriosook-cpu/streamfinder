import { notFound } from 'next/navigation'
import { ALL_PLATFORMS } from '@/lib/providers'
import {
  getARProviders,
  getProviderTopMovies,
  getProviderTopTV,
  getProviderCatalog,
} from '@/lib/tmdb'
import PlatformPageClient, { type CatalogItem } from '@/components/PlatformPageClient'

export async function generateStaticParams() {
  return ALL_PLATFORMS.map(p => ({ slug: p.slug }))
}

interface RawItem {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  vote_average: number
  release_date?: string
  first_air_date?: string
}

export default async function PlatformPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const platform = ALL_PLATFORMS.find(p => p.slug === slug)
  if (!platform) notFound()

  const [topMoviesData, topTVData, catalogMoviesData, catalogTVData, arProviders] =
    await Promise.all([
      getProviderTopMovies(platform.id),
      getProviderTopTV(platform.id),
      getProviderCatalog(platform.id, 'movie', 1),
      getProviderCatalog(platform.id, 'tv', 1),
      getARProviders(),
    ])

  // Logo: prefer TMDB's AR provider list, fall back to hardcoded path
  const providerInfo = arProviders.find(
    (p: { provider_id: number }) => p.provider_id === platform.id
  )
  const logoPath: string | null =
    (providerInfo as { logo_path?: string })?.logo_path ?? platform.fallbackLogoPath ?? null

  const topMovies: RawItem[] = (topMoviesData.results ?? []).slice(0, 10)
  const topTV: RawItem[]     = (topTVData.results ?? []).slice(0, 10)

  const catalogMovies: CatalogItem[] = (catalogMoviesData.results ?? []).map((m: RawItem) => ({
    ...m, _mediaType: 'movie',
  }))
  const catalogTV: CatalogItem[] = (catalogTVData.results ?? []).map((t: RawItem) => ({
    ...t, _mediaType: 'tv',
  }))

  const catalog: CatalogItem[] = [...catalogMovies, ...catalogTV].sort((a, b) => {
    const dateA = a.release_date ?? a.first_air_date ?? ''
    const dateB = b.release_date ?? b.first_air_date ?? ''
    return dateB.localeCompare(dateA)
  })

  return (
    <PlatformPageClient
      platform={{ id: platform.id, slug: platform.slug, name: platform.name, color: platform.color }}
      logoPath={logoPath}
      topMovies={topMovies}
      topTV={topTV}
      catalog={catalog}
    />
  )
}
