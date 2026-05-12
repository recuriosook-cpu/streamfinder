import { MetadataRoute } from 'next'
import { getAllGuides } from '@/lib/guides'

export const dynamic = 'force-dynamic'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const BASE = 'https://glynbox.com'

const staticPages: MetadataRoute.Sitemap = [
  { url: BASE,                        changeFrequency: 'daily',   priority: 1   },
  { url: `${BASE}/comunidad`,         changeFrequency: 'hourly',  priority: 0.8 },
  { url: `${BASE}/listas`,            changeFrequency: 'weekly',  priority: 0.7 },
  { url: `${BASE}/guias`,             changeFrequency: 'weekly',  priority: 0.8 },
  { url: `${BASE}/privacidad`,        changeFrequency: 'monthly', priority: 0.3 },
  { url: `${BASE}/terminos`,          changeFrequency: 'monthly', priority: 0.3 },
  { url: `${BASE}/soporte`,           changeFrequency: 'monthly', priority: 0.3 },
  { url: `${BASE}/anunciantes`,       changeFrequency: 'monthly', priority: 0.3 },
  { url: `${BASE}/eliminar-cuenta`,   changeFrequency: 'monthly', priority: 0.2 },
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

async function supabaseFetch(path: string): Promise<{ id: string; [key: string]: string | null }[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return []
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

async function getPublicListPages(): Promise<MetadataRoute.Sitemap> {
  const rows = await supabaseFetch('lists?is_public=eq.true&select=id&limit=500')
  return rows.map(r => ({
    url:             `${BASE}/listas/${r.id}`,
    changeFrequency: 'weekly' as const,
    priority:        0.6,
  }))
}

async function getPublicProfilePages(): Promise<MetadataRoute.Sitemap> {
  const rows = await supabaseFetch('profiles?select=username&username=not.is.null&limit=500')
  return rows
    .filter(r => r.username)
    .map(r => ({
      url:             `${BASE}/usuario/${r.username}`,
      changeFrequency: 'weekly' as const,
      priority:        0.5,
    }))
}

async function getPublicReviewPages(): Promise<MetadataRoute.Sitemap> {
  const rows = await supabaseFetch('reviews?select=id&limit=500&order=created_at.desc')
  return rows.map(r => ({
    url:             `${BASE}/review/${r.id}`,
    changeFrequency: 'monthly' as const,
    priority:        0.5,
  }))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const guidePages = getGuidePages()

  const [publicLists, publicProfiles, publicReviews] = await Promise.all([
    getPublicListPages(),
    getPublicProfilePages(),
    getPublicReviewPages(),
  ])

  if (!TMDB_KEY) return [...staticPages, ...guidePages, ...publicLists, ...publicProfiles, ...publicReviews]

  try {
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

    return [...staticPages, ...guidePages, ...publicLists, ...publicProfiles, ...publicReviews, ...movieEntries, ...tvEntries]
  } catch {
    return [...staticPages, ...guidePages, ...publicLists, ...publicProfiles, ...publicReviews]
  }
}
