import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminClient } from '@/lib/service-role'
import { BUCKET, subirPortada } from '@/lib/recommendation-images'
import { codigoDePost, fichaDeLink, bajarPortada } from '@/lib/instagram-covers'

/**
 * /api/admin/recomendaciones — el panel `/admin/recomendaciones`.
 *
 *   GET                    las cargadas, con título, y los creadores
 *   POST   { post, ficha, creatorId }   carga una
 *   DELETE ?id=<id>        borra una
 *
 * La carga hace lo mismo que `scripts/import-recommendations.mjs` con una fila
 * del CSV, con el mismo código (`lib/instagram-covers.ts` y
 * `lib/recommendation-images.ts`): baja la portada, la pasa a WebP, la sube a
 * Storage y crea la fila, con `embeddable = false` si no hubo portada limpia.
 *
 * Una diferencia a propósito: el script reemplaza la recomendación de una
 * ficha que ya tenía otro post; el panel no. Cargar a mano un post en la ficha
 * equivocada no tiene que pisar en silencio una que estaba bien. Si ya está,
 * contesta 409 con cuál es, y para reemplazarla se borra primero.
 *
 * Borrar saca la fila pero deja la portada en Storage: la ficha cacheada y la
 * app pueden seguir apuntando a ese archivo un rato, y la gracia del bucket es
 * que esas URLs no se rompen nunca. Los archivos sin fila los barre
 * `scripts/optimize-recommendation-covers.mjs --borrar-viejas`.
 *
 * Después de cargar o borrar se invalida la ficha, para que el cambio se vea
 * en la próxima visita y no a la hora.
 */

export const runtime = 'nodejs'

/** Instagram + sharp + Storage tardan unos segundos; el tope es por si Instagram se cuelga. */
export const maxDuration = 60

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

/** Los títulos casi no cambian; con una semana de caché la lista carga al toque. */
const TITULO_REVALIDATE = 7 * 24 * 60 * 60

/** TMDB aguanta ~40 pedidos por segundo; con 160 filas y caché fría esto va sobrado. */
const TMDB_CONCURRENCIA = 10

/**
 * Mismo criterio de admin que `app/admin/layout.tsx` y el resto de
 * `/api/admin`: el username del perfil. Copiado, como en `/api/admin/revalidate`
 * (ver la nota ahí), para no inventar un criterio distinto.
 */
async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => { try { cookieStore.set(name, value, options) } catch { /**/ } }) },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  return profile?.username === 'Ferlageok' ? user : null
}

// ── Tipos ──────────────────────────────────────────────────────────────────

type MediaType = 'movie' | 'tv'

interface Row {
  id: number
  instagram_code: string
  media_type: MediaType
  tmdb_id: number
  cover_path: string
  embeddable: boolean
  created_at: string
  creators: { id: number; name: string; instagram_username: string } | null
}

const SELECT_ROW = 'id, instagram_code, media_type, tmdb_id, cover_path, embeddable, created_at, creators(id, name, instagram_username)'

export interface RecomendacionAdmin {
  id: number
  code: string
  mediaType: MediaType
  tmdbId: number
  /** `null` si TMDB no contestó: la fila se muestra igual, con el id. */
  title: string | null
  year: string | null
  coverUrl: string
  embeddable: boolean
  createdAt: string
  creator: { id: number; name: string; username: string } | null
}

// ── TMDB ───────────────────────────────────────────────────────────────────

/**
 * Título y año en castellano. `null` si la ficha no existe o TMDB falla.
 * Pasa por la caché de datos de Next, así que pedir 160 es caro una vez por
 * semana y no en cada carga del panel.
 */
async function tituloDe(mediaType: MediaType, tmdbId: number): Promise<{ title: string; year: string | null } | null> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=es-AR`,
      { next: { revalidate: TITULO_REVALIDATE } },
    )
    if (!res.ok) return null
    const d = await res.json() as { title?: string; name?: string; release_date?: string; first_air_date?: string }
    const title = d.title ?? d.name
    if (!title) return null
    const fecha = d.release_date ?? d.first_air_date ?? ''
    return { title, year: fecha.length >= 4 ? fecha.slice(0, 4) : null }
  } catch {
    return null
  }
}

/** `Promise.all` con tope de cuántas corren a la vez. */
async function mapConTope<T, R>(items: T[], tope: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let siguiente = 0
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(tope, items.length) }, trabajador))
  return out
}

function aRecomendacion(
  admin: SupabaseClient,
  row: Row,
  titulo: { title: string; year: string | null } | null,
): RecomendacionAdmin {
  return {
    id: row.id,
    code: row.instagram_code,
    mediaType: row.media_type,
    tmdbId: row.tmdb_id,
    title: titulo?.title ?? null,
    year: titulo?.year ?? null,
    coverUrl: admin.storage.from(BUCKET).getPublicUrl(row.cover_path).data.publicUrl,
    embeddable: row.embeddable,
    createdAt: row.created_at,
    creator: row.creators
      ? { id: row.creators.id, name: row.creators.name, username: row.creators.instagram_username }
      : null,
  }
}

function error(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: code, message, ...extra }, { status })
}

/** "Oblivion (2013), de Fer Lage", o lo que haya. */
function describir(r: RecomendacionAdmin): string {
  const titulo = r.title ? `${r.title}${r.year ? ` (${r.year})` : ''}` : `${r.mediaType}/${r.tmdbId}`
  return r.creator ? `${titulo}, de ${r.creator.name}` : titulo
}

// ── GET: lista ─────────────────────────────────────────────────────────────

export async function GET() {
  if (!await requireAdmin()) return error(401, 'unauthorized', 'No autorizado.')
  const { admin, failure } = requireAdminClient('admin/recomendaciones')
  if (failure) return failure

  const [recs, creators] = await Promise.all([
    admin
      .from('creator_recommendations')
      .select(SELECT_ROW)
      .order('created_at', { ascending: false })
      .overrideTypes<Row[], { merge: false }>(),
    admin.from('creators').select('id, name, instagram_username').order('name'),
  ])
  if (recs.error) return error(500, 'db', recs.error.message)
  if (creators.error) return error(500, 'db', creators.error.message)

  const titulos = await mapConTope(recs.data, TMDB_CONCURRENCIA, r => tituloDe(r.media_type, r.tmdb_id))

  return NextResponse.json({
    items: recs.data.map((r, i) => aRecomendacion(admin, r, titulos[i])),
    creators: creators.data.map(c => ({ id: c.id, name: c.name, username: c.instagram_username })),
  })
}

// ── POST: cargar una ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return error(401, 'unauthorized', 'No autorizado.')
  const { admin, failure } = requireAdminClient('admin/recomendaciones')
  if (failure) return failure

  const body = await req.json().catch(() => null) as { post?: unknown; ficha?: unknown; creatorId?: unknown } | null
  const post  = typeof body?.post === 'string' ? body.post.trim() : ''
  const ficha = typeof body?.ficha === 'string' ? body.ficha.trim() : ''
  const creatorId = Number(body?.creatorId)

  const codigo = codigoDePost(post)
  if (!codigo) {
    return error(400, 'post_invalido', 'El link de Instagram no es un post. Tiene que ser del tipo instagram.com/p/… o instagram.com/reel/…')
  }
  const media = fichaDeLink(ficha)
  if (!media) {
    return error(400, 'ficha_invalida', 'El link de Glynbox no es una ficha. Tiene que ser del tipo glynbox.com/movie/123 o glynbox.com/tv/123')
  }

  const { data: creator, error: errCreator } = await admin
    .from('creators')
    .select('id, name')
    .eq('id', creatorId)
    .maybeSingle()
  if (errCreator) return error(500, 'db', errCreator.message)
  if (!creator) return error(400, 'creador_invalido', 'Elegí un creador.')

  // ── ¿Ya estaba? Antes de pedirle nada a Instagram. ──
  const { data: previas, error: errPrevias } = await admin
    .from('creator_recommendations')
    .select(SELECT_ROW)
    .or(`instagram_code.eq.${codigo},and(creator_id.eq.${creator.id},media_type.eq.${media.mediaType},tmdb_id.eq.${media.tmdbId})`)
    .overrideTypes<Row[], { merge: false }>()
  if (errPrevias) return error(500, 'db', errPrevias.message)

  const mismoPost = previas.find(r => r.instagram_code === codigo)
  if (mismoPost) {
    const existente = aRecomendacion(admin, mismoPost, await tituloDe(mismoPost.media_type, mismoPost.tmdb_id))
    return error(409, 'post_duplicado', `Este post ya está cargado: ${describir(existente)}.`, { existente })
  }
  const mismaFicha = previas[0]
  if (mismaFicha) {
    const existente = aRecomendacion(admin, mismaFicha, await tituloDe(mismaFicha.media_type, mismaFicha.tmdb_id))
    return error(
      409,
      'ficha_duplicada',
      `${describir(existente)} ya tiene otro post cargado. Si querés reemplazarlo, borrá ese primero.`,
      { existente },
    )
  }

  const titulo = await tituloDe(media.mediaType, media.tmdbId)
  if (!titulo) {
    return error(400, 'ficha_inexistente', `No encontré la ficha ${media.mediaType}/${media.tmdbId} en TMDB. Revisá el link.`)
  }

  // ── Portada ──
  let portada: Awaited<ReturnType<typeof bajarPortada>>
  try {
    portada = await bajarPortada(codigo)
  } catch (e) {
    console.error('[admin/recomendaciones] Instagram:', e)
    portada = null
  }
  if (!portada) {
    return error(
      502,
      'sin_portada',
      'Instagram no devolvió la portada. Revisá que el post sea público y probá de nuevo en un rato; si sigue, cargala con el script desde la computadora.',
    )
  }

  let coverPath: string
  try {
    coverPath = (await subirPortada(admin, codigo, portada.buf)).ruta
  } catch (e) {
    return error(500, 'storage', e instanceof Error ? e.message : 'No se pudo subir la portada.')
  }

  const { data: fila, error: errInsert } = await admin
    .from('creator_recommendations')
    .insert({
      creator_id:     creator.id,
      tmdb_id:        media.tmdbId,
      media_type:     media.mediaType,
      instagram_code: codigo,
      cover_path:     coverPath,
      embeddable:     portada.limpia,
    })
    .select(SELECT_ROW)
    .single()
    .overrideTypes<Row, { merge: false }>()
  if (errInsert) {
    // 23505 = otra carga del mismo post o ficha ganó la carrera entre el chequeo y el insert.
    if (errInsert.code === '23505') {
      return error(409, 'duplicado', 'Se acaba de cargar este post o esta ficha. Actualizá la lista.')
    }
    return error(500, 'db', errInsert.message)
  }

  revalidatePath(`/${media.mediaType}/${media.tmdbId}`)

  return NextResponse.json({ item: aRecomendacion(admin, fila, titulo) }, { status: 201 })
}

// ── DELETE: borrar una ─────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) return error(401, 'unauthorized', 'No autorizado.')
  const { admin, failure } = requireAdminClient('admin/recomendaciones')
  if (failure) return failure

  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return error(400, 'id_invalido', 'Falta el id.')

  const { data: borrada, error: errDelete } = await admin
    .from('creator_recommendations')
    .delete()
    .eq('id', id)
    .select('media_type, tmdb_id')
    .maybeSingle()
  if (errDelete) return error(500, 'db', errDelete.message)
  if (!borrada) return error(404, 'no_existe', 'Esa recomendación ya no está. Actualizá la lista.')

  revalidatePath(`/${borrada.media_type}/${borrada.tmdb_id}`)

  return NextResponse.json({ ok: true })
}
