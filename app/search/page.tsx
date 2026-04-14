import { searchMulti } from '@/lib/tmdb'
import { createServerClient } from '@/lib/supabase-server'
import MediaCard from '@/components/MediaCard'
import Link from 'next/link'
import Image from 'next/image'
import { Search, UserCircle } from 'lucide-react'

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>
}

interface UserResult {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = '', page = '1' } = await searchParams

  if (!q) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <Search size={48} className="mx-auto text-zinc-600 mb-4" />
        <p className="text-zinc-400 text-lg">Ingresá un término para buscar</p>
      </div>
    )
  }

  // Fetch media results and user results in parallel
  const supabase = createServerClient()
  const [mediaData, usersRes] = await Promise.all([
    searchMulti(q, Number(page)),
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .ilike('username', `%${q}%`)
      .limit(6),
  ])

  const mediaResults = (mediaData.results ?? []).filter(
    (item: { media_type: string }) => item.media_type === 'movie' || item.media_type === 'tv'
  )

  const userResults: UserResult[] = (usersRes.data ?? []).filter(
    (u: UserResult) => u.username // only users with a username set
  )

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Resultados para: <span className="text-emerald-400">"{q}"</span>
        </h1>
        <p className="text-zinc-400 text-sm mt-1">
          {mediaData.total_results ?? 0} resultado{mediaData.total_results !== 1 ? 's' : ''} de películas y series
        </p>
      </div>

      {/* ── Users section ──────────────────────────────────────── */}
      {userResults.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <UserCircle size={15} /> Usuarios
          </h2>
          <div className="flex flex-wrap gap-3">
            {userResults.map(u => {
              const display = u.display_name ?? u.username ?? 'Usuario'
              return (
                <Link
                  key={u.id}
                  href={`/usuario/${u.username}`}
                  className="flex items-center gap-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 rounded-xl px-4 py-3 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden ring-2 ring-zinc-600 group-hover:ring-emerald-500 transition-all shrink-0">
                    {u.avatar_url ? (
                      <Image
                        src={u.avatar_url}
                        alt={display}
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-base font-bold text-zinc-400">
                        {display[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                      {display}
                    </p>
                    {u.display_name && (
                      <p className="text-xs text-zinc-500">@{u.username}</p>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Media section ──────────────────────────────────────── */}
      {mediaResults.length === 0 && userResults.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-zinc-400">No se encontraron resultados para "{q}"</p>
        </div>
      ) : mediaResults.length > 0 ? (
        <>
          {userResults.length > 0 && (
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Search size={15} /> Películas y series
            </h2>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {mediaResults.map((item: {
              id: number
              media_type: 'movie' | 'tv'
              title?: string
              name?: string
              poster_path: string | null
              vote_average: number
              release_date?: string
              first_air_date?: string
            }) => (
              <MediaCard
                key={`${item.media_type}-${item.id}`}
                id={item.id}
                title={item.title ?? item.name ?? ''}
                posterPath={item.poster_path}
                rating={item.vote_average}
                year={(item.release_date ?? item.first_air_date ?? '').slice(0, 4)}
                mediaType={item.media_type}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
