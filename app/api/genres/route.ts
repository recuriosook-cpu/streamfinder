import { NextRequest, NextResponse } from 'next/server'
import { getMovieGenres, getTVGenres } from '@/lib/tmdb'

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? 'movie'
  const data = type === 'tv' ? await getTVGenres() : await getMovieGenres()
  return NextResponse.json(data)
}
