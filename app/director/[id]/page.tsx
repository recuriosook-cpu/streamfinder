import { getPersonDetails, getPersonCredits, getPosterUrl } from '@/lib/tmdb'
import FilmographyGrid from '@/components/FilmographyGrid'
import { createServerClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Calendar, MapPin, Star, Film, Tv2, BarChart2 } from 'lucide-react'
import Breadcrumb from '@/components/Breadcrumb'
import ActorAwards from '@/components/ActorAwards'
import FollowActorButton from '@/components/FollowActorButton'

interface Props { params: Promise<{ id: string }> }

interface DirectorCredit {
  id: number; title?: string; name?: string; job: string
  poster_path: string | null; media_type: 'movie' | 'tv'
  release_date?: string; first_air_date?: string
  vote_average: number; vote_count: number; genre_ids?: number[]
}

const GENRE_MAP: Record<number, string> = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia', 80: 'Crimen',
  99: 'Documental', 18: 'Drama', 10751: 'Familia', 14: 'Fantasía', 36: 'Historia',
  27: 'Terror', 10402: 'Música', 9648: 'Misterio', 10749: 'Romance',
  878: 'Ciencia ficción', 53: 'Thriller', 10752: 'Guerra', 37: 'Western',
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  const months = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre']
  return `${parseInt(day)} de ${months[parseInt(month) - 1]} de ${year}`
}

function personAge(birthday: string | null | undefined, deathday: string | null | undefined): number | null {
  if (!birthday) return null
  const end = deathday ? new Date(deathday) : new Date()
  const birth = new Date(birthday)
  const a = end.getFullYear() - birth.getFullYear()
  const m = end.getMonth() - birth.getMonth()
  return m < 0 || (m === 0 && end.getDate() < birth.getDate()) ? a - 1 : a
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const person: any = await getPersonDetails(Number(id))
    if (!person?.name) return {}
    const photoUrl = person.profile_path
      ? `https://image.tmdb.org/t/p/w500${person.profile_path}`
      : 'https://glynbox.com/logo.png'
    const description = person.biography?.slice(0, 160) ?? `Filmografía del director ${person.name} en Glynbox`
    return {
      title:       `${person.name} — Director — Glynbox`,
      description,
      openGraph:   { title: person.name, description, images: [{ url: photoUrl, width: 500, height: 750, alt: person.name }], siteName: 'Glynbox' },
      twitter:     { card: 'summary_large_image', title: `${person.name} — Glynbox`, description, images: [photoUrl] },
      alternates:  { canonical: `https://glynbox.com/director/${id}` },
    }
  } catch { return {} }
}

export default async function DirectorPage({ params }: Props) {
  const { id } = await params
  const numId = Number(id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let person: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let creditsData: any = { cast: [], crew: [] }

  try { person = await getPersonDetails(numId) } catch { notFound() }
  if (!person?.name) notFound()
  try { creditsData = await getPersonCredits(numId) } catch { /* no credits */ }

  // Directed works only (crew where job = Director)
  const allCrew: DirectorCredit[] = (creditsData.crew ?? [])
    .filter((c: DirectorCredit) => c.job === 'Director' && c.poster_path && (c.title || c.name))

  // Deduplicate and sort by date desc
  const seen = new Set<string>()
  const directed: DirectorCredit[] = []
  for (const c of [...allCrew].sort((a, b) => {
    const ya = (a.release_date ?? a.first_air_date ?? '').slice(0, 4) || '0'
    const yb = (b.release_date ?? b.first_air_date ?? '').slice(0, 4) || '0'
    return yb.localeCompare(ya)
  })) {
    const key = `${c.media_type}-${c.id}`
    if (!seen.has(key)) { seen.add(key); directed.push(c) }
  }

  const directedMovies = directed.filter(c => c.media_type === 'movie')
  const directedTV     = directed.filter(c => c.media_type === 'tv')

  // Stats
  const ratedItems = directed.filter(c => c.vote_count >= 50 && c.vote_average > 0)
  const avgRating  = ratedItems.length > 0
    ? ratedItems.reduce((s, c) => s + c.vote_average, 0) / ratedItems.length
    : null

  // Top 4 by rating
  const topRated = [...directed]
    .filter(c => c.vote_count >= 100)
    .sort((a, b) => b.vote_average - a.vote_average)
    .slice(0, 4)

  // Most common genre
  const genreCounts: Record<number, number> = {}
  for (const c of directed) for (const gid of c.genre_ids ?? []) genreCounts[gid] = (genreCounts[gid] ?? 0) + 1
  const topGenreId   = Object.entries(genreCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0]
  const topGenreName = topGenreId ? (GENRE_MAP[Number(topGenreId)] ?? null) : null

  // Decades worked
  const decades = [...new Set(directed.map(c => {
    const year = Number((c.release_date ?? c.first_air_date ?? '').slice(0, 4))
    return year > 0 ? `${Math.floor(year / 10) * 10}s` : null
  }).filter(Boolean))].sort()

  // Glynbox stats (Supabase)
  const supabase = createServerClient()
  const movieIds = directedMovies.slice(0, 50).map(c => c.id)
  const [watchedRes, ratingsRes] = await Promise.all([
    movieIds.length > 0
      ? supabase.from('watched').select('user_id', { count: 'exact', head: false })
          .in('media_id', movieIds).eq('media_type', 'movie')
      : Promise.resolve({ count: 0, data: [] }),
    movieIds.length > 0
      ? supabase.from('ratings').select('rating').in('media_id', movieIds).eq('media_type', 'movie')
      : Promise.resolve({ data: [] }),
  ])
  const glynboxViewers  = watchedRes.count ?? 0
  const glynboxRatings  = (ratingsRes.data ?? []) as { rating: number }[]
  const glynboxAvgRaw   = glynboxRatings.length > 0
    ? glynboxRatings.reduce((s, r) => s + r.rating, 0) / glynboxRatings.length
    : null

  const personAgeVal = personAge(person.birthday, person.deathday)
  const profileUrl   = person.profile_path ? `https://image.tmdb.org/t/p/h632${person.profile_path}` : null
  const popularityPct = Math.min(Math.round((person.popularity ?? 0) / 150 * 100), 100)

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Breadcrumb items={[{ label: 'Director' }, { label: person.name }]} />

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row gap-8 mb-10">
          {/* Photo */}
          <div className="shrink-0">
            <div className="relative w-44 md:w-52 aspect-[2/3] rounded-xl overflow-hidden bg-[#1C1C27]">
              {profileUrl ? (
                <Image src={profileUrl} alt={person.name} fill className="object-cover object-top" priority />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-16 h-16 text-zinc-600">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-3xl font-bold text-white">{person.name}</h1>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: '#FFFD02', color: '#000' }}>Director</span>
              <FollowActorButton actorId={numId} actorName={person.name} actorPhoto={person.profile_path ?? null} />
            </div>

            <div className="flex flex-col gap-2 text-sm text-[#A0A0B0] mb-5">
              {person.birthday && (
                <span className="flex items-center gap-2">
                  <Calendar size={14} className="shrink-0" />
                  {formatDate(person.birthday)}
                  {personAgeVal !== null && (
                    <span>({person.deathday ? `† ${personAgeVal} años` : `${personAgeVal} años`})</span>
                  )}
                </span>
              )}
              {person.place_of_birth && (
                <span className="flex items-center gap-2">
                  <MapPin size={14} className="shrink-0" />
                  {person.place_of_birth}
                </span>
              )}
            </div>

            {person.biography && (
              <div>
                <h2 className="text-base font-semibold mb-2 text-white">Biografía</h2>
                <p className="text-zinc-300 leading-relaxed text-sm line-clamp-[10]">{person.biography}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Top rated ────────────────────────────────────────────── */}
        {topRated.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold mb-4">Lo mejor dirigido</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {topRated.map(credit => {
                const title = credit.title ?? credit.name ?? ''
                const year  = (credit.release_date ?? credit.first_air_date ?? '').slice(0, 4)
                return (
                  <Link key={`${credit.media_type}-${credit.id}`} href={`/${credit.media_type}/${credit.id}`} className="group">
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-2">
                      <Image src={getPosterUrl(credit.poster_path, 'w342')} alt={title} fill className="object-cover transition-transform duration-300 group-hover:scale-105" />
                      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 bg-[#13131A]/90 rounded px-1.5 py-0.5">
                        <Star size={10} className="text-yellow-400 shrink-0" fill="currentColor" />
                        <span className="text-[11px] font-semibold text-white">{credit.vote_average.toFixed(1)}</span>
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-white leading-tight line-clamp-2 group-hover:text-zinc-300 transition-colors">{title}</p>
                    {year && <p className="text-[11px] text-[#A0A0B0] mt-0.5">{year}</p>}
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Estadísticas ─────────────────────────────────────────── */}
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4">Estadísticas del director</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 text-center">
              <Film size={18} className="mx-auto mb-2 text-[#FFFD02]" />
              <p className="text-2xl font-bold text-white">{directedMovies.length}</p>
              <p className="text-xs text-[#A0A0B0] mt-0.5">Películas</p>
            </div>
            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 text-center">
              <Tv2 size={18} className="mx-auto mb-2 text-[#FFFD02]" />
              <p className="text-2xl font-bold text-white">{directedTV.length}</p>
              <p className="text-xs text-[#A0A0B0] mt-0.5">Series</p>
            </div>
            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 text-center">
              <Star size={18} className="mx-auto mb-2 text-yellow-400" fill="currentColor" />
              <p className="text-2xl font-bold text-white">{avgRating != null ? avgRating.toFixed(1) : '—'}</p>
              <p className="text-xs text-[#A0A0B0] mt-0.5">Nota media TMDB</p>
            </div>
            <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 text-center">
              <BarChart2 size={18} className="mx-auto mb-2 text-[#FFFD02]" />
              <p className="text-lg font-bold text-white">{topGenreName ?? '—'}</p>
              <p className="text-xs text-[#A0A0B0] mt-0.5">Género más frecuente</p>
            </div>
          </div>
          {decades.length > 0 && (
            <div className="mt-3 bg-[#13131A] border border-[#2A2A3A] rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-wider">Décadas activo</span>
              {decades.map(d => (
                <span key={d} className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#1C1C27] text-white">{d}</span>
              ))}
            </div>
          )}
        </section>

        {/* ── En Glynbox ───────────────────────────────────────────── */}
        {(glynboxViewers > 0 || glynboxAvgRaw != null) && (
          <section className="mb-10">
            <h2 className="text-xl font-bold mb-4">En Glynbox</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {glynboxViewers > 0 && (
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 flex items-center gap-4">
                  <div className="text-3xl">👁</div>
                  <div>
                    <p className="text-2xl font-bold text-white">{glynboxViewers >= 1000 ? `${(glynboxViewers / 1000).toFixed(1)}K` : glynboxViewers}</p>
                    <p className="text-xs text-[#A0A0B0]">usuarios vieron sus películas</p>
                  </div>
                </div>
              )}
              {glynboxAvgRaw != null && (
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 flex items-center gap-4">
                  <div className="text-3xl">⭐</div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-bold text-white">{glynboxAvgRaw.toFixed(1)}<span className="text-sm text-[#A0A0B0]">/5</span></p>
                      {avgRating != null && (
                        <p className="text-xs text-[#A0A0B0]">vs {(avgRating / 2).toFixed(1)} TMDB</p>
                      )}
                    </div>
                    <p className="text-xs text-[#A0A0B0]">calificación media en Glynbox ({glynboxRatings.length} votos)</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Premios ───────────────────────────────────────────────── */}
        <ActorAwards tmdbId={numId} />

        {/* ── Popularidad ───────────────────────────────────────────── */}
        <section className="mb-10">
          <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 flex flex-col gap-2">
            <p className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-wider">Popularidad TMDB</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2.5 bg-[#1C1C27] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[#FFFD02]" style={{ width: `${popularityPct}%` }} />
              </div>
              <span className="text-sm font-bold text-white tabular-nums">{(person.popularity ?? 0).toFixed(1)}</span>
            </div>
          </div>
        </section>

        {/* ── Filmografía completa ──────────────────────────────────── */}
        {directed.length > 0 && (
          <FilmographyGrid credits={directed} title="Filmografía como director" />
        )}
      </div>
    </div>
  )
}
