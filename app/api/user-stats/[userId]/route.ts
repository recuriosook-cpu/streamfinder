import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Estadísticas de perfil para clientes sin backend propio (la app nativa).
 *
 * Existe aparte de `/api/user-stats?userId=` —que sigue sirviendo a la web— por
 * dos motivos concretos:
 *
 *  1. Aquella ruta autentica con `createServerClient()`, o sea con la cookie de
 *     sesión. La app guarda un JWT de Supabase en el keystore del teléfono y no
 *     manda cookies, así que contra esa ruta siempre recibiría 401.
 *  2. No tiene CORS.
 *
 * También devuelve bastante menos: sólo lo que el tab "Estadísticas" del perfil
 * dibuja. Lo que se puede calcular con una consulta a Postgres (vistas, reseñas,
 * puntos) lo hace la app sola; acá vive únicamente lo que necesita TMDB, que es
 * lo que la app no puede resolver sin gastar cientos de requests desde el
 * teléfono.
 *
 * Sobre la autorización: `watched` tiene policy de lectura pública y `profiles`
 * también, así que todo lo que se devuelve acá ya es visible para cualquiera que
 * consulte la base con la anon key. Igual se verifica que el perfil exista —para
 * no exponer el endpoint como sonda de ids— y, si viene un Bearer, que sea un
 * token válido. No se exige token porque estos números se muestran en perfiles
 * ajenos, igual que en la web.
 */

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** Una hora, como pide el brief. Las vistas no se mueven tan rápido. */
const CACHE_SECONDS = 3600

/**
 * Cuántos títulos se consultan contra TMDB.
 *
 * Es una request por título (con `append_to_response=credits` para no pagar
 * dos). Con 300 y lotes de 20 el peor caso son ~15 tandas, que entran holgadas
 * en el timeout de la función. Un usuario con más vistas obtiene sus stats
 * sobre las 300 más recientes, que es lo que representa lo que mira hoy.
 */
const MAX_TITLES = 300

/** Requests simultáneas contra TMDB. Más que esto y empieza a devolver 429. */
const BATCH_SIZE = 20

/** Con menos de esto los "favoritos" son ruido, no un gusto. */
const MIN_TITLES = 3

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
} as const

/** Nombres en castellano, calcados de `/api/user-stats`. */
const GENRE_MAP: Record<number, string> = {
  28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
  14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia ficción',
  10770: 'Película de TV', 53: 'Suspenso', 10752: 'Bélica', 37: 'Western',
  10759: 'Acción y aventura', 10762: 'Infantil', 10763: 'Noticias',
  10764: 'Reality', 10765: 'Sci-Fi y fantasía', 10766: 'Telenovela',
  10767: 'Talk show', 10768: 'Guerra y política',
}

export interface UserStatsPerson {
  id: number
  name: string
  profilePath: string | null
  /** En cuántos de los títulos vistos aparece. */
  count: number
}

export interface UserStatsResponse {
  /** `true` cuando el usuario tiene muy pocas vistas para sacar conclusiones. */
  tooFew: boolean
  /** Género más repetido entre las vistas, ya en castellano. */
  favoriteGenre: string | null
  /** Década más vista, como `1990s`. */
  favoriteDecade: string | null
  /** Horas totales, redondeadas. Series = duración de episodio × cantidad. */
  totalHours: number
  favoriteActor: UserStatsPerson | null
  favoriteDirector: UserStatsPerson | null
  /** Sobre cuántos títulos se calculó, para poder decirlo en la UI. */
  titlesAnalyzed: number
}

const EMPTY: UserStatsResponse = {
  tooFew: true,
  favoriteGenre: null,
  favoriteDecade: null,
  totalHours: 0,
  favoriteActor: null,
  favoriteDirector: null,
  titlesAnalyzed: 0,
}

type WatchedRow = {
  media_id: number
  media_type: 'movie' | 'tv'
}

type TMDBDetails = {
  runtime?: number
  episode_run_time?: number[]
  number_of_episodes?: number
  genres?: { id: number; name: string }[]
  release_date?: string
  first_air_date?: string
  credits?: {
    cast?: { id: number; name: string; profile_path: string | null; order: number }[]
    crew?: { id: number; name: string; profile_path: string | null; job: string }[]
  }
}

/** Devuelve `null` ante cualquier fallo: un título que no responde se saltea. */
async function tmdb(path: string): Promise<TMDBDetails | null> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3${path}?api_key=${TMDB_KEY}` +
        '&language=es-AR&append_to_response=credits',
      { next: { revalidate: CACHE_SECONDS } }
    )
    return res.ok ? ((await res.json()) as TMDBDetails) : null
  } catch {
    return null
  }
}

/** La clave con más cuenta, o `null` si el mapa está vacío. */
function topKey(counts: Record<string, number>): string | null {
  const entries = Object.entries(counts)
    if (entries.length === 0) return null
  return entries.sort((a, b) => b[1] - a[1])[0][0]
}

type PersonTally = Record<string, UserStatsPerson>

function topPerson(tally: PersonTally): UserStatsPerson | null {
  const entries = Object.values(tally)
  if (entries.length === 0) return null
  return entries.sort((a, b) => b.count - a.count)[0]
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !TMDB_KEY) {
    return NextResponse.json(
      { error: 'Server misconfigured' },
      { status: 500, headers: CORS_HEADERS }
    )
  }

  // Cliente con la anon key: las dos tablas que se leen son de lectura pública,
  // así que no hace falta —ni conviene— usar la service role acá.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  // Si vino un Bearer, tiene que ser un token válido. No se exige: sin él la
  // respuesta es la misma que ya da la base con la anon key.
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length)
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: CORS_HEADERS }
      )
    }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  const { data: watched } = await supabase
    .from('watched')
    .select('media_id, media_type')
    .eq('user_id', userId)
    .order('watched_at', { ascending: false })
    .range(0, MAX_TITLES - 1)

  const rows = (watched ?? []) as WatchedRow[]

  if (rows.length < MIN_TITLES) {
    return NextResponse.json(EMPTY, {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`,
      },
    })
  }

  let totalMinutes = 0
  const genreCount: Record<string, number> = {}
  const decadeCount: Record<string, number> = {}
  const actorTally: PersonTally = {}
  const directorTally: PersonTally = {}
  let analyzed = 0

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map((row) => tmdb(`/${row.media_type}/${row.media_id}`))
    )

    for (let j = 0; j < results.length; j++) {
      const details = results[j]
      if (!details) continue
      analyzed++

      // Una serie no tiene `runtime`: se estima con la duración de un episodio
      // por la cantidad total, que es lo que hace la ruta de la web.
      const minutes =
        batch[j].media_type === 'movie'
          ? details.runtime ?? 0
          : (details.episode_run_time?.[0] ?? 0) *
            (details.number_of_episodes ?? 0)

      totalMinutes += minutes

      for (const genre of details.genres ?? []) {
        const name = GENRE_MAP[genre.id] ?? genre.name
        genreCount[name] = (genreCount[name] ?? 0) + 1
      }

      const released = details.release_date ?? details.first_air_date ?? ''
      if (released.length >= 4) {
        const year = Number.parseInt(released.slice(0, 4), 10)
        if (!Number.isNaN(year)) {
          const decade = `${Math.floor(year / 10) * 10}s`
          decadeCount[decade] = (decadeCount[decade] ?? 0) + 1
        }
      }

      // Sólo el reparto principal: más abajo del puesto 10 son papeles de una
      // escena y ensucian el "actor favorito".
      for (const member of details.credits?.cast ?? []) {
        if (member.order >= 10) continue
        const key = String(member.id)
        actorTally[key] = {
          id: member.id,
          name: member.name,
          profilePath: member.profile_path,
          count: (actorTally[key]?.count ?? 0) + 1,
        }
      }

      for (const member of details.credits?.crew ?? []) {
        if (member.job !== 'Director') continue
        const key = String(member.id)
        directorTally[key] = {
          id: member.id,
          name: member.name,
          profilePath: member.profile_path,
          count: (directorTally[key]?.count ?? 0) + 1,
        }
      }
    }
  }

  const body: UserStatsResponse = {
    tooFew: false,
    favoriteGenre: topKey(genreCount),
    favoriteDecade: topKey(decadeCount),
    totalHours: Math.round(totalMinutes / 60),
    favoriteActor: topPerson(actorTally),
    favoriteDirector: topPerson(directorTally),
    titlesAnalyzed: analyzed,
  }

  return NextResponse.json(body, {
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`,
    },
  })
}
