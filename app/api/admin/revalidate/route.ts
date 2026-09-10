import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

/**
 * POST /api/admin/revalidate
 *
 * Invalida el cache de las fichas de catálogo sin necesidad de un deploy.
 *
 * Existe porque desde que las fichas se cachean con ISR de una hora
 * (`export const revalidate = 3600` en `/movie/[id]` y compañía), un dato que
 * cambió en TMDB puede tardar hasta una hora en verse. El 99% de las veces
 * esperar está bien. Este endpoint es para el 1%: un póster equivocado, un
 * título mal escrito, un proveedor de streaming que se cayó del catálogo y
 * alguien reportó.
 *
 * ── Cómo se usa ────────────────────────────────────────────────────────────
 *
 *   // una ficha puntual
 *   POST /api/admin/revalidate  { "path": "/movie/278" }
 *
 *   // TODAS las películas de una
 *   POST /api/admin/revalidate  { "path": "/movie/[id]", "type": "page" }
 *
 * Invalidar un patrón entero no dispara miles de regeneraciones de golpe: la
 * doc de Next 16 aclara que desde un Route Handler `revalidatePath` sólo
 * *marca* la ruta, y la regeneración ocurre en la próxima visita de cada una.
 * O sea que el costo se reparte solo, a medida que llega tráfico.
 */

export const runtime = 'nodejs'

/**
 * Las rutas que este endpoint acepta invalidar.
 *
 * Es una lista blanca y no un `path` libre a propósito. `revalidatePath` acepta
 * cualquier string, y un valor mal escrito no falla: no hace nada y contesta
 * que salió bien. Con la lista, un typo devuelve 400 y se ve.
 *
 * Están las cinco fichas cacheadas más las dos rutas con parámetro que ya se
 * cacheaban desde antes (`/platform/[slug]` y `/guias/[slug]`), que sufren
 * exactamente el mismo problema.
 */
const ALLOWED_PATTERNS = [
  '/movie/[id]',
  '/tv/[id]',
  '/actor/[id]',
  '/director/[id]',
  '/generos/[id]',
  '/platform/[slug]',
  '/guias/[slug]',
] as const

/** Prefijos válidos para invalidar una ficha suelta, ej. `/movie/278`. */
const ALLOWED_PREFIXES = ['/movie/', '/tv/', '/actor/', '/director/', '/generos/', '/platform/', '/guias/']

/**
 * Mismo criterio de admin que `/api/admin/overview` y `app/admin/layout.tsx`:
 * el username del perfil.
 *
 * Se copia en vez de importarse porque `requireAdmin` de overview no está
 * exportada. Sí, el username hardcodeado es la misma deuda anotada allá; lo que
 * no se hace acá es inventar un criterio nuevo, que es como
 * `/api/admin/ban-user` terminó chequeando por email y quedó desalineado.
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

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as
    | { path?: unknown; type?: unknown }
    | null

  const path = typeof body?.path === 'string' ? body.path.trim() : ''
  if (!path) {
    return NextResponse.json({ error: 'falta "path"' }, { status: 400 })
  }

  const isPattern = (ALLOWED_PATTERNS as readonly string[]).includes(path)
  const isConcrete =
    !path.includes('[') && ALLOWED_PREFIXES.some((p) => path.startsWith(p)) && path.length > 8

  if (!isPattern && !isConcrete) {
    return NextResponse.json(
      { error: 'path no permitido', allowed: ALLOWED_PATTERNS, prefixes: ALLOWED_PREFIXES },
      { status: 400 }
    )
  }

  // `type` es obligatorio cuando el path lleva un segmento dinámico, y no se
  // acepta cuando es una ruta concreta. Lo pide así la API de Next.
  if (isPattern) {
    revalidatePath(path, 'page')
  } else {
    revalidatePath(path)
  }

  console.log(`[revalidate] ${admin.id} invalidó ${path}${isPattern ? ' (patrón)' : ''}`)

  return NextResponse.json({
    ok: true,
    path,
    scope: isPattern ? 'todas las de ese tipo' : 'una sola',
    // Se dice explícito para que no se confunda con "ya está regenerado".
    note: isPattern
      ? 'Marcadas para regenerar. Cada una se regenera en su próxima visita.'
      : 'Marcada para regenerar en la próxima visita.',
  })
}
