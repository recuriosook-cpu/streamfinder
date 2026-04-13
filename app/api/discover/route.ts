import { NextRequest, NextResponse } from 'next/server'
import { discoverMovies, discoverTV } from '@/lib/tmdb'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const type = sp.get('type') ?? 'movie'
  const genre = sp.get('genre') ?? ''
  const provider = sp.get('provider') ?? ''

  const params: Record<string, string> = { sort_by: 'popularity.desc' }
  if (genre) params.with_genres = genre
  if (provider) {
    params.with_watch_providers = provider
    params.watch_region = 'AR'
  }

  const data = type === 'tv' ? await discoverTV(params) : await discoverMovies(params)
  return NextResponse.json(data)
}
