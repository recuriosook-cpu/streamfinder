import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Recomendaciones de creadores para una ficha: "Recomendado por Fer Lage" y el
 * video de Instagram donde habla del título.
 *
 * Se lee del lado del servidor, en el render de la ficha, y va horneado en el
 * HTML que cachea el CDN. Puede ir ahí porque no depende de quién mira: es lo
 * mismo para todos, a diferencia del bloque de Surfshark. La portada es una URL
 * pública de Storage que no vence, así que el HTML cacheado nunca apunta a una
 * imagen rota. Ver `supabase-creator-recommendations.sql`; se cargan desde
 * `/admin/recomendaciones` o con `scripts/import-recommendations.mjs`.
 */

const BUCKET = 'recommendations'

export interface CreatorRecommendation {
  /** Código del post de Instagram, lo que va en /p/<código>/. */
  instagramCode: string
  coverUrl: string
  /** `false` = Instagram no deja insertarlo: se abre Instagram, no el modal. */
  embeddable: boolean
  creator: {
    name: string
    /** Sin @. Es también lo que viaja como `creador` en la medición. */
    username: string
    avatarUrl: string | null
  }
}

interface Row {
  instagram_code: string
  cover_path: string
  embeddable: boolean
  creators: { name: string; instagram_username: string; avatar_path: string | null } | null
}

/**
 * La etiqueta de la lista de títulos con recomendación (ver `indice`). El
 * panel la vence al cargar o borrar una, así la próxima ficha ya la ve.
 */
export const TAG_INDICE_RECOMENDACIONES = 'recomendaciones-indice'

/**
 * La etiqueta de caché de una ficha en la CDN: la pone `next.config.ts`
 * (`Vercel-Cache-Tag`) y el panel la purga al cargar o borrar una
 * recomendación de ese título. `revalidatePath` no alcanza: las fichas no usan
 * ISR, se cachean con `Vercel-CDN-Cache-Control`, y esa copia sólo se borra
 * por etiqueta.
 */
export function tagFicha(mediaType: 'movie' | 'tv', mediaId: number): string {
  return `ficha-${mediaType}-${mediaId}`
}

/**
 * Qué títulos tienen alguna recomendación, armado desde la base.
 *
 * Son ~200 títulos entre decenas de miles de fichas: consultar las
 * recomendaciones en cada render casi siempre volvía vacío, y eran ~8 pedidos
 * por minuto a Supabase (cada uno una línea más en sus logs; el plan Free
 * tiene 1 GB por mes). Con esta lista sólo se consulta en las fichas que
 * tienen alguna.
 *
 * Va en la caché de datos de Vercel y no en la memoria de la instancia: el
 * 28/10 vivía 30 minutos en cada instancia, y una recomendación nueva no
 * aparecía hasta que vencía en todas (Mr. Nobody, 29/10). La caché de datos es
 * una sola para todas las instancias y el panel la vence con
 * `TAG_INDICE_RECOMENDACIONES` al cargar o borrar. El día es sólo por las
 * dudas: una carga hecha a mano en la base o con el script de importación.
 */
async function indice(): Promise<Set<string> | null> {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/creator_recommendations?select=media_type,tmdb_id&limit=10000`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { tags: [TAG_INDICE_RECOMENDACIONES], revalidate: 86_400 },
    },
  )
  if (!res.ok) return null
  const filas = (await res.json()) as { media_type: string; tmdb_id: number }[]
  return new Set(filas.map(r => `${r.media_type}:${r.tmdb_id}`))
}

async function tieneRecomendaciones(mediaType: 'movie' | 'tv', mediaId: number): Promise<boolean> {
  const claves = await indice()
  // Si falla, se consulta la ficha como antes de existir la lista.
  return claves ? claves.has(`${mediaType}:${mediaId}`) : true
}

/**
 * Nunca tira: ante cualquier error devuelve `[]` y el bloque no aparece. Una
 * ficha sin la recomendación sigue siendo una ficha; una ficha que no carga
 * porque falló esto, no.
 */
export async function getCreatorRecommendations(
  supabase: SupabaseClient,
  mediaType: 'movie' | 'tv',
  mediaId: number,
): Promise<CreatorRecommendation[]> {
  try {
    if (!(await tieneRecomendaciones(mediaType, mediaId))) return []

    const { data, error } = await supabase
      .from('creator_recommendations')
      .select('instagram_code, cover_path, embeddable, creators(name, instagram_username, avatar_path)')
      .eq('media_type', mediaType)
      .eq('tmdb_id', mediaId)
      .order('created_at')
      .overrideTypes<Row[], { merge: false }>()
    if (error || !data) return []

    const publicUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

    return data
      .filter(row => row.creators)
      .map(row => ({
        instagramCode: row.instagram_code,
        coverUrl: publicUrl(row.cover_path),
        embeddable: row.embeddable,
        creator: {
          name: row.creators!.name,
          username: row.creators!.instagram_username,
          avatarUrl: row.creators!.avatar_path ? publicUrl(row.creators!.avatar_path) : null,
        },
      }))
  } catch {
    return []
  }
}

/** "Fer Lage", "Fer Lage y Ana", "Fer Lage, Ana y Luis". */
export function creatorNames(items: CreatorRecommendation[]): string {
  return new Intl.ListFormat('es', { type: 'conjunction' }).format(items.map(i => i.creator.name))
}
