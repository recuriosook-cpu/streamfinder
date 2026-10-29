import { createServerClient } from '@/lib/supabase-server'
import { getAdminClient } from '@/lib/service-role'
import { getMovieDetails, getTVDetails } from '@/lib/tmdb'
import { buildDetail, type GuiaItem } from '@/lib/guias-api'
import { getGuideBySlug } from '@/lib/guides'
import { avatarParaImagen, fondoDesenfocado, portadaGuia, portadaLista, type ShareCalificacion, type ShareLista, type ShareMedia, type ShareReview, type ShareTop5 } from '@/lib/share-image'

/**
 * Datos para las imágenes de compartir (lib/share-image.tsx).
 *
 * Se lee como visitante (lib/supabase-server usa la anon key): una reseña que
 * no se ve en el sitio tampoco se puede dibujar. La única excepción es quien la
 * escribió, que puede compartir la suya aunque tenga "Ocultar actividad".
 */

export async function loadShareMedia(kind: 'movie' | 'tv', id: number): Promise<ShareMedia | null> {
  try {
    const d = kind === 'movie' ? await getMovieDetails(id) : await getTVDetails(id)
    const date: string | undefined = kind === 'movie' ? d.release_date : d.first_air_date
    const fondo = await fondoDesenfocado(d.backdrop_path ?? d.poster_path ?? null)
    return {
      kind,
      title: (kind === 'movie' ? d.title : d.name) ?? '',
      year: date ? date.slice(0, 4) : null,
      posterPath: d.poster_path ?? null,
      backdropPath: d.backdrop_path ?? null,
      tmdbScore: d.vote_count > 0 && d.vote_average > 0 ? d.vote_average : null,
      fondo,
    }
  } catch {
    return null
  }
}

type ReviewRow = {
  user_id: string
  media_id: number | string
  media_type: string
  rating: number | string | null
  body: string | null
  has_spoiler: boolean | null
}
type AuthorRow = { username: string; avatar_url: string | null; hide_activity: boolean | null; verified: boolean | null }

const REVIEW_COLS = 'user_id, media_id, media_type, rating, body, has_spoiler'
const AUTHOR_COLS = 'username, avatar_url, hide_activity, verified'

/**
 * La reseña lista para dibujar, o `null` si no existe o quien pide no la puede
 * ver. `privada` es `true` cuando sólo se pudo leer por ser el autor: esa
 * imagen no se cachea en la CDN.
 *
 * `getViewerId` se llama sólo si la reseña está oculta para visitantes: en el
 * caso normal no hace falta saber quién pide.
 */
export async function loadShareReview(
  id: string,
  getViewerId: () => Promise<string | null>
): Promise<{ review: ShareReview; privada: boolean } | null> {
  const supabase = createServerClient()

  let privada = false
  let { data: row } = await supabase.from('reviews').select(REVIEW_COLS).eq('id', id).maybeSingle<ReviewRow>()
  let author: AuthorRow | null = null
  if (row) {
    ;({ data: author } = await supabase.from('profiles').select(AUTHOR_COLS).eq('id', row.user_id).maybeSingle<AuthorRow>())
  }

  // Oculta para visitantes: sólo el autor sigue, y leyendo con la service role.
  if (!row || !author || author.hide_activity) {
    const viewerId = await getViewerId()
    if (!viewerId) return null
    const admin = getAdminClient()
    ;({ data: row } = await admin.from('reviews').select(REVIEW_COLS).eq('id', id).maybeSingle<ReviewRow>())
    if (!row || row.user_id !== viewerId) return null
    ;({ data: author } = await admin.from('profiles').select(AUTHOR_COLS).eq('id', viewerId).maybeSingle<AuthorRow>())
    if (!author) return null
    privada = true
  }

  const media = await loadShareMedia(row.media_type === 'tv' ? 'tv' : 'movie', Number(row.media_id))
  if (!media) return null

  return {
    privada,
    review: {
      media,
      rating: row.rating === null ? null : Number(row.rating),
      body: row.body,
      hasSpoiler: row.has_spoiler === true,
      username: author.username,
      avatarUrl: await avatarParaImagen(author.avatar_url),
      verified: author.verified === true,
    },
  }
}

// ── Compartir (octubre de 2026): calificación, lista y top 5 ─────────────────

/**
 * La calificación de quien pide, para "Compartí tu calificación". Las
 * calificaciones sólo las lee su dueño, así que siempre va con su sesión y la
 * imagen no se cachea. Si escribió una reseña sin spoilers, va la frase.
 */
export async function loadShareCalificacion(
  viewerId: string,
  kind: 'movie' | 'tv',
  id: number
): Promise<ShareCalificacion | null> {
  const admin = getAdminClient()
  const [{ data: nota }, { data: resena }, { data: autor }] = await Promise.all([
    admin.from('ratings').select('rating').eq('user_id', viewerId).eq('media_type', kind).eq('media_id', id)
      .maybeSingle<{ rating: number | string | null }>(),
    admin.from('reviews').select('body, has_spoiler').eq('user_id', viewerId).eq('media_type', kind).eq('media_id', id)
      .maybeSingle<{ body: string | null; has_spoiler: boolean | null }>(),
    admin.from('profiles').select('username, avatar_url, verified').eq('id', viewerId)
      .maybeSingle<{ username: string; avatar_url: string | null; verified: boolean | null }>(),
  ])
  const rating = Number(nota?.rating ?? 0)
  if (!rating || !autor?.username) return null
  const media = await loadShareMedia(kind, id)
  if (!media) return null
  return {
    media,
    rating,
    body: resena && !resena.has_spoiler ? resena.body : null,
    username: autor.username,
    avatarUrl: await avatarParaImagen(autor.avatar_url),
    verified: autor.verified === true,
  }
}

/**
 * Una lista, para "Compartir lista". Pública: como visitante, y se cachea. Si
 * es privada, sólo la puede pedir su dueño (`privada`, sin caché).
 */
export async function loadShareLista(
  id: string,
  getViewerId: () => Promise<string | null>
): Promise<{ lista: ShareLista; privada: boolean } | null> {
  type ListaRow = { user_id: string; title: string; description: string | null; is_public: boolean | null }
  const supabase = createServerClient()
  let privada = false
  let { data: lista } = await supabase.from('lists').select('user_id, title, description, is_public').eq('id', id).maybeSingle<ListaRow>()
  let lector: ReturnType<typeof createServerClient> | ReturnType<typeof getAdminClient> = supabase

  if (!lista || !lista.is_public) {
    const viewerId = await getViewerId()
    if (!viewerId) return null
    const admin = getAdminClient()
    ;({ data: lista } = await admin.from('lists').select('user_id, title, description, is_public').eq('id', id).maybeSingle<ListaRow>())
    if (!lista || lista.user_id !== viewerId) return null
    lector = admin
    privada = true
  }

  type ItemRow = { media_id: number; media_type: string; title: string; poster_path: string | null; release_year: number | null }
  const [{ data: items, count }, { data: autor }] = await Promise.all([
    lector.from('list_items').select('media_id, media_type, title, poster_path, release_year', { count: 'exact' })
      .eq('list_id', id).order('position', { ascending: true }).limit(10),
    lector.from('profiles').select('username, avatar_url, verified').eq('id', lista.user_id)
      .maybeSingle<{ username: string; avatar_url: string | null; verified: boolean | null }>(),
  ])
  if (!autor?.username) return null
  const filas = (items ?? []) as ItemRow[]

  // De TMDB: la imagen horizontal de la primera y el año de las que no lo
  // guardaron (las listas viejas y las oficiales no tienen `release_year`).
  const detalles = await Promise.all(
    filas.map((f, i) => (i === 0 || f.release_year == null ? detalleTmdb(f) : Promise.resolve(null)))
  )
  const [portada, avatarUrl] = await Promise.all([
    portadaLista(detalles[0]?.backdrop_path ?? detalles[0]?.poster_path ?? null),
    avatarParaImagen(autor.avatar_url),
  ])

  return {
    privada,
    lista: {
      title: lista.title,
      description: lista.description,
      autor: { username: autor.username, avatarUrl, verified: autor.verified === true },
      total: count ?? filas.length,
      items: filas.map((f, i) => ({
        title: f.title,
        year: f.release_year ?? anioDe(detalles[i]),
        posterPath: f.poster_path,
      })),
      portada,
    },
  }
}

type DetalleTmdb = { backdrop_path?: string | null; poster_path?: string | null; release_date?: string; first_air_date?: string }

/** La ficha de TMDB de un título de la lista, o null si no contesta. */
async function detalleTmdb(f: { media_id: number; media_type: string }): Promise<DetalleTmdb | null> {
  try {
    return f.media_type === 'tv' ? await getTVDetails(f.media_id) : await getMovieDetails(f.media_id)
  } catch {
    return null
  }
}

function anioDe(d: DetalleTmdb | null): number | null {
  const fecha = d?.release_date || d?.first_air_date
  return fecha ? Number(fecha.slice(0, 4)) || null : null
}

/**
 * "Compartir mi top" de quien pide: las favoritas que fijó en el perfil (hay 4
 * lugares), en su orden, y nada más. Antes se completaba hasta cinco con lo
 * que calificó más alto, y salían títulos que la persona no había elegido.
 * Con su sesión, sin caché. `null` si no fijó ninguna.
 */
export async function loadShareTop5(viewerId: string): Promise<ShareTop5 | null> {
  const admin = getAdminClient()
  const [{ data: fijadas }, { data: autor }] = await Promise.all([
    admin.from('pinned_favorites').select('poster_path, slot').eq('user_id', viewerId)
      .order('slot', { ascending: true }),
    admin.from('profiles').select('username, avatar_url, verified').eq('id', viewerId)
      .maybeSingle<{ username: string; avatar_url: string | null; verified: boolean | null }>(),
  ])
  if (!autor?.username) return null
  const posters = ((fijadas ?? []) as { poster_path: string | null }[])
    .map(f => f.poster_path)
    .filter((p): p is string => Boolean(p))
    .slice(0, 4)
  if (posters.length === 0) return null
  return { username: autor.username, avatarUrl: await avatarParaImagen(autor.avatar_url), verified: autor.verified === true, posters }
}

/**
 * Una guía, para "Compartir guía": la misma historia que una lista
 * (`ListaStory`), sin autor porque las guías son de Glynbox. Los títulos en el
 * orden en que aparecen en la guía, sin repetir. La portada es la de la guía;
 * si no tiene, la imagen horizontal del primer título.
 */
export async function loadShareGuia(slug: string): Promise<ShareLista | null> {
  const guia = getGuideBySlug(slug)
  const detalle = guia ? await buildDetail(slug) : null
  if (!detalle || !guia) return null

  const vistos = new Set<string>()
  const items: GuiaItem[] = []
  for (const section of detalle.sections) {
    const delBloque =
      section.type === 'movie_grid' ? section.items : section.type === 'movie_card' ? [section.item] : []
    for (const item of delBloque) {
      const clave = `${item.mediaType}:${item.id}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      items.push(item)
    }
  }

  let portada = guia.heroImage ? await portadaGuia(guia.heroImage) : null
  if (!portada && items[0]) {
    const d = await detalleTmdb({ media_id: items[0].id, media_type: items[0].mediaType })
    portada = await portadaLista(d?.backdrop_path ?? d?.poster_path ?? null)
  }

  return {
    title: detalle.title,
    description: detalle.tagline?.trim() || fraseDeGuia(items, detalle.itemCount),
    autor: null,
    total: detalle.itemCount,
    items: items.slice(0, 10).map(i => ({ title: i.title, year: i.releaseYear, posterPath: i.posterPath })),
    portada,
    cronologica: esCronologica(items),
  }
}

/**
 * Si los títulos de la guía van en orden de estreno (como "Evolución del
 * terror"). Se mira la guía entera y no sólo los 10 de la imagen, todos tienen
 * que tener año, y se tolera algún salto chico: las guías van por épocas y
 * "Evolución del terror" pone Pesadilla (1984) antes que El resplandor (1980).
 * Cuenta qué parte de los pares de títulos está en orden: 0,9 deja entrar a
 * esa (0,97) y deja afuera a "Studio Ghibli", que va por otro orden (0,61), y
 * a "Cine argentino" (0,86), que se acerca pero no va por fecha.
 */
function esCronologica(items: GuiaItem[]): boolean {
  const anios = items.map(i => i.releaseYear)
  if (anios.length < 3 || anios.some(a => a == null)) return false
  const a = anios as number[]
  let enOrden = 0
  let pares = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      if (a[i] === a[j]) continue
      pares++
      if (a[i] < a[j]) enOrden++
    }
  }
  return pares > 0 && enOrden / pares >= 0.9
}

/** Una línea para la guía que no tiene descripción, armada con lo que tiene adentro. */
function fraseDeGuia(items: GuiaItem[], total: number): string {
  const anios = items.map(i => i.releaseYear).filter((a): a is number => a != null)
  const titulos = `${total} ${total === 1 ? 'título' : 'títulos'}`
  if (anios.length >= 2 && Math.min(...anios) < Math.max(...anios)) {
    return `${titulos} de ${Math.min(...anios)} a ${Math.max(...anios)}, elegidos por Glynbox.`
  }
  return `${titulos} elegidos por Glynbox.`
}
