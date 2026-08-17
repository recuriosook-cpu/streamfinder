import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { enforceRateLimit } from '@/lib/rate-limit'

/**
 * Cumpleaños de celebridades del día.
 *
 * Lo consume la app mobile además de la web, así que necesita CORS. El
 * contenido es el mismo para todo el mundo, o sea que el CDN puede servir una
 * sola respuesta a todos.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const

/**
 * Seis horas y no un día.
 *
 * La lista cambia a medianoche, pero el CDN de Vercel cachea por región y no
 * sabe de husos horarios: con 24 h, alguien en Madrid podría estar viendo los
 * cumpleaños de ayer hasta bien entrada la mañana. Seis horas acota ese
 * desfase sin dejar de ahorrar la enorme mayoría de las consultas.
 */
const TTL_SECONDS = 21_600

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, CORS_HEADERS)
  if (limited) return limited

  const now     = new Date()
  const year    = now.getFullYear()
  const todayMD = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('celebrity_birthdays')
    .select('tmdb_id, name, birthday, deathday, profile_path, popularity')
    .eq('birthday_md', todayMD)
    .order('popularity', { ascending: false })
    .limit(10)

  if (error || !data) {
    // La sección simplemente no se dibuja: es decorativa, no vale un error.
    return NextResponse.json({ birthdays: [] }, { headers: CORS_HEADERS })
  }

  const birthdays = data.map(row => {
    const birthYear = parseInt((row.birthday as string).slice(0, 4))
    const deceased  = !!row.deathday
    const age       = deceased
      ? parseInt((row.deathday as string).slice(0, 4)) - birthYear
      : year - birthYear

    return {
      id:          row.tmdb_id as number,
      name:        row.name    as string,
      profilePath: row.profile_path as string | null,
      age,
      popularity:  row.popularity as number,
      deceased,
    }
  })

  return NextResponse.json(
    { birthdays },
    {
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': `public, s-maxage=${TTL_SECONDS}, stale-while-revalidate=${TTL_SECONDS}`,
      },
    }
  )
}
