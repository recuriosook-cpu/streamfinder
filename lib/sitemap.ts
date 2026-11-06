import { getAllGuides } from '@/lib/guides'
import { ALL_PLATFORMS } from '@/lib/providers'
import { GENRE_NAMES } from '@/app/generos/[id]/genre-constants'

/**
 * Los sitemaps de glynbox.com. `/sitemap.xml` es un índice con tres:
 *
 *   · páginas    — las fijas, guías, géneros, plataformas, listas públicas,
 *                  reseñas con texto y perfiles con reseñas.
 *   · actividad  — las fichas con algo propio de Glynbox: reseñas,
 *                  recomendaciones de creadores o 3 notas o más. Es lo que
 *                  otros sitios no tienen.
 *   · populares  — lo más popular de TMDB que está en streaming en Argentina
 *                  (suscripción, gratis o con publicidad): lo que la gente
 *                  busca con "dónde ver".
 *
 * Antes era uno solo con 160 fichas (las "populares" mundiales de TMDB, que
 * cambian todos los días) y 1.000 perfiles y reseñas sin canonical propia.
 *
 * Son rutas dinámicas con cache de 24 h en la CDN (`respuestaXml`), no ISR:
 * ver la nota de `app/movie/[id]/page.tsx` sobre lo que costaron las
 * escrituras de ISR. Los pedidos van sin Data Cache por lo mismo.
 *
 * `lastmod` sólo donde hay una fecha cierta (última reseña o nota, la guía, la
 * lista). En las populares de TMDB no hay: poner la de hoy en todas haría que
 * Google deje de creerle al `lastmod` del sitio entero.
 */

export const BASE = 'https://www.glynbox.com'

export interface Entrada { url: string; lastmod?: string | Date }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

// ── XML ──────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fecha = (d: string | Date) => new Date(d).toISOString()

export function urlset(entradas: Entrada[]): string {
  const filas = entradas.map(e =>
    `<url><loc>${esc(e.url)}</loc>${e.lastmod ? `<lastmod>${fecha(e.lastmod)}</lastmod>` : ''}</url>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${filas.join('\n')}\n</urlset>\n`
}

export function indice(sitemaps: string[]): string {
  const filas = sitemaps.map(s => `<sitemap><loc>${esc(s)}</loc></sitemap>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${filas.join('\n')}\n</sitemapindex>\n`
}

/** 24 h en la CDN de Vercel y 1 h en el navegador o el rastreador. */
export function respuestaXml(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Vercel-CDN-Cache-Control': 'max-age=86400',
    },
  })
}

// ── Pedidos ──────────────────────────────────────────────────────────────────

/**
 * Una tabla de Supabase entera, de a 1000 filas (el máximo de PostgREST).
 *
 * Pagina por `id` (`id=gt.<último>`) y no con `offset`: con offset la base
 * vuelve a recorrer todo lo anterior en cada página, y `ratings` (60.000
 * filas) tardaba 52 s. `select` tiene que incluir `id`.
 */
async function supabaseTodo<T extends { id: string }>(tabla: string, query: string, tramo = ''): Promise<T[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return []
  const filas: T[] = []
  for (let ultimo: string | null = null; ;) {
    const desde = ultimo ? `&id=gt.${ultimo}` : ''
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?${query}${tramo}${desde}&order=id&limit=1000`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Supabase ${tabla}: ${res.status}`)
    const lote = (await res.json()) as T[]
    filas.push(...lote)
    if (lote.length < 1000) return filas
    ultimo = lote[lote.length - 1].id
  }
}

/**
 * Una tabla grande con id UUID, en 16 tramos en paralelo (por el primer
 * dígito del id; un UUID se ordena igual que su texto). Seguidas, las ~60
 * páginas de `ratings` tardaban 27 s.
 */
async function supabaseTodoEnParalelo<T extends { id: string }>(tabla: string, query: string): Promise<T[]> {
  const hex = '0123456789abcdef'
  const tope = (d: string) => `${d}0000000-0000-0000-0000-000000000000`
  const tramos = [...hex].map((d, i) => `&id=gte.${tope(d)}${i < 15 ? `&id=lt.${tope(hex[i + 1])}` : ''}`)
  // Los dos filtros de `id` del tramo se combinan con AND en PostgREST; el de
  // la paginación (`id=gt.`) se suma a esos.
  return (await Promise.all(tramos.map(t => supabaseTodo<T>(tabla, query, t)))).flat()
}

/** `fn` sobre cada elemento, de a `n` a la vez. */
async function enTandas<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = []
  for (let i = 0; i < xs.length; i += n) salida.push(...(await Promise.all(xs.slice(i, i + n).map(fn))))
  return salida
}

const masReciente = (a: string | undefined, b: string | null | undefined) => (!a || (b && b > a) ? (b ?? a) : a)

// ── Páginas ──────────────────────────────────────────────────────────────────

const FIJAS = ['', '/que-ver', '/comunidad', '/listas', '/guias', '/sobre', '/contacto', '/descargar', '/privacidad', '/terminos', '/soporte', '/anunciantes', '/eliminar-cuenta', '/en/privacy', '/en/terms', '/en/support', '/en/delete-account']

/** Una reseña corta ("Excelente") no justifica una página en Google; la ficha ya la muestra. */
const MIN_CARACTERES_RESENA = 120
/** Perfiles con al menos estas reseñas: los demás son casi vacíos. */
const MIN_RESENAS_PERFIL = 3

export async function paginas(): Promise<Entrada[]> {
  const entradas: Entrada[] = FIJAS.map(r => ({ url: `${BASE}${r}` }))

  try {
    for (const g of getAllGuides()) entradas.push({ url: `${BASE}/guias/${g.slug}`, lastmod: g.updatedAt })
  } catch { /* sin guías: sigue lo demás */ }

  for (const id of Object.keys(GENRE_NAMES)) entradas.push({ url: `${BASE}/generos/${id}` })
  for (const p of ALL_PLATFORMS) entradas.push({ url: `${BASE}/platform/${p.slug}` })

  const [listas, resenas] = await Promise.all([
    supabaseTodo<{ id: string; updated_at: string | null }>('lists', 'select=id,updated_at&is_public=eq.true').catch(() => []),
    supabaseTodo<{ id: string; user_id: string; body: string | null; updated_at: string | null; created_at: string }>(
      'reviews', 'select=id,user_id,body,updated_at,created_at').catch(() => []),
  ])
  for (const l of listas) entradas.push({ url: `${BASE}/listas/${l.id}`, lastmod: l.updated_at ?? undefined })
  for (const r of resenas) {
    if ((r.body?.trim().length ?? 0) >= MIN_CARACTERES_RESENA) entradas.push({ url: `${BASE}/review/${r.id}`, lastmod: r.updated_at ?? r.created_at })
  }

  // Perfiles: los que tienen reseñas suficientes y no ocultan su actividad.
  const porUsuario = new Map<string, { n: number; ultima: string | undefined }>()
  for (const r of resenas) {
    const u = porUsuario.get(r.user_id) ?? { n: 0, ultima: undefined }
    porUsuario.set(r.user_id, { n: u.n + 1, ultima: masReciente(u.ultima, r.updated_at ?? r.created_at) })
  }
  const ids = [...porUsuario].filter(([, u]) => u.n >= MIN_RESENAS_PERFIL).map(([id]) => id)
  if (ids.length) {
    const perfiles = await enTandas(
      Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100)), 3,
      lote => supabaseTodo<{ id: string; username: string | null; hide_activity: boolean | null }>(
        'profiles', `select=id,username,hide_activity&id=in.(${lote.join(',')})`).catch(() => []),
    )
    for (const p of perfiles.flat()) {
      if (p.username && !p.hide_activity) entradas.push({ url: `${BASE}/usuario/${encodeURIComponent(p.username)}`, lastmod: porUsuario.get(p.id)?.ultima })
    }
  }
  return entradas
}

// ── Fichas con actividad ─────────────────────────────────────────────────────

/** Con menos notas que esto, y sin reseñas ni recomendaciones, no entra. */
const MIN_NOTAS = 3

export async function fichasConActividad(): Promise<Entrada[]> {
  const [resenas, recomendaciones, notas] = await Promise.all([
    supabaseTodo<{ id: string; media_id: number; media_type: string; updated_at: string | null; created_at: string }>(
      'reviews', 'select=id,media_id,media_type,updated_at,created_at'),
    supabaseTodo<{ id: string; tmdb_id: number; media_type: string; created_at: string }>(
      'creator_recommendations', 'select=id,tmdb_id,media_type,created_at'),
    supabaseTodoEnParalelo<{ id: string; media_id: number; media_type: string; rated_at: string | null }>(
      'ratings', 'select=id,media_id,media_type,rated_at'),
  ])

  const fichas = new Map<string, { entra: boolean; notas: number; lastmod: string | undefined }>()
  const tocar = (tipo: string, id: number, fechaCambio: string | null | undefined, entra: boolean) => {
    if (tipo !== 'movie' && tipo !== 'tv') return
    const k = `${tipo}/${id}`
    const f = fichas.get(k) ?? { entra: false, notas: 0, lastmod: undefined }
    fichas.set(k, { entra: f.entra || entra, notas: f.notas + (entra ? 0 : 1), lastmod: masReciente(f.lastmod, fechaCambio) })
  }
  for (const r of resenas) tocar(r.media_type, r.media_id, r.updated_at ?? r.created_at, true)
  for (const r of recomendaciones) tocar(r.media_type, r.tmdb_id, r.created_at, true)
  for (const n of notas) tocar(n.media_type, n.media_id, n.rated_at, false)

  return [...fichas]
    .filter(([, f]) => f.entra || f.notas >= MIN_NOTAS)
    .map(([k, f]) => ({ url: `${BASE}/${k}`, lastmod: f.lastmod }))
}

// ── Populares en streaming en Argentina ─────────────────────────────────────

/** Páginas de 20 de `/discover`: 5.000 películas y 2.000 series. TMDB corta en la 500. */
const PAGINAS = { movie: 250, tv: 100 } as const

export async function fichasPopulares(): Promise<Entrada[]> {
  if (!TMDB_KEY) return []
  const vistos = new Set<string>()
  const entradas: Entrada[] = []
  for (const tipo of ['movie', 'tv'] as const) {
    const paginas = Array.from({ length: PAGINAS[tipo] }, (_, i) => i + 1)
    const resultados = await enTandas(paginas, 10, async pagina => {
      const url = `https://api.themoviedb.org/3/discover/${tipo}?api_key=${TMDB_KEY}&language=es-AR`
        + `&watch_region=AR&with_watch_monetization_types=flatrate|free|ads&sort_by=popularity.desc&page=${pagina}`
      try {
        const res = await fetch(url, { cache: 'no-store' })
        return res.ok ? ((await res.json()).results as { id: number; overview?: string }[]) : []
      } catch { return [] }
    })
    for (const t of resultados.flat()) {
      const k = `${tipo}/${t.id}`
      // Sin sinopsis en castellano: probablemente quede como ficha "delgada"; no se ofrece.
      if (vistos.has(k) || !t.overview?.trim()) continue
      vistos.add(k)
      entradas.push({ url: `${BASE}/${k}` })
    }
  }
  return entradas
}
