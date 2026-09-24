/**
 * Carga las recomendaciones de un creador desde un CSV: baja la portada de cada
 * post de Instagram, la sube a Supabase Storage y guarda las filas.
 *
 * Requisitos: haber corrido `supabase-creator-recommendations.sql`, y tener
 * `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE` en `.env.local`.
 *
 * Uso:
 *   node --env-file=.env.local scripts/import-recommendations.mjs \
 *     --csv "Peliculas recomendada.csv" --usuario ferlageok --nombre "Fer Lage"
 *
 *   --forzar   vuelve a bajar portadas y avatar aunque ya estén cargados.
 *
 * El CSV tiene tres columnas, con encabezado: título, link del post de
 * Instagram, link de la ficha de glynbox. El título sólo se usa en el reporte;
 * el id y el tipo salen del link de la ficha.
 *
 * ── Se puede volver a correr ───────────────────────────────────────────────
 *
 * El creador se identifica por su usuario de Instagram y cada recomendación
 * por (creador, tipo, id de TMDB): las dos cosas van con upsert, así que correr
 * el script dos veces no duplica nada. Las filas que ya están cargadas con el
 * mismo post se saltean sin volver a pedirle nada a Instagram; `--forzar`
 * las rehace.
 *
 * ── De dónde sale la portada ───────────────────────────────────────────────
 *
 * Igual que en el panel `/admin/recomendaciones`: el método, y por qué un post
 * sin portada limpia se guarda con `embeddable = false`, están en
 * `lib/instagram-covers.ts`; cómo se guarda la imagen (tamaño, formato, caché),
 * en `lib/recommendation-images.ts`. El reporte final lista los posts que
 * salieron con la portada con botón de play, para reemplazarlas a mano si hace
 * falta.
 *
 * Para cargar de a uno está el panel; esto queda para cargas grandes desde un
 * CSV, o para cuando Instagram no le conteste al servidor.
 */

import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'
import { subirPortada, subirAvatar } from '../lib/recommendation-images.ts'
import { codigoDePost, fichaDeLink, bajarPortada, bajarAvatar } from '../lib/instagram-covers.ts'

/** Pausa entre posts. 162 seguidos sin pausa no cortaron, pero no cuesta nada. */
const PAUSA_MS = 300

// ── Argumentos y credenciales ──────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    csv:     { type: 'string' },
    usuario: { type: 'string' },
    nombre:  { type: 'string' },
    forzar:  { type: 'boolean', default: false },
  },
})

if (!args.csv || !args.usuario || !args.nombre) {
  console.error('\nUso: node --env-file=.env.local scripts/import-recommendations.mjs --csv <archivo> --usuario <instagram> --nombre "<nombre>" [--forzar]\n')
  process.exit(1)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('\n❌  Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE. ¿Corriste con --env-file=.env.local?\n')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const usuario = args.usuario.replace(/^@/, '').toLowerCase()

// ── CSV ────────────────────────────────────────────────────────────────────

/**
 * El CSV que exporta Excel en Windows viene en Windows-1252, no en UTF-8. Se
 * prueba UTF-8 estricto y, si no decodifica, se cae a 1252. Sin esto, "Corazón
 * valiente" sale "Coraz�n valiente" en el reporte.
 */
function leerTexto(ruta) {
  const bytes = readFileSync(ruta)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

/** CSV mínimo: comas, comillas dobles y "" como comilla escapada. */
function parsearCsv(texto) {
  const filas = []
  let fila = [], campo = '', entreComillas = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') entreComillas = false
      else campo += c
    } else if (c === '"') entreComillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo); campo = ''
      if (fila.some(f => f.trim())) filas.push(fila)
      fila = []
    } else campo += c
  }
  fila.push(campo)
  if (fila.some(f => f.trim())) filas.push(fila)

  return filas
}

/** Una fila del CSV, validada. Tira con un mensaje legible si algo no cierra. */
function interpretarFila([titulo = '', link = '', ficha = '']) {
  const codigo = codigoDePost(link)
  if (!codigo) throw new Error(`el link de Instagram no es un post: "${link}"`)

  const media = fichaDeLink(ficha)
  if (!media) throw new Error(`el link de glynbox no es una ficha: "${ficha}"`)

  return { titulo: titulo.trim(), codigo, ...media }
}

const pausa = ms => new Promise(r => setTimeout(r, ms))

// ── Creador ────────────────────────────────────────────────────────────────

async function prepararCreador() {
  const { data: existente, error } = await db
    .from('creators')
    .select('id, avatar_path')
    .eq('instagram_username', usuario)
    .maybeSingle()
  if (error) throw new Error(`creators: ${error.message}`)

  let avatarPath = existente?.avatar_path ?? null

  if (!avatarPath || args.forzar) {
    const buf = await bajarAvatar(usuario)
    if (buf) {
      avatarPath = (await subirAvatar(db, usuario, buf)).ruta
    } else {
      console.warn(`⚠️  No se pudo bajar el avatar de @${usuario}; se muestra la inicial.`)
    }
  }

  const { data, error: errUpsert } = await db
    .from('creators')
    .upsert(
      { name: args.nombre, instagram_username: usuario, avatar_path: avatarPath },
      { onConflict: 'instagram_username' },
    )
    .select('id')
    .single()
  if (errUpsert) throw new Error(`creators: ${errUpsert.message}`)

  return data.id
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const [, ...filas] = parsearCsv(leerTexto(args.csv))
  console.log(`\n${filas.length} filas en ${args.csv}\n`)

  const creadorId = await prepararCreador()
  console.log(`Creador: ${args.nombre} (@${usuario}), id ${creadorId}\n`)

  // Lo que ya está cargado, para no volver a pedirle a Instagram lo que ya se bajó.
  const { data: previas, error } = await db
    .from('creator_recommendations')
    .select('media_type, tmdb_id, instagram_code')
    .eq('creator_id', creadorId)
  if (error) throw new Error(`creator_recommendations: ${error.message}`)
  const cargadas = new Map(previas.map(p => [`${p.media_type}:${p.tmdb_id}`, p.instagram_code]))

  const nuevas = [], actualizadas = [], salteadas = [], conPlay = [], fallidas = []

  for (const [i, fila] of filas.entries()) {
    const n = `[${String(i + 1).padStart(3)}/${filas.length}]`
    let rec
    try {
      rec = interpretarFila(fila)
    } catch (e) {
      fallidas.push({ titulo: fila[0] || `fila ${i + 2}`, motivo: e.message })
      console.log(`${n} ✗ ${fila[0]}: ${e.message}`)
      continue
    }

    const clave = `${rec.mediaType}:${rec.tmdbId}`
    const codigoPrevio = cargadas.get(clave)

    if (codigoPrevio === rec.codigo && !args.forzar) {
      salteadas.push(rec)
      console.log(`${n} · ${rec.titulo} (ya estaba)`)
      continue
    }

    try {
      const portada = await bajarPortada(rec.codigo)
      if (!portada) throw new Error('Instagram no devolvió la portada')

      const coverPath = (await subirPortada(db, rec.codigo, portada.buf)).ruta

      const { error: errUpsert } = await db
        .from('creator_recommendations')
        .upsert(
          {
            creator_id:     creadorId,
            tmdb_id:        rec.tmdbId,
            media_type:     rec.mediaType,
            instagram_code: rec.codigo,
            cover_path:     coverPath,
            embeddable:     portada.limpia,
          },
          { onConflict: 'creator_id,media_type,tmdb_id' },
        )
      if (errUpsert) throw new Error(errUpsert.message)

      ;(codigoPrevio ? actualizadas : nuevas).push(rec)
      if (!portada.limpia) conPlay.push(rec)
      console.log(`${n} ✓ ${rec.titulo}${portada.limpia ? '' : ' (portada con botón de play)'}`)
    } catch (e) {
      fallidas.push({ titulo: rec.titulo, motivo: e.message })
      console.log(`${n} ✗ ${rec.titulo}: ${e.message}`)
    }

    await pausa(PAUSA_MS)
  }

  console.log('\n── Resultado ─────────────────────────────')
  console.log(`Nuevas:        ${nuevas.length}`)
  console.log(`Actualizadas:  ${actualizadas.length}`)
  console.log(`Ya estaban:    ${salteadas.length}`)
  console.log(`Fallidas:      ${fallidas.length}`)
  console.log(`En la base:    ${nuevas.length + actualizadas.length + salteadas.length} de ${filas.length}`)

  if (conPlay.length) {
    console.log('\nCon la portada con botón de play; en la web van directo a Instagram (para revisar):')
    for (const r of conPlay) console.log(`  - ${r.titulo}  https://www.instagram.com/p/${r.codigo}/`)
  }
  if (fallidas.length) {
    console.log('\nFallidas:')
    for (const f of fallidas) console.log(`  - ${f.titulo}: ${f.motivo}`)
  }
  console.log()

  if (fallidas.length) process.exitCode = 1
}

main().catch(e => {
  console.error(`\n❌  ${e.message}\n`)
  process.exit(1)
})
