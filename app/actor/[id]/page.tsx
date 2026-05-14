import { getPersonDetails, getPersonCredits, getPosterUrl } from '@/lib/tmdb'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Calendar, MapPin, Star } from 'lucide-react'
import Breadcrumb from '@/components/Breadcrumb'
import FilmographyGrid from '@/components/FilmographyGrid'
import ActorAwards from '@/components/ActorAwards'
import FollowActorButton from '@/components/FollowActorButton'
import ExpandableBio from '@/components/ExpandableBio'

interface Props {
  params: Promise<{ id: string }>
}

interface Credit {
  id: number
  title?: string
  name?: string
  character?: string
  poster_path: string | null
  media_type: 'movie' | 'tv'
  release_date?: string
  first_air_date?: string
  popularity: number
  vote_average: number
  vote_count: number
  genre_ids?: number[]
  episode_count?: number
}

const AWARD_KEYWORDS = ['Oscar', 'Emmy', 'Grammy', 'SAG', 'BAFTA', 'Golden Globe', 'Globo de Oro', 'Cannes', 'Venecia', 'Sundance', 'Tony']

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const [year, month, day] = dateStr.split('-')
  const months = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre']
  return `${parseInt(day)} de ${months[parseInt(month) - 1]} de ${year}`
}

function age(birthday: string | null | undefined, deathday: string | null | undefined): number | null {
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
    const person = await getPersonDetails(Number(id))
    if (!person?.name) return {}
    const photoUrl = person.profile_path
      ? `https://image.tmdb.org/t/p/w500${person.profile_path}`
      : 'https://glynbox.com/logo.png'
    const description = person.biography?.slice(0, 160) ?? `Filmografía completa de ${person.name} en Glynbox`
    return {
      title:       `${person.name} — Filmografía y premios — Glynbox`,
      description,
      openGraph: {
        title:       person.name,
        description,
        images:      [{ url: photoUrl, width: 500, height: 750, alt: person.name }],
        siteName:    'Glynbox',
      },
      twitter: {
        card:        'summary_large_image',
        title:       `${person.name} — Glynbox`,
        description,
        images:      [photoUrl],
      },
      alternates: { canonical: `https://glynbox.com/actor/${id}` },
    }
  } catch { return {} }
}

export default async function ActorPage({ params }: Props) {
  const { id } = await params

  // If TMDB returns 404 or any error, show a "not found" page instead of crashing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let person: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let creditsData: any = { cast: [] }

  try {
    person = await getPersonDetails(Number(id))
  } catch {
    notFound()
  }

  if (!person?.name) notFound()

  try {
    creditsData = await getPersonCredits(Number(id))
  } catch {
    // Credits unavailable — show page without filmography
  }

  // Self-appearances: talk shows, documentaries, archive footage
  const SELF_RE = /^(Self|Himself|Herself)\b/i

  const allCredits: Credit[] = (creditsData.cast ?? [])
    .filter((c: Credit) => {
      if (!c.poster_path || (!c.title && !c.name)) return false
      const char = c.character ?? ''
      // Exclude when character is "Self", "Himself", "Herself" (talk shows, docs as themselves)
      if (SELF_RE.test(char)) return false
      // Exclude TV guest appearances: 1 episode with no named character
      if (c.media_type === 'tv' && !char && (c.episode_count ?? 0) <= 1) return false
      return true
    })

  // "Más valorado": top 4 by vote_average (min 20 votes to filter noise), unique by id+media_type
  const seen = new Set<string>()
  const topRated: Credit[] = []
  const byRating = [...allCredits]
    .filter(c =>
      c.vote_count >= 100 &&
      !(c.media_type === 'tv' && (c.episode_count ?? 0) < 3)
    )
    .sort((a, b) => b.vote_average - a.vote_average)
  for (const c of byRating) {
    const key = `${c.media_type}-${c.id}`
    if (!seen.has(key)) {
      seen.add(key)
      topRated.push(c)
      if (topRated.length === 4) break
    }
  }

  // Full filmography: unique entries sorted by year desc
  const filmographySeen = new Set<string>()
  const filmography: Credit[] = []
  const byYear = [...allCredits].sort((a, b) => {
    const ya = (a.release_date ?? a.first_air_date ?? '').slice(0, 4) || '0'
    const yb = (b.release_date ?? b.first_air_date ?? '').slice(0, 4) || '0'
    return yb.localeCompare(ya)
  })
  for (const c of byYear) {
    const key = `${c.media_type}-${c.id}`
    if (!filmographySeen.has(key)) {
      filmographySeen.add(key)
      filmography.push(c)
    }
  }

  const movieCount = allCredits.filter(c => c.media_type === 'movie').length
  const tvCount    = allCredits.filter(c => c.media_type === 'tv').length

  // Award keywords detected in biography
  const awardMentions = person.biography
    ? AWARD_KEYWORDS.filter(k => person.biography.toLowerCase().includes(k.toLowerCase()))
    : []

  // Popularity bar (TMDB popularity is open-ended; 100 = very popular)
  const popularityPct = Math.min(Math.round((person.popularity ?? 0) / 150 * 100), 100)

  // ── Trivia / stats calculations ────────────────────────────────────────────

  const GENRE_MAP: Record<number, string> = {
    28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia', 80: 'Crimen',
    99: 'Documental', 18: 'Drama', 10751: 'Familia', 14: 'Fantasía', 36: 'Historia',
    27: 'Terror', 10402: 'Música', 9648: 'Misterio', 10749: 'Romance',
    878: 'Ciencia ficción', 53: 'Thriller', 10752: 'Guerra', 37: 'Western',
  }

  // Debut year + career start age
  const creditYears = allCredits
    .map(c => parseInt((c.release_date ?? c.first_air_date ?? '').slice(0, 4)))
    .filter(y => y > 1900 && y < 2100)
  const firstYear = creditYears.length > 0 ? Math.min(...creditYears) : null
  const careerStartAge = firstYear && person.birthday
    ? firstYear - new Date(person.birthday).getFullYear()
    : null

  // Most prolific decade
  const decadeCounts: Record<string, number> = {}
  for (const c of allCredits) {
    const y = parseInt((c.release_date ?? c.first_air_date ?? '').slice(0, 4))
    if (y > 1900) {
      const d = `${Math.floor(y / 10) * 10}s`
      decadeCounts[d] = (decadeCounts[d] ?? 0) + 1
    }
  }
  const topDecadeEntry = Object.entries(decadeCounts).sort((a, b) => b[1] - a[1])[0] ?? null
  const decadeMax = topDecadeEntry ? topDecadeEntry[1] : 1

  // Top genres (up to 5)
  const genreCountsActor: Record<number, number> = {}
  for (const c of allCredits)
    for (const gid of c.genre_ids ?? [])
      genreCountsActor[gid] = (genreCountsActor[gid] ?? 0) + 1
  const topGenres = Object.entries(genreCountsActor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ id: Number(id), name: GENRE_MAP[Number(id)] ?? '', count }))
    .filter(g => g.name)
  const genreMax = topGenres[0]?.count ?? 1

  const personAge = age(person.birthday, person.deathday)
  const profileUrl = person.profile_path
    ? `https://image.tmdb.org/t/p/h632${person.profile_path}`
    : null

  const knownFor = person.known_for_department === 'Acting'
    ? 'Actuación'
    : person.known_for_department === 'Directing'
    ? 'Dirección'
    : person.known_for_department === 'Writing'
    ? 'Guion'
    : person.known_for_department ?? ''

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Breadcrumb items={[{ label: person.name }]} />

        {/* Header */}
        <div className="flex flex-col md:flex-row gap-8 mb-10">
          {/* Photo */}
          <div className="shrink-0">
            <div className="relative w-44 md:w-52 aspect-[2/3] rounded-xl overflow-hidden bg-[#1C1C27]">
              {profileUrl ? (
                <Image
                  src={profileUrl}
                  alt={person.name}
                  fill
                  className="object-cover object-top"
                  priority
                />
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
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-3xl font-bold">{person.name}</h1>
              <FollowActorButton
                actorId={Number(id)}
                actorName={person.name}
                actorPhoto={person.profile_path ?? null}
              />
            </div>

            {knownFor && (
              <p className="text-sm text-[#FFFD02] font-medium mb-4">{knownFor}</p>
            )}

            <div className="flex flex-col gap-2 text-sm text-[#A0A0B0] mb-5">
              {person.birthday && (
                <span className="flex items-center gap-2">
                  <Calendar size={14} className="shrink-0" />
                  {formatDate(person.birthday)}
                  {personAge !== null && (
                    <span className="text-[#A0A0B0]">
                      ({person.deathday ? `† ${personAge} años` : `${personAge} años`})
                    </span>
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
                <ExpandableBio bio={person.biography} />
              </div>
            )}
          </div>
        </div>

        {/* Más valorado */}
        {topRated.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-bold mb-4">Más valorado</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {topRated.map(credit => {
                const title = credit.title ?? credit.name ?? ''
                const year = (credit.release_date ?? credit.first_air_date ?? '').slice(0, 4)
                const href = `/${credit.media_type}/${credit.id}`
                return (
                  <Link key={`${credit.media_type}-${credit.id}`} href={href} className="group">
                    <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-[#1C1C27] mb-2">
                      <Image
                        src={getPosterUrl(credit.poster_path, 'w342')}
                        alt={title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      {credit.media_type === 'tv' && (
                        <span className="absolute top-1.5 left-1.5 text-[10px] bg-[#13131A]/80 text-zinc-300 px-1.5 py-0.5 rounded">
                          Serie
                        </span>
                      )}
                      {/* Score badge */}
                      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 bg-[#13131A]/90 rounded px-1.5 py-0.5">
                        <Star size={10} className="text-yellow-400 shrink-0" fill="currentColor" />
                        <span className="text-[11px] font-semibold text-white">
                          {credit.vote_average.toFixed(1)}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs font-semibold text-white leading-tight line-clamp-2 group-hover:text-zinc-300 transition-colors">
                      {title}
                    </p>
                    {year && <p className="text-[11px] text-[#A0A0B0] mt-0.5">{year}</p>}
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Datos destacados ─────────────────────────────────────────────── */}
        {(careerStartAge !== null || topDecadeEntry || topGenres.length > 0) && (
          <section className="mb-10">
            <h2 className="text-xl font-bold mb-4">Datos destacados</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {careerStartAge !== null && careerStartAge >= 0 && careerStartAge < 90 && (
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
                  <p className="text-xs text-[#A0A0B0] uppercase tracking-wider mb-2">Debut</p>
                  <p className="text-2xl font-bold text-white">{careerStartAge} años</p>
                  {firstYear && <p className="text-xs text-zinc-600 mt-0.5">en {firstYear}</p>}
                </div>
              )}
              {topDecadeEntry && (
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
                  <p className="text-xs text-[#A0A0B0] uppercase tracking-wider mb-2">Década más activa</p>
                  <p className="text-2xl font-bold text-white">{topDecadeEntry[0]}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{topDecadeEntry[1]} títulos</p>
                </div>
              )}
              {topGenres[0] && (
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
                  <p className="text-xs text-[#A0A0B0] uppercase tracking-wider mb-2">Género frecuente</p>
                  <p className="text-xl font-bold text-white leading-tight">{topGenres[0].name}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{topGenres[0].count} títulos</p>
                </div>
              )}
              <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4">
                <p className="text-xs text-[#A0A0B0] uppercase tracking-wider mb-2">Carrera</p>
                <p className="text-2xl font-bold text-white">{allCredits.length}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{movieCount} pelis · {tvCount} series</p>
              </div>
            </div>
          </section>
        )}

        {/* ── Stats visuales ───────────────────────────────────────────────── */}
        {(topGenres.length > 0 || Object.keys(decadeCounts).length > 0) && (
          <section className="mb-10">
            <h2 className="text-xl font-bold mb-4">Estadísticas</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

              {/* Genres */}
              {topGenres.length > 0 && (
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5">
                  <p className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-wider mb-4">
                    Géneros más frecuentes
                  </p>
                  <div className="space-y-3">
                    {topGenres.map(g => (
                      <div key={g.id}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs text-zinc-300">{g.name}</span>
                          <span className="text-xs text-[#A0A0B0] tabular-nums">{g.count}</span>
                        </div>
                        <div className="h-1.5 bg-[#1C1C27] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#FFFD02]"
                            style={{ width: `${Math.round((g.count / genreMax) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Decades */}
              {Object.keys(decadeCounts).length > 0 && (
                <div className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-5">
                  <p className="text-xs font-semibold text-[#A0A0B0] uppercase tracking-wider mb-4">
                    Títulos por década
                  </p>
                  <div className="space-y-3">
                    {Object.entries(decadeCounts)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([decade, count]) => (
                        <div key={decade}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-zinc-300">{decade}</span>
                            <span className="text-xs text-[#A0A0B0] tabular-nums">{count}</span>
                          </div>
                          <div className="h-1.5 bg-[#1C1C27] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#FFFD02]"
                              style={{ width: `${Math.round((count / decadeMax) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Premios desde Wikidata — carga bajo demanda ──────────────────── */}
        <ActorAwards tmdbId={Number(id)} />

        {/* Filmografía completa */}
        {filmography.length > 0 && (
          <FilmographyGrid credits={filmography} title="Filmografía" />
        )}
      </div>
    </div>
  )
}
