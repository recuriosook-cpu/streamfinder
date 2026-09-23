/**
 * Pasa las portadas y avatares ya cargados al formato de
 * `recommendation-images.mjs`: WebP de 450 px, con hash en el nombre y caché de
 * un año. Las imágenes salen del mismo Storage; a Instagram no se le pide nada.
 *
 * Uso:
 *   node --env-file=.env.local scripts/optimize-recommendation-covers.mjs
 *   node --env-file=.env.local scripts/optimize-recommendation-covers.mjs --borrar-viejas
 *
 * Se puede volver a correr: las filas que ya apuntan a un archivo optimizado se
 * saltean.
 *
 * ── Los archivos viejos no se borran solos ────────────────────────────────
 *
 * Las fichas quedan cacheadas una hora en el CDN con el HTML que apunta a la
 * ruta vieja, así que borrar el .jpg en el momento de migrar deja portadas
 * rotas durante esa hora. `--borrar-viejas` borra los archivos de `covers/` y
 * `avatars/` a los que ya no apunta ninguna fila. Correrlo pasada al menos una
 * hora desde la migración, y con la versión nueva de la app ya publicada si
 * alguien pudiera tener una ficha abierta.
 */

import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { BUCKET, subirPortada, subirAvatar, esRutaOptimizada } from './recommendation-images.mjs'

const PAUSA_MS = 300
const REINTENTOS = 3

const { values: args } = parseArgs({
  options: { 'borrar-viejas': { type: 'boolean', default: false } },
})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('\n❌  Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE. ¿Corriste con --env-file=.env.local?\n')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const pausa = ms => new Promise(r => setTimeout(r, ms))

/**
 * Baja un archivo del bucket, con reintentos. El origen de Storage devolvió
 * `429 too_many_connections` en ráfagas; esperar un poco alcanza.
 */
async function bajar(ruta) {
  for (let intento = 1; ; intento++) {
    const { data, error } = await db.storage.from(BUCKET).download(ruta)
    if (!error) return Buffer.from(await data.arrayBuffer())
    if (intento >= REINTENTOS) throw new Error(`no se pudo bajar ${ruta}: ${error.message}`)
    await pausa(2000 * intento)
  }
}

/** Migra las filas de una tabla. `campo` es la columna con la ruta. */
async function migrar({ tabla, campo, clave, subir }) {
  const { data: filas, error } = await db.from(tabla).select(`id, ${campo}, ${clave}`)
  if (error) throw new Error(`${tabla}: ${error.message}`)

  const r = { migradas: 0, yaEstaban: 0, fallidas: [], antes: 0, despues: 0 }

  for (const fila of filas) {
    const ruta = fila[campo]
    if (!ruta || esRutaOptimizada(ruta)) { r.yaEstaban++; continue }

    try {
      const original = await bajar(ruta)
      const nueva = await subir(db, fila[clave], original)

      const { error: errUpdate } = await db.from(tabla).update({ [campo]: nueva.ruta }).eq('id', fila.id)
      if (errUpdate) throw new Error(errUpdate.message)

      r.migradas++
      r.antes += original.length
      r.despues += nueva.bytes
      console.log(`  ✓ ${ruta} → ${nueva.ruta}  (${kb(original.length)} → ${kb(nueva.bytes)})`)
    } catch (e) {
      r.fallidas.push(`${ruta}: ${e.message}`)
      console.log(`  ✗ ${ruta}: ${e.message}`)
    }
    await pausa(PAUSA_MS)
  }

  return r
}

const kb = n => `${(n / 1024).toFixed(1)} KB`

/** Todos los archivos de una carpeta del bucket, paginando. */
async function listar(carpeta) {
  const archivos = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list(carpeta, { limit: 1000, offset })
    if (error) throw new Error(`list ${carpeta}: ${error.message}`)
    archivos.push(...data.filter(a => a.id).map(a => `${carpeta}/${a.name}`))
    if (data.length < 1000) return archivos
  }
}

async function borrarViejas() {
  const [{ data: recs, error: e1 }, { data: creadores, error: e2 }] = await Promise.all([
    db.from('creator_recommendations').select('cover_path'),
    db.from('creators').select('avatar_path'),
  ])
  if (e1 || e2) throw new Error((e1 ?? e2).message)

  const enUso = new Set([...recs.map(r => r.cover_path), ...creadores.map(c => c.avatar_path)])
  const huerfanos = [...await listar('covers'), ...await listar('avatars')].filter(a => !enUso.has(a))

  console.log(`\n${huerfanos.length} archivos sin ninguna fila que los use.`)
  for (let i = 0; i < huerfanos.length; i += 100) {
    const { error } = await db.storage.from(BUCKET).remove(huerfanos.slice(i, i + 100))
    if (error) throw new Error(`remove: ${error.message}`)
  }
  console.log(`Borrados: ${huerfanos.length}\n`)
}

async function main() {
  if (args['borrar-viejas']) return borrarViejas()

  console.log('\nPortadas:')
  const p = await migrar({
    tabla: 'creator_recommendations', campo: 'cover_path', clave: 'instagram_code', subir: subirPortada,
  })
  console.log('\nAvatares:')
  const a = await migrar({
    tabla: 'creators', campo: 'avatar_path', clave: 'instagram_username', subir: subirAvatar,
  })

  console.log('\n── Resultado ─────────────────────────────')
  for (const [nombre, r] of [['Portadas', p], ['Avatares', a]]) {
    console.log(`${nombre}: ${r.migradas} migradas, ${r.yaEstaban} ya estaban, ${r.fallidas.length} fallidas` +
      (r.migradas ? `  |  ${kb(r.antes)} → ${kb(r.despues)} (${Math.round(100 - r.despues / r.antes * 100)}% menos)` : ''))
    for (const f of r.fallidas) console.log(`  - ${f}`)
  }
  console.log('\nLos archivos viejos siguen en el bucket. Pasada una hora: --borrar-viejas\n')

  if (p.fallidas.length || a.fallidas.length) process.exitCode = 1
}

main().catch(e => {
  console.error(`\n❌  ${e.message}\n`)
  process.exit(1)
})
