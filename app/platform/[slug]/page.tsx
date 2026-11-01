import { notFound } from 'next/navigation'
import { ALL_PLATFORMS } from '@/lib/providers'
import {
  getProviderTopMovies,
  getProviderTopTV,
  getProviderCatalog,
} from '@/lib/tmdb'
import PlatformPageClient, { type CatalogItem } from '@/components/PlatformPageClient'
import { idDeSlug, plataformaDeId, plataformasDelPais } from '@/lib/plataformas-pais'
import { nombresDeProveedores } from '@/lib/nombres-plataformas'

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

  // Las conocidas tienen slug propio; las demás ("hulu-15") llevan el id de TMDB.
  // De una que no existe en TMDB no se inventa una página.
  const conocida = ALL_PLATFORMS.find(p => p.slug === slug)
  const idSlug = conocida ? conocida.id : idDeSlug(slug)
  if (idSlug === null) notFound()
  const delCatalogo = conocida ? null : (await nombresDeProveedores()).get(idSlug)
  if (!conocida && !delCatalogo) notFound()
  const platform = conocida ?? { id: idSlug, slug, name: delCatalogo!.nombre, color: '#2A2A3A', fallbackLogoPath: delCatalogo!.logoPath }

  // Esta parte se arma de una vez para todos, con Argentina; el país elegido lo
  // aplica `PlatformPageClient`.
  const argentina = plataformaDeId(await plataformasDelPais('AR').catch(() => []), platform.id)
  const ids = argentina?.ids.join('|') ?? platform.id
  const [topMoviesData, topTVData, catalogMoviesData, catalogTVData] =
    await Promise.all([
      getProviderTopMovies(ids),
      getProviderTopTV(ids),
      getProviderCatalog(ids, 'movie', 1),
      getProviderCatalog(ids, 'tv', 1),
    ])

  const logoPath: string | null = argentina?.logoPath ?? platform.fallbackLogoPath ?? null

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
      platform={{ id: platform.id, slug: platform.slug, name: argentina?.name ?? platform.name, color: platform.color }}
      logoPath={logoPath}
      topMovies={topMovies}
      topTV={topTV}
      catalog={catalog}
    />
  )
}
