/**
 * De dónde salen las portadas y avatares de las recomendaciones de creadores,
 * y cómo se leen los links que se cargan. Lo usan el panel
 * `/admin/recomendaciones` y `scripts/import-recommendations.mjs`, para que
 * los dos decidan igual qué portada bajar y cuándo un post no es insertable.
 *
 * Igual que `recommendation-images.ts`, los scripts lo importan tal cual con
 * Node: TypeScript "borrable" nomás.
 *
 * ── De dónde sale la portada ───────────────────────────────────────────────
 *
 * Probado contra los posts reales el 2026-09-23, sin credenciales:
 *
 *   1. `instagram.com/p/<código>/media/?size=l` redirige a la portada limpia,
 *      en 640×1136. Anda para casi todos los posts.
 *   2. Si ese da error, `og:image` de la página del post pedida como el bot de
 *      Facebook. Anda para todos, pero en los reels trae un botón de play
 *      pegado en la imagen y sale más chica (361×640).
 *
 * Que no haya portada limpia es además la señal de que el post tiene la
 * inserción deshabilitada: los 3 de 162 que caen en el paso 2 son los mismos 3
 * cuyo reproductor embebido muestra el cartel de error. Por eso esas filas se
 * guardan con `embeddable = false` y la web los manda directo a Instagram.
 * El reproductor no se puede consultar sin un navegador —el HTML de `/embed/`
 * es igual para los dos casos—, así que no hay una señal mejor.
 *
 * Las URLs que devuelve Instagram vencen a los pocos días; por eso se baja la
 * imagen y se guarda en el bucket, y nunca se guarda la URL de Instagram.
 *
 * ── Desde un servidor ─────────────────────────────────────────────────────
 *
 * Probado el 2026-09-24 desde una función de Vercel (región iad1): los dos
 * caminos y el perfil respondieron igual que desde una computadora. Si algún
 * día Instagram empieza a bloquear las IP de datacenter, el panel va a dar
 * "Instagram no devolvió la portada" y el script, corrido desde una
 * computadora, sigue siendo la salida.
 */

const UA_NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const UA_FACEBOOK  = 'facebookexternalhit/1.1'

/** Instagram a veces no contesta; sin tope, el panel quedaría colgado. */
const TIMEOUT_MS = 15_000

// ── Links ──────────────────────────────────────────────────────────────────

/**
 * El código de un link de Instagram (`/p/`, `/reel/`, `/reels/`, `/tv/`, con o
 * sin usuario adelante). `null` si no es un post.
 */
export function codigoDePost(link: string): string | null {
  const m = link.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/)
  return m ? m[1] : null
}

/** Tipo e id de TMDB de un link a una ficha de glynbox. `null` si no es una ficha. */
export function fichaDeLink(link: string): { mediaType: 'movie' | 'tv'; tmdbId: number } | null {
  const m = link.match(/glynbox\.com\/(movie|tv)\/(\d+)/)
  return m ? { mediaType: m[1] as 'movie' | 'tv', tmdbId: Number(m[2]) } : null
}

// ── Descargas ──────────────────────────────────────────────────────────────

function esJpeg(buf: Buffer): boolean {
  return buf.length > 1000 && buf[0] === 0xff && buf[1] === 0xd8
}

async function bajarImagen(url: string, userAgent: string): Promise<Buffer | null> {
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent },
    redirect: 'follow',
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  return esJpeg(buf) ? buf : null
}

/** `og:image` de una página de Instagram, pedida como el bot de Facebook. */
async function ogImage(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA_FACEBOOK },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) return null
  const html = await res.text()
  const m = html.match(/<meta property="og:image" content="([^"]+)"/)
  return m ? m[1].replaceAll('&amp;', '&') : null
}

/**
 * La portada de un post, o `null` si Instagram no la da por ningún camino.
 * `limpia: false` = salió del paso 2 y el post va con `embeddable = false`.
 */
export async function bajarPortada(codigo: string): Promise<{ buf: Buffer; limpia: boolean } | null> {
  const limpia = await bajarImagen(`https://www.instagram.com/p/${codigo}/media/?size=l`, UA_NAVEGADOR)
  if (limpia) return { buf: limpia, limpia: true }

  const og = await ogImage(`https://www.instagram.com/p/${codigo}/`)
  const conPlay = og && await bajarImagen(og, UA_NAVEGADOR)
  if (conPlay) return { buf: conPlay, limpia: false }

  return null
}

/** La foto de perfil de un usuario de Instagram, o `null`. */
export async function bajarAvatar(usuario: string): Promise<Buffer | null> {
  const og = await ogImage(`https://www.instagram.com/${usuario}/`)
  return og ? bajarImagen(og, UA_NAVEGADOR) : null
}
