import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import JSZip from 'jszip'

// ── Auth helper ────────────────────────────────────────────────────────────

async function getUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(list) {
          list.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options) } catch { /* read-only */ }
          })
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

// ── CSV helpers ────────────────────────────────────────────────────────────

function csvField(value: string | number | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// ── Paginación ─────────────────────────────────────────────────────────────

/**
 * La API de Supabase devuelve como mucho 1000 filas por pedido (el `max rows`
 * del proyecto), pida lo que se pida: un `.range(0, 9999)` trae 1000 igual,
 * sin error ni aviso. Así la exportación salió cortada para cualquiera con más
 * de 1000 vistas, notas o lo que fuera (encontrado el 2026-09-27).
 *
 * Esto pide de a una página hasta que llega una incompleta. La consulta tiene
 * que tener un orden estable, que termine en columnas que no se repitan para
 * el usuario: si dos filas empatan, entre una página y la siguiente Postgres
 * puede devolverlas en otro orden y alguna se pierde o se repite.
 */
const PAGINA = 1000

async function todas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const filas: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pagina(desde, desde + PAGINA - 1)
    if (error) return { data: filas, error }
    filas.push(...(data ?? []))
    if (!data || data.length < PAGINA) return { data: filas, error: null }
  }
}

function csvRow(...fields: (string | number | null | undefined)[]): string {
  return fields.map(csvField).join(',')
}

function isoDate(ts: string | null | undefined): string {
  if (!ts) return ''
  return ts.split('T')[0]
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { supabase, user } = await getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format') ?? 'json'
  const userId = user.id
  const today  = new Date().toISOString().split('T')[0]

  // ── Fetch all user data ──────────────────────────────────────────────────

  const [
    profileRes, watchedRes, watchlistRes, favoritesRes,
    ratingsRes,  reviewsRes, listsRes,    pinnedRes,
    actorsRes,   seasonReviewsRes, episodeRatingsRes,
  ] = await Promise.all([
    supabase.from('profiles')
      // Sin created_at: profiles no tiene esa columna, y pedirla hacía fallar la
      // consulta entera — el perfil salía vacío en todas las exportaciones.
      .select('id, username, display_name, bio, avatar_url, points, level, country, notification_preferences, favorite_genres, favorite_platforms, hide_activity')
      .eq('id', userId).maybeSingle(),
    // Cada orden termina en la clave única de la tabla para el usuario: ver
    // `todas()`.
    todas((desde, hasta) => supabase.from('watched')
      .select('media_id, media_type, title, poster_path, watched_at')
      .eq('user_id', userId)
      .order('watched_at', { ascending: false }).order('media_type').order('media_id')
      .range(desde, hasta)),
    todas((desde, hasta) => supabase.from('watchlist')
      .select('media_id, media_type, title, poster_path, added_at')
      .eq('user_id', userId)
      .order('added_at', { ascending: false }).order('media_type').order('media_id')
      .range(desde, hasta)),
    todas((desde, hasta) => supabase.from('favorites')
      .select('media_id, media_type, title, poster_path, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }).order('media_type').order('media_id')
      .range(desde, hasta)),
    todas((desde, hasta) => supabase.from('ratings')
      .select('media_id, media_type, title, poster_path, rating, rated_at')
      .eq('user_id', userId)
      .order('rated_at', { ascending: false }).order('media_type').order('media_id')
      .range(desde, hasta)),
    todas((desde, hasta) => supabase.from('reviews')
      .select('id, media_id, media_type, title, poster_path, rating, body, recommended, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }).order('id')
      .range(desde, hasta)),
    todas((desde, hasta) => supabase.from('lists')
      .select('id, title, description, is_public, created_at, list_items(media_id, media_type, title, poster_path, position)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }).order('id')
      .range(desde, hasta)),
    supabase.from('pinned_favorites')
      .select('media_id, media_type, title, poster_path, slot')
      .eq('user_id', userId),
    todas((desde, hasta) => supabase.from('followed_actors')
      .select('actor_id, actor_name, actor_photo, birthday')
      .eq('user_id', userId)
      .order('actor_id')
      .range(desde, hasta)),
    todas((desde, hasta) => supabase.from('season_reviews')
      .select('series_id, series_title, season_number, season_name, rating, body, has_spoiler, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }).order('series_id').order('season_number')
      .range(desde, hasta)),
    todas((desde, hasta) => supabase.from('episode_ratings')
      .select('series_id, series_title, season_number, episode_number, episode_name, rating, created_at, updated_at')
      .eq('user_id', userId)
      .order('series_id').order('season_number').order('episode_number')
      .range(desde, hasta)),
  ])

  // ── JSON export ──────────────────────────────────────────────────────────

  if (format === 'json') {
    const payload = {
      exported_at: new Date().toISOString(),
      profile:     profileRes.data,
      watched:     watchedRes.data     ?? [],
      watchlist:   watchlistRes.data   ?? [],
      favorites:   favoritesRes.data   ?? [],
      ratings:     ratingsRes.data     ?? [],
      reviews:     reviewsRes.data     ?? [],
      lists:       listsRes.data       ?? [],
      pinned_favorites: pinnedRes.data ?? [],
      followed_actors:  actorsRes.data ?? [],
      season_reviews:   seasonReviewsRes.data ?? [],
      episode_ratings:  episodeRatingsRes.data ?? [],
    }

    const username = (profileRes.data as { username: string | null } | null)?.username ?? 'user'
    const filename = `glynbox-export-${username}-${today}.json`

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  // ── CSV / Letterboxd export ──────────────────────────────────────────────

  if (format === 'csv') {
    type WatchedRow  = { media_id: number; media_type: string; title: string; watched_at: string | null }
    type RatingRow   = { media_id: number; media_type: string; title: string; rating: number; rated_at: string | null }
    type WatchlistRow = { media_id: number; media_type: string; title: string; added_at: string | null }
    type ReviewRow   = { media_id: number; media_type: string; title: string; rating: number | null; body: string | null; created_at: string | null }

    const watched   = (watchedRes.data   ?? []) as WatchedRow[]
    const ratings   = (ratingsRes.data   ?? []) as RatingRow[]
    const watchlist = (watchlistRes.data ?? []) as WatchlistRow[]
    const reviews   = (reviewsRes.data   ?? []) as ReviewRow[]

    // Build a ratings lookup: "type-id" → rating
    const ratingMap = new Map<string, number>(
      ratings.map(r => [`${r.media_type}-${r.media_id}`, r.rating])
    )

    // watched.csv — Date,Name,Year,Rating10
    const watchedCsv = [
      'Date,Name,Year,Rating10',
      ...watched.map(w => {
        const key     = `${w.media_type}-${w.media_id}`
        const rating  = ratingMap.get(key)
        // Letterboxd Rating10 scale: our 1-5 × 2 = 2-10
        const rating10 = rating != null ? String(Math.round(rating * 2)) : ''
        return csvRow(isoDate(w.watched_at), w.title, '', rating10)
      }),
    ].join('\r\n')

    // ratings.csv — Date,Name,Year,Rating (Letterboxd 0.5-5.0 scale, same as ours)
    const ratingsCsv = [
      'Date,Name,Year,Rating',
      ...ratings.map(r => csvRow(isoDate(r.rated_at), r.title, '', r.rating)),
    ].join('\r\n')

    // watchlist.csv — Date,Name,Year
    const watchlistCsv = [
      'Date,Name,Year',
      ...watchlist.map(w => csvRow(isoDate(w.added_at), w.title, '')),
    ].join('\r\n')

    // reviews.csv — Date,Name,Year,Rating,Review
    const reviewsCsv = [
      'Date,Name,Year,Rating,Review',
      ...reviews.map(r => csvRow(isoDate(r.created_at), r.title, '', r.rating ?? '', r.body ?? '')),
    ].join('\r\n')

    const zip = new JSZip()
    zip.file('watched.csv',   watchedCsv)
    zip.file('ratings.csv',   ratingsCsv)
    zip.file('watchlist.csv', watchlistCsv)
    zip.file('reviews.csv',   reviewsCsv)

    const zipArrayBuffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
    const zipBytes = new Uint8Array(zipArrayBuffer)

    const username = (profileRes.data as { username: string | null } | null)?.username ?? 'user'
    const filename = `glynbox-letterboxd-export-${username}-${today}.zip`

    return new Response(zipBytes, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  return NextResponse.json({ error: 'Formato no válido. Usá ?format=json o ?format=csv' }, { status: 400 })
}
