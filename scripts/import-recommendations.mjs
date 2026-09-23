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
 * Probado contra los posts reales el 2026-09-23, sin credenciales:
 *
 *   1. `instagram.com/p/<código>/media/?size=l` redirige a la portada limpia,
 *      en 640×1136. Anda para casi todos los posts.
 *   2. Si ese da error, `og:image` de la página del post pedida como el bot de
 *      Facebook. Anda para todos, pero en los reels trae un botón de play
 *      pegado en la imagen y sale más chica (361×640). El reporte final lista
 *      cuáles salieron así, para reemplazarlas a mano si hace falta.
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
 * Correlo desde tu computadora, no desde un servidor: Instagram trata peor a
 * las IP de datacenter y eso no está probado.
 */

import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'recommendations'

/** Pausa entre posts. 162 seguidos sin pausa no cortaron, pero no cuesta nada. */
const PAUSA_MS = 300

const UA_NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const UA_FACEBOOK  = 'facebookexternalhit/1.1'

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
  const post = link.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/)
  if (!post) throw new Error(`el link de Instagram no es un post: "${link}"`)

  const media = ficha.match(/glynbox\.com\/(movie|tv)\/(\d+)/)
  if (!media) throw new Error(`el link de glynbox no es una ficha: "${ficha}"`)

  return {
    titulo:    titulo.trim(),
    codigo:    post[1],
    mediaType: media[1],
    tmdbId:    Number(media[2]),
  }
}

// ── Instagram ──────────────────────────────────────────────────────────────

const pausa = ms => new Promise(r => setTimeout(r, ms))

function esJpeg(buf) {
  return buf.length > 1000 && buf[0] === 0xff && buf[1] === 0xd8
}

async function bajarImagen(url, userAgent) {
  const res = await fetch(url, { headers: { 'User-Agent': userAgent }, redirect: 'follow' })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  return esJpeg(buf) ? buf : null
}

/** `og:image` de una página de Instagram, pedida como el bot de Facebook. */
async function ogImage(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA_FACEBOOK } })
  if (!res.ok) return null
  const html = await res.text()
  const m = html.match(/<meta property="og:image" content="([^"]+)"/)
  return m ? m[1].replaceAll('&amp;', '&') : null
}

/** La portada de un post. `{ buf, limpia }` o `null`. Ver el encabezado. */
async function bajarPortada(codigo) {
  const limpia = await bajarImagen(`https://www.instagram.com/p/${codigo}/media/?size=l`, UA_NAVEGADOR)
  if (limpia) return { buf: limpia, limpia: true }

  const og = await ogImage(`https://www.instagram.com/p/${codigo}/`)
  const conPlay = og && await bajarImagen(og, UA_NAVEGADOR)
  if (conPlay) return { buf: conPlay, limpia: false }

  return null
}

// ── Storage ────────────────────────────────────────────────────────────────

async function subir(ruta, buf) {
  const { error } = await db.storage.from(BUCKET).upload(ruta, buf, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) throw new Error(`Storage: ${error.message}`)
}

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
    const og = await ogImage(`https://www.instagram.com/${usuario}/`)
    const buf = og && await bajarImagen(og, UA_NAVEGADOR)
    if (buf) {
      avatarPath = `avatars/${usuario}.jpg`
      await subir(avatarPath, buf)
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

      const coverPath = `covers/${rec.codigo}.jpg`
      await subir(coverPath, portada.buf)

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
