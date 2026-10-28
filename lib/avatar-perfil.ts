/**
 * Fotos de perfil en Storage (bucket `avatars`), achicadas y con caché de un año.
 *
 * ── Por qué ───────────────────────────────────────────────────────────────
 *
 * La web y la app subían la foto tal como salía del teléfono (PNG o JPEG de
 * hasta 2,7 MB; 490 KB de promedio el 2026-10-28) con el `max-age=3600` que
 * Storage pone por defecto, y la mostraban a 28–96 px en el feed, los
 * comentarios y el perfil. Cada vista bajaba el original entero: era casi todo
 * el "Cached Egress" de Supabase, que en el plan Free es de 5 GB por mes y se
 * fue a 12,2.
 *
 * Ahora la foto queda en WebP de 256×256 (el avatar más grande es el del
 * perfil de la app, 88 pt: 264 px en pantallas 3x), de ~10–20 KB, con caché
 * de un año y el hash del contenido en el nombre, igual que las portadas de
 * `lib/recommendation-images.ts`: una foto nueva es otro archivo, así que nada
 * se pisa y el navegador y la app no la vuelven a pedir.
 *
 * ── Quién lo usa ──────────────────────────────────────────────────────────
 *
 * - `POST /api/perfil/avatar`: la web y la app suben el original a Storage
 *   como siempre (sin el límite de 4,5 MB del cuerpo de una función de
 *   Vercel) y después piden esto con la ruta; acá se achica, se guarda en el
 *   perfil y se borra el original.
 * - `/api/cron/avatares`, una vez por día: lo mismo para lo que suben las
 *   versiones de la app anteriores a ese cambio, y borra los archivos a los
 *   que ya no apunta ningún perfil.
 */

import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'

export const BUCKET_AVATARES = 'avatars'

const LADO        = 256
const CALIDAD     = 80
const UN_ANO      = String(365 * 24 * 60 * 60)
/** Un archivo sin perfil que lo use se borra recién pasado esto: puede ser una
 *  subida a medio guardar, o la foto vieja que todavía sale en una página
 *  cacheada. */
const GRACIA_MS   = 2 * 24 * 60 * 60 * 1000
const PREFIJO_URL = `/storage/v1/object/public/${BUCKET_AVATARES}/`

/** `<usuario>/<hash>.webp`: lo que deja este módulo. */
export function esAvatarOptimizado(ruta: string): boolean {
  return /^[0-9a-f-]{36}\/[0-9a-f]{10}\.webp$/.test(ruta)
}

/** La ruta dentro del bucket de una URL pública de `avatars`, o `null` si la
 *  foto es de otro lado (Google, por ejemplo). */
export function rutaDeAvatar(url: string | null | undefined): string | null {
  if (!url) return null
  const i = url.indexOf(PREFIJO_URL)
  if (i < 0) return null
  return decodeURIComponent(url.slice(i + PREFIJO_URL.length).split('?')[0])
}

/**
 * Achica el archivo `ruta` del bucket, lo sube como `<usuario>/<hash>.webp`,
 * deja la URL nueva en el perfil y borra el original. Devuelve la URL nueva.
 *
 * Sólo toca archivos de la carpeta del propio usuario: la ruta la manda el
 * cliente, y si no se chequeara se podría poner la foto de otro.
 */
export async function optimizarAvatar(db: SupabaseClient, userId: string, ruta: string): Promise<string> {
  if (!ruta.startsWith(`${userId}/`) || ruta.includes('..')) throw new Error('ruta ajena')

  const url = (r: string) => db.storage.from(BUCKET_AVATARES).getPublicUrl(r).data.publicUrl
  if (esAvatarOptimizado(ruta)) {
    await guardarEnPerfil(db, userId, url(ruta))
    return url(ruta)
  }

  const { data, error } = await db.storage.from(BUCKET_AVATARES).download(ruta)
  if (error || !data) throw new Error(`Storage: ${error?.message ?? 'sin datos'}`)

  const webp = await sharp(Buffer.from(await data.arrayBuffer()))
    .rotate() // respeta la orientación EXIF de las fotos del teléfono
    .resize(LADO, LADO, { fit: 'cover', withoutEnlargement: true })
    .webp({ quality: CALIDAD })
    .toBuffer()
  const nueva = `${userId}/${createHash('sha256').update(webp).digest('hex').slice(0, 10)}.webp`

  const subida = await db.storage.from(BUCKET_AVATARES).upload(nueva, webp, {
    contentType: 'image/webp',
    cacheControl: UN_ANO,
    upsert: true,
  })
  if (subida.error) throw new Error(`Storage: ${subida.error.message}`)

  await guardarEnPerfil(db, userId, url(nueva))
  // El original no lo usa nadie más: era la subida de recién o la foto
  // anterior del mismo perfil. Si falla, lo levanta el cron.
  await db.storage.from(BUCKET_AVATARES).remove([ruta])
  return url(nueva)
}

async function guardarEnPerfil(db: SupabaseClient, userId: string, avatarUrl: string) {
  const { error } = await db.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId)
  if (error) throw new Error(`profiles: ${error.message}`)
}

type Resumen = { optimizados: number; fallidos: string[]; borrados: number }

/**
 * Pasa al formato nuevo las fotos de perfil que todavía no lo tienen y borra
 * los archivos del bucket que ningún perfil usa desde hace más de dos días.
 */
export async function optimizarAvataresPendientes(db: SupabaseClient): Promise<Resumen> {
  const resumen: Resumen = { optimizados: 0, fallidos: [], borrados: 0 }

  const { data: perfiles, error } = await db
    .from('profiles')
    .select('id, avatar_url')
    .like('avatar_url', `%${PREFIJO_URL}%`)
  if (error) throw new Error(`profiles: ${error.message}`)

  const enUso = new Set<string>()
  for (const p of perfiles ?? []) {
    const ruta = rutaDeAvatar(p.avatar_url)
    if (!ruta) continue
    if (esAvatarOptimizado(ruta)) { enUso.add(ruta); continue }
    try {
      enUso.add(rutaDeAvatar(await optimizarAvatar(db, p.id, ruta))!)
      resumen.optimizados++
    } catch (err) {
      enUso.add(ruta)
      resumen.fallidos.push(`${p.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Si la lista de perfiles vino vacía por algún error raro, mejor no borrar nada.
  if (enUso.size === 0) return resumen

  const viejos: string[] = []
  const limite = Date.now() - GRACIA_MS
  const listar = (prefijo: string) =>
    db.storage.from(BUCKET_AVATARES).list(prefijo, { limit: 1000 })

  const { data: raiz, error: errRaiz } = await listar('')
  if (errRaiz) throw new Error(`Storage: ${errRaiz.message}`)
  for (const item of raiz ?? []) {
    // Sin `id` es una carpeta (la de un usuario); con `id`, un archivo suelto.
    const archivos = item.id ? [{ ...item, name: '' }] : (await listar(item.name)).data ?? []
    for (const a of archivos) {
      const ruta = a.name ? `${item.name}/${a.name}` : item.name
      const fecha = Date.parse(a.updated_at ?? a.created_at ?? '')
      if (!enUso.has(ruta) && Number.isFinite(fecha) && fecha < limite) viejos.push(ruta)
    }
  }
  for (let i = 0; i < viejos.length; i += 100) {
    const { error: errBorrar } = await db.storage.from(BUCKET_AVATARES).remove(viejos.slice(i, i + 100))
    if (!errBorrar) resumen.borrados += Math.min(100, viejos.length - i)
  }
  return resumen
}
