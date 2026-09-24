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
