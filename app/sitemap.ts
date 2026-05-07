import { MetadataRoute } from 'next'
import { getAllGuides } from '@/lib/guides'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const BASE = 'https://glynbox.com'

const staticPages: MetadataRoute.Sitemap = [
  { url: BASE,                     changeFrequency: 'daily',   priority: 1   },
  { url: `${BASE}/que-ver`,        changeFrequency: 'daily',   priority: 0.8 },
  { url: `${BASE}/comunidad`,      changeFrequency: 'hourly',  priority: 0.8 },
  { url: `${BASE}/listas`,         changeFrequency: 'weekly',  priority: 0.7 },
  { url: `${BASE}/guias`,          changeFrequency: 'weekly',  priority: 0.8 },
  { url: `${BASE}/privacidad`,     changeFrequency: 'monthly', priority: 0.3 },
  { url: `${BASE}/terminos`,       changeFrequency: 'monthly', priority: 0.3 },
]

function getGuidePages(): MetadataRoute.Sitemap {
  try {
    return getAllGuides().map(g => ({
      url:             `${BASE}/guias/${g.slug}`,
      changeFrequency: 'monthly' as const,
      priority:        0.8,
      lastModified:    new Date(g.updatedAt),
    }))
  } catch { return [] }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!TMDB_KEY) return staticPages

  try {
    // Fetch 5 pages of popular movies (20 per page = 100) + 3 pages of TV (60)
    const moviePages = [1, 2, 3, 4, 5]
    const tvPages    = [1, 2, 3]

    const [moviesResults, tvResults] = await Promise.all([
      Promise.all(moviePages.map(page =>
        fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}&language=es-AR&page=${page}`, { next: { revalidate: 86400 } })
          .then(r => r.ok ? r.json() : { results: [] })
          .catch(() => ({ results: [] }))
      )),
      Promise.all(tvPages.map(page =>
        fetch(`https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_KEY}&language=es-AR&page=${page}`, { next: { revalidate: 86400 } })
          .then(r => r.ok ? r.json() : { results: [] })
          .catch(() => ({ results: [] }))
      )),
    ])

    const movieEntries: MetadataRoute.Sitemap = moviesResults
      .flatMap(r => r.results ?? [])
      .map((m: { id: number }) => ({
        url:             `${BASE}/movie/${m.id}`,
        changeFrequency: 'weekly' as const,
        priority:        0.6,
      }))

    const tvEntries: MetadataRoute.Sitemap = tvResults
      .flatMap(r => r.results ?? [])
      .map((s: { id: number }) => ({
        url:             `${BASE}/tv/${s.id}`,
        changeFrequency: 'weekly' as const,
        priority:        0.6,
      }))

    return [...staticPages, ...getGuidePages(), ...movieEntries, ...tvEntries]
  } catch {
    return [...staticPages, ...getGuidePages()]
  }
}
