/**
 * El navegador de adentro de una app (TikTok, Instagram, Facebook), o `null`.
 *
 * Importa en el registro: Google no deja iniciar sesión desde estos
 * navegadores. Muestra "Error 403: disallowed_useragent" y la persona queda
 * varada en una pantalla de Google, sin forma de volver. Es por donde entra la
 * mayoría de la gente que viene de los videos, así que `/auth` los detecta
 * para avisar antes de que toquen el botón y ofrecer abrir el sitio en el
 * navegador del teléfono.
 *
 * Los textos a buscar son los de `NAVEGADORES_REALES` en
 * `lib/analytics-bots.ts`. `; wv)` es el webview de Android de cualquier otra
 * app: Google también lo bloquea.
 */
export type NavegadorEmbebido = 'tiktok' | 'instagram' | 'facebook' | 'otro'

export function navegadorEmbebido(userAgent: string | null | undefined): NavegadorEmbebido | null {
  if (typeof userAgent !== 'string') return null
  const ua = userAgent.toLowerCase()
  if (ua.includes('musical_ly') || ua.includes('bytedancewebview') || ua.includes('tiktok')) return 'tiktok'
  if (ua.includes('instagram')) return 'instagram'
  if (ua.includes('fban') || ua.includes('fbav') || ua.includes('fb_iab')) return 'facebook'
  if (ua.includes('line/') || ua.includes('kakaotalk') || ua.includes('; wv)')) return 'otro'
  return null
}

/** El nombre para mostrar, o `null` si es uno sin nombre conocido. */
export function nombreDeApp(navegador: NavegadorEmbebido): string | null {
  if (navegador === 'tiktok') return 'TikTok'
  if (navegador === 'instagram') return 'Instagram'
  if (navegador === 'facebook') return 'Facebook'
  return null
}

/**
 * Link que abre esta misma página en Chrome, en Android.
 *
 * Es un `intent://`: el webview se lo pasa al sistema, que abre Chrome con la
 * URL. En iPhone no hay equivalente; ahí sólo queda explicar el menú.
 */
export function abrirEnChromeUrl(href: string): string | null {
  try {
    const url = new URL(href)
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;end`
  } catch {
    return null
  }
}
