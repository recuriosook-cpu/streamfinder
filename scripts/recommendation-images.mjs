/**
 * Cómo se guardan en Storage las imágenes de las recomendaciones de creadores
 * (portadas y avatares). Lo usan `import-recommendations.mjs` y
 * `optimize-recommendation-covers.mjs`, para que las dos cosas guarden igual.
 *
 * ── Tamaño y formato ──────────────────────────────────────────────────────
 *
 * WebP de 450 px de ancho. La portada se muestra a 176 px en la web (352 en
 * pantallas 2x) y a 150 pt en la app (450 px en pantallas 3x); más que eso se
 * descarga y no se ve. Medido sobre las 162 portadas el 2026-09-23: la mediana
 * pasa de ~45 KB (JPEG de 640×1136 tal como lo da Instagram) a 25 KB.
 *
 * ── Caché de un año, y por qué el nombre lleva un hash ────────────────────
 *
 * Con el `max-age=3600` que Storage pone por defecto, Cloudflare vuelve a pedir
 * cada imagen al origen de Storage una vez por hora, y el origen es lo que
 * devolvió `429 too_many_connections` en una ráfaga de descargas. Con un año,
 * el origen casi no se toca.
 *
 * El precio de cachear un año es que un archivo no se puede reemplazar en el
 * mismo nombre: Cloudflare y los navegadores seguirían mostrando el viejo. Por
 * eso el nombre lleva los primeros 10 caracteres del SHA-256 del contenido.
 * Una portada nueva es un archivo nuevo con otro nombre, y la fila de la base
 * apunta al nuevo. Nada se pisa nunca.
 */

import { createHash } from 'node:crypto'
import sharp from 'sharp'

export const BUCKET = 'recommendations'

const ANCHO_PORTADA = 450
const ANCHO_AVATAR  = 96
const CALIDAD_WEBP  = 75
const UN_ANO        = String(365 * 24 * 60 * 60)

/** Achica a `ancho` (sin agrandar nunca) y pasa a WebP. */
async function aWebp(buf, ancho) {
  return sharp(buf)
    .resize({ width: ancho, withoutEnlargement: true })
    .webp({ quality: CALIDAD_WEBP })
    .toBuffer()
}

function hash(buf) {
  return createHash('sha256').update(buf).digest('hex').slice(0, 10)
}

/**
 * Procesa y sube una imagen. Devuelve `{ ruta, bytes }`: la ruta dentro del
 * bucket, que es lo que se guarda en la base, y lo que pesa lo subido.
 *
 * `upsert: true` no pisa nada distinto: si la ruta ya existe es porque el
 * contenido es idéntico (el nombre sale del hash), así que re-subir es gratis.
 */
async function subir(db, carpeta, nombre, original, ancho) {
  const webp = await aWebp(original, ancho)
  const ruta = `${carpeta}/${nombre}-${hash(webp)}.webp`

  const { error } = await db.storage.from(BUCKET).upload(ruta, webp, {
    contentType: 'image/webp',
    cacheControl: UN_ANO,
    upsert: true,
  })
  if (error) throw new Error(`Storage: ${error.message}`)

  return { ruta, bytes: webp.length }
}

/** `covers/<código>-<hash>.webp` */
export function subirPortada(db, codigo, original) {
  return subir(db, 'covers', codigo, original, ANCHO_PORTADA)
}

/** `avatars/<usuario>-<hash>.webp` */
export function subirAvatar(db, usuario, original) {
  return subir(db, 'avatars', usuario, original, ANCHO_AVATAR)
}

/** ¿Esta ruta ya está en el formato de este módulo? */
export function esRutaOptimizada(ruta) {
  return /-[0-9a-f]{10}\.webp$/.test(ruta ?? '')
}
