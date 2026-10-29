import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isKnownSlug, primerTitulo } from '@/lib/guias-api'
import { getGuideBySlug } from '@/lib/guides'
import { getMovieDetails, getTVDetails } from '@/lib/tmdb'

/**
 * La portada de una guía, para la app (el `hero` de `/api/guias`).
 *
 * Existe porque los archivos de `public/guias/` no le llegan a la app: el
 * firewall de Vercel tiene "Bot Protection" en Challenge, que deja pasar `/api/`
 * pero a cualquier archivo le contesta 429 con la página de verificación, y el
 * `Image` de React Native no la puede resolver. Las guías salían sólo con el
 * título. Por acá la misma imagen pasa sin cambiar el firewall.
 *
 * Si la guía no tiene portada, o no se puede leer, manda la imagen horizontal
 * (backdrop) de su primer título, así siempre hay una.
 *
 * La CDN la guarda una semana: la URL lleva `?v=` con la fecha de edición de
 * la guía, así que una portada nueva cambia la URL.
 */
const CACHE = { 'Cache-Control': 'public, max-age=86400', 'Vercel-CDN-Cache-Control': 'max-age=604800' }

const TIPOS: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!isKnownSlug(slug)) return new Response('No encontrada', { status: 404 })

  const hero = getGuideBySlug(slug)?.heroImage
  if (hero && !hero.startsWith('http')) {
    try {
      const archivo = await readFile(join(process.cwd(), 'public', hero))
      const tipo = TIPOS[hero.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/jpeg'
      return new Response(new Uint8Array(archivo), { headers: { 'Content-Type': tipo, ...CACHE } })
    } catch (err) {
      console.error('[api/guias/portada]', slug, err)
    }
  }

  const primero = primerTitulo(slug)
  if (primero) {
    try {
      const d = primero.mediaType === 'tv' ? await getTVDetails(primero.id) : await getMovieDetails(primero.id)
      const path: string | null = d.backdrop_path ?? d.poster_path ?? null
      if (path) {
        const res = await fetch(`https://image.tmdb.org/t/p/w1280${path}`, { signal: AbortSignal.timeout(5000) })
        if (res.ok) {
          return new Response(new Uint8Array(await res.arrayBuffer()), {
            headers: { 'Content-Type': res.headers.get('content-type') ?? 'image/jpeg', ...CACHE },
          })
        }
      }
    } catch (err) {
      console.error('[api/guias/portada] TMDB', slug, err)
    }
  }

  return new Response('Sin portada', { status: 404 })
}
