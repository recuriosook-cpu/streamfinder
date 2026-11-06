import { getMovieDetails, getTVDetails } from '@/lib/tmdb'
import { getAllGuides, type GuideFrontmatter } from '@/lib/guides'

/**
 * Lo propio de Glynbox que la portada pública manda ya escrito en el HTML:
 * reseñas de la comunidad, las últimas recomendaciones de Fer Lage y las guías.
 *
 * Existe por AdSense (noviembre de 2026): la portada era un logo, dos líneas y
 * un mosaico de posters de TMDB, o sea "contenido de poco valor" para el
 * revisor. Esto es lo que Glynbox tiene y otro sitio con datos de TMDB no.
 *
 * Todo con `fetch` al REST de Supabase y no con supabase-js, para que vaya al
 * Data Cache de Vercel: la portada es dinámica (lee la cookie de sesión) y sin
 * caché cada visita sin cuenta serían tres consultas más a Supabase. Son pocas
 * claves fijas, así que las escrituras del caché son unas decenas por día.
 *
 * Nada de esto tira: si Supabase o TMDB fallan, la sección no aparece y la
 * portada sale igual que antes.
 */

const RESENAS_SEGUNDOS = 60 * 60
const RECOMENDACIONES_SEGUNDOS = 6 * 60 * 60

export interface ResenaPortada {
  id: string
  mediaId: number
  mediaType: 'movie' | 'tv'
  titulo: string
  posterPath: string
  nota: number | null
  texto: string
  autor: string
  username: string
  avatarUrl: string | null
}

export interface RecomendacionPortada {
  mediaId: number
  mediaType: 'movie' | 'tv'
  titulo: string
  posterPath: string | null
  anio: string | null
  creador: string
  instagramCode: string
}

async function supabaseRest<T>(ruta: string, segundos: number): Promise<T | null> {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${ruta}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: segundos },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * Palabras que no van en la vidriera. Las reseñas se muestran tal cual en la
 * ficha; acá se eligen las que sirven de presentación para alguien (o un
 * revisor de anuncios) que no conoce el sitio. Raíces, sin tildes.
 */
const GROSERIAS = /\b(put[oa]s?|hdp|hij[oa]s? de put|pendej|mierd|verga|conch|cul[oa]s?\b|carajo|bolud|pelotud|forr[oa]s?|cog(e|i)|chinga|joder|jodid|marica|maric[oó]n|idiot|imbecil|estupid|tarad|porno)/i

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Una reseña que se lee como reseña: con algo de largo, sin gritos, sin groserías, sin links. */
function sirveDeVidriera(texto: string): boolean {
  const t = texto.trim()
  if (t.length < 70 || t.length > 600) return false
  if (/https?:|www\.|@\w/.test(t)) return false
  if (GROSERIAS.test(sinTildes(t))) return false
  const letras = t.replace(/[^a-záéíóúñü]/gi, '')
  const mayusculas = letras.replace(/[^A-ZÁÉÍÓÚÑÜ]/g, '')
  if (letras.length && mayusculas.length / letras.length > 0.3) return false
  return true
}

/**
 * Hasta `cuantas` reseñas recientes para la portada: sin spoilers, con póster,
 * de autores con usuario y que no ocultan su actividad, y una por autor.
 */
export async function resenasDestacadas(cuantas = 6): Promise<ResenaPortada[]> {
  type Fila = {
    id: string; user_id: string; media_id: number; media_type: 'movie' | 'tv'
    title: string | null; poster_path: string | null; rating: number | null; body: string | null
  }
  const filas = await supabaseRest<Fila[]>(
    'reviews?select=id,user_id,media_id,media_type,title,poster_path,rating,body' +
      '&has_spoiler=eq.false&body=not.is.null&poster_path=not.is.null&title=not.is.null' +
      '&order=created_at.desc&limit=150',
    RESENAS_SEGUNDOS,
  )
  if (!filas?.length) return []

  const candidatas = filas.filter(f => f.body && sirveDeVidriera(f.body))
  const ids = [...new Set(candidatas.map(f => f.user_id))].slice(0, 100)
  if (!ids.length) return []

  type Perfil = { id: string; username: string | null; display_name: string | null; avatar_url: string | null; hide_activity: boolean | null }
  const perfiles = await supabaseRest<Perfil[]>(
    `profiles?select=id,username,display_name,avatar_url,hide_activity&id=in.(${ids.join(',')})`,
    RESENAS_SEGUNDOS,
  )
  if (!perfiles) return []
  const porId = new Map(perfiles.map(p => [p.id, p]))

  const vistos = new Set<string>()
  const elegidas: ResenaPortada[] = []
  for (const f of candidatas) {
    const p = porId.get(f.user_id)
    if (!p?.username || p.hide_activity || vistos.has(f.user_id)) continue
    vistos.add(f.user_id)
    elegidas.push({
      id: f.id,
      mediaId: f.media_id,
      mediaType: f.media_type,
      titulo: f.title!,
      posterPath: f.poster_path!,
      nota: f.rating,
      texto: f.body!.trim(),
      autor: p.display_name?.trim() || p.username,
      username: p.username,
      avatarUrl: p.avatar_url,
    })
    if (elegidas.length >= cuantas) break
  }
  return elegidas
}

/** Las últimas recomendaciones de creadores (hoy, Fer Lage), con título y póster de TMDB. */
export async function ultimasRecomendaciones(cuantas = 8): Promise<RecomendacionPortada[]> {
  type Fila = {
    tmdb_id: number; media_type: 'movie' | 'tv'; instagram_code: string
    creators: { name: string } | null
  }
  const filas = await supabaseRest<Fila[]>(
    `creator_recommendations?select=tmdb_id,media_type,instagram_code,creators(name)&order=created_at.desc&limit=${cuantas}`,
    RECOMENDACIONES_SEGUNDOS,
  )
  if (!filas?.length) return []

  const conDatos = await Promise.all(
    filas.map(async (f): Promise<RecomendacionPortada | null> => {
      try {
        const d = await (f.media_type === 'movie' ? getMovieDetails(f.tmdb_id) : getTVDetails(f.tmdb_id))
        const titulo = (d?.title ?? d?.name) as string | undefined
        if (!titulo) return null
        const fecha = (d.release_date ?? d.first_air_date) as string | undefined
        return {
          mediaId: f.tmdb_id,
          mediaType: f.media_type,
          titulo,
          posterPath: (d.poster_path as string | null) ?? null,
          anio: fecha ? fecha.slice(0, 4) : null,
          creador: f.creators?.name ?? 'Fer Lage',
          instagramCode: f.instagram_code,
        }
      } catch {
        return null
      }
    }),
  )
  return conDatos.filter((r): r is RecomendacionPortada => r !== null)
}

export function guiasRecientes(cuantas = 4): GuideFrontmatter[] {
  try {
    return getAllGuides().slice(0, cuantas)
  } catch {
    return []
  }
}
