/**
 * Regenera la lista oficial "250 Mejores películas de todos los tiempos".
 *
 * Historia:
 *   - Se armó con /movie/top_rated de TMDB (scripts/populate-lists.js), que no
 *     pide mínimo de votos y se llenó de títulos de nicho (conciertos,
 *     especiales de TV).
 *   - Después, con /discover/movie y 10.000 votos o más ordenado por puntaje:
 *     se fue al otro extremo, muy blockbuster (los clásicos tienen menos votos
 *     en TMDB y quedaban afuera).
 *   - Ahora: candidatos con 3.000 votos o más, ordenados por la calificación
 *     ponderada de IMDb, que acerca al promedio los puntajes con pocos votos:
 *
 *       WR = v/(v+m)·R + m/(v+m)·C
 *
 *     v = votos de la película, R = su puntaje, m = 5.000 y C = el puntaje
 *     promedio de todos los candidatos.
 *
 * Además:
 *   - Los clásicos de `CLASICOS` entran siempre, en el puesto que les da su
 *     WR. Varios tienen menos de 3.000 votos en TMDB (Harakiri, Cuentos de
 *     Tokio, Ran…) y bajar el piso para que entren también metía nicho
 *     (Gabriel's Inferno, animé, estrenos con pocos votos).
 *   - No entran estrenos de los últimos 12 meses: su puntaje todavía no se
 *     asentó y suelen ser lo más taquillero. Entran al regenerar más adelante.
 *   - Se sacan documentales y películas de concierto.
 *
 * Reemplaza los ítems de la lista sin tocar su id ni su título. Sin
 * `--aplicar` sólo muestra qué cargaría, qué entra y qué sale respecto de la
 * lista actual, y si están los clásicos.
 *
 * Uso (desde la raíz del repo):
 *   node --env-file=.env.local scripts/regenerar-250-peliculas.mjs           → sólo muestra
 *   node --env-file=.env.local scripts/regenerar-250-peliculas.mjs --aplicar → reemplaza los ítems
 *
 * Variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE, NEXT_PUBLIC_TMDB_API_KEY.
 */

import { createClient } from '@supabase/supabase-js'

const LISTA_ID = 'be143bb8-18e8-4982-8ceb-982ecb7cc39a'
const CANTIDAD = 250
const VOTOS_MINIMOS = 3000
const CANDIDATOS = 600
/** El `m` de la fórmula: con esta cantidad de votos, el puntaje propio pesa la mitad. */
const M = 5000
const DOCUMENTAL = 99
const MUSICA = 10402
// Películas de concierto: género Música y un título de gira o recital.
const CONCIERTO = /\b(tour|concert|concierto|live (at|in|from)|en vivo|en directo|recital|the eras|unplugged)\b/i

/**
 * Clásicos que entran siempre (ids de TMDB): Doce hombres sin piedad, Ciudadano
 * Kane, La ventana indiscreta, Casablanca, Rashomon, Los siete samuráis, Ran,
 * Harakiri, El séptimo sello, Cuentos de Tokio, Stalker, Psicosis, El
 * apartamento.
 */
const CLASICOS = [389, 15, 567, 289, 548, 346, 11645, 14537, 490, 18148, 1398, 539, 284]
/** Estrenos más nuevos que esto no entran. */
const DIAS_MINIMOS = 365
const ESTRENADA_ANTES_DE = new Date(Date.now() - DIAS_MINIMOS * 86400000).toISOString().slice(0, 10)
/** Lo que no tiene que entrar nunca. */
const PROHIBIDO = /gabriel'?s inferno|infierno de gabriel|taylor swift|doctor who/i

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const CLAVE = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const TMDB = process.env.NEXT_PUBLIC_TMDB_API_KEY
if (!URL || !CLAVE || !TMDB) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE o NEXT_PUBLIC_TMDB_API_KEY (usar --env-file=.env.local).')
  process.exit(1)
}
const aplicar = process.argv.includes('--aplicar')
const db = createClient(URL, CLAVE, { auth: { persistSession: false } })

async function tmdb(ruta, params = {}) {
  const q = new URLSearchParams({ api_key: TMDB, language: 'es-ES', ...params })
  const r = await fetch(`https://api.themoviedb.org/3${ruta}?${q}`)
  if (!r.ok) throw new Error(`TMDB ${r.status} en ${ruta}`)
  return r.json()
}

function excluida(m) {
  const generos = m.genre_ids ?? (m.genres ?? []).map(g => g.id)
  if (generos.includes(DOCUMENTAL)) return 'documental'
  if (generos.includes(MUSICA) && (CONCIERTO.test(m.title ?? '') || CONCIERTO.test(m.original_title ?? ''))) return 'concierto'
  if (!m.release_date || m.release_date > ESTRENADA_ANTES_DE) return 'estreno reciente'
  return null
}

/** Los primeros ~600 candidatos de /discover/movie con 3.000 votos o más, sin excluidas. */
async function candidatos() {
  const out = []
  const vistas = new Set()
  for (let pagina = 1; vistas.size < CANDIDATOS; pagina++) {
    const d = await tmdb('/discover/movie', {
      sort_by: 'vote_average.desc', 'vote_count.gte': String(VOTOS_MINIMOS),
      include_adult: 'false', include_video: 'false', page: String(pagina),
    })
    for (const m of d.results ?? []) {
      if (vistas.has(m.id)) continue
      vistas.add(m.id)
      const motivo = excluida(m)
      if (motivo) { console.log(`  excluida (${motivo}): ${m.title} [${m.id}]`); continue }
      out.push(m)
    }
    if (pagina >= (d.total_pages ?? 0)) break
  }
  return out
}

const ponderada = (v, R, C) => (v / (v + M)) * R + (M / (v + M)) * C
const anio = m => (m.release_date ?? '').slice(0, 4)
const fmt = n => n.toFixed(3)

// ── Lista actual ─────────────────────────────────────────────────────────────

const { data: lista, error: eLista } = await db.from('lists').select('id, title').eq('id', LISTA_ID).single()
if (eLista || !lista) { console.error('No encontré la lista:', eLista?.message); process.exit(1) }
console.log(`Lista: "${lista.title}" (${lista.id})`)

const { data: actuales, error: eAct } = await db.from('list_items').select('media_id, title, position').eq('list_id', LISTA_ID).order('position')
if (eAct) { console.error(eAct.message); process.exit(1) }
// La numeración de las posiciones sigue la que ya tiene la lista (0 o 1).
const base = actuales.length ? Math.min(...actuales.map(i => i.position)) : 1
console.log(`Ítems actuales: ${actuales.length} (posiciones desde ${base})`)

// ── Lista nueva ──────────────────────────────────────────────────────────────

const cands = await candidatos()
const C = cands.reduce((s, m) => s + m.vote_average, 0) / cands.length
console.log(`\nCandidatos: ${cands.length} (≥ ${VOTOS_MINIMOS} votos) · C = ${fmt(C)} · m = ${M}`)
// Los clásicos que no vinieron entre los candidatos (por tener menos votos)
// se piden aparte. Se suman después de calcular C, para no moverlo.
const porId = new Map(cands.map(m => [m.id, m]))
for (const id of CLASICOS) {
  if (!porId.has(id)) porId.set(id, await tmdb(`/movie/${id}`))
}
const pool = [...porId.values()]
for (const m of pool) m.wr = ponderada(m.vote_count, m.vote_average, C)
const ordenadas = [...pool].sort((a, b) => b.wr - a.wr)
// Primero los clásicos; el resto de los lugares, por WR.
const elegidas = new Set(CLASICOS)
for (const m of ordenadas) { if (elegidas.size >= CANTIDAD) break; elegidas.add(m.id) }
const pelis = ordenadas.filter(m => elegidas.has(m.id))
if (pelis.length !== CANTIDAD) { console.error(`Quedaron ${pelis.length} películas, no ${CANTIDAD}. No cambio nada.`); process.exit(1) }
const corte = pelis.at(-1).wr

console.log('\nPrimeras 30:')
for (const [i, m] of pelis.slice(0, 30).entries()) {
  console.log(`${String(i + 1).padStart(3)}. ${m.title} (${anio(m)}) · WR ${fmt(m.wr)} · ${m.vote_average} · ${m.vote_count} votos`)
}
console.log(`...\n250. ${pelis.at(-1).title} (${anio(pelis.at(-1))}) · WR ${fmt(corte)} · ${pelis.at(-1).vote_average} · ${pelis.at(-1).vote_count} votos`)

// ── Entran y salen ───────────────────────────────────────────────────────────

const idsNuevos = new Set(pelis.map(m => m.id))
const idsActuales = new Set(actuales.map(i => i.media_id))
const entran = pelis.filter(m => !idsActuales.has(m.id))
const salen = actuales.filter(i => !idsNuevos.has(i.media_id))
console.log(`\nENTRAN (${entran.length}):`)
for (const m of entran) console.log(`  + #${pelis.indexOf(m) + 1} ${m.title} (${anio(m)}) · ${m.vote_average} · ${m.vote_count} votos`)
console.log(`\nSALEN (${salen.length}):`)
for (const i of salen) {
  const m = porId.get(i.media_id)
  const donde = m ? `quedó #${ordenadas.indexOf(m) + 1} · WR ${fmt(m.wr)} · ${m.vote_average} · ${m.vote_count} votos` : 'no está entre los candidatos'
  console.log(`  - (era #${i.position - base + 1}) ${i.title} → ${donde}`)
}

// ── Controles ────────────────────────────────────────────────────────────────

console.log(`\nClásicos (corte: WR ${fmt(corte)}):`)
let faltan = 0
for (const id of CLASICOS) {
  const i = pelis.findIndex(m => m.id === id)
  if (i === -1) { faltan++; console.log(`  ✘ ${porId.get(id)?.title ?? id} no entró`); continue }
  const m = pelis[i]
  const nota = m.vote_count < VOTOS_MINIMOS ? ` · forzada (${m.vote_count} votos)` : ''
  console.log(`  ✔ #${i + 1} ${m.title} (${anio(m)}) · WR ${fmt(m.wr)} · ${m.vote_average} · ${m.vote_count} votos${nota}`)
}

const prohibidas = pelis.filter(m => PROHIBIDO.test(m.title) || PROHIBIDO.test(m.original_title ?? ''))
const pocosVotos = pelis.filter(m => m.vote_count < VOTOS_MINIMOS && !CLASICOS.includes(m.id))
const recientes = pelis.filter(m => (m.release_date ?? '') > ESTRENADA_ANTES_DE)
console.log(`\nNicho: ${prohibidas.length} de Gabriel's Inferno / Taylor Swift / Doctor Who, ${pocosVotos.length} con menos de ${VOTOS_MINIMOS} votos (sin contar los clásicos), ${recientes.length} estrenadas después del ${ESTRENADA_ANTES_DE}.`)
if (prohibidas.length || pocosVotos.length || recientes.length) { console.error('ATENCIÓN: entró algo de nicho o un estreno reciente. No cambio nada.'); process.exit(1) }
if (faltan) { console.error(`ATENCIÓN: faltan ${faltan} clásicos. No cambio nada.`); process.exit(1) }

const items = pelis.map((m, i) => ({
  list_id: LISTA_ID, media_id: m.id, media_type: 'movie',
  title: m.title || m.original_title || 'Sin título', poster_path: m.poster_path ?? null, position: base + i,
}))

if (!aplicar) { console.log('\nPrueba: no se cambió nada. Para reemplazar los ítems: --aplicar'); process.exit(0) }

// ── Aplicar ──────────────────────────────────────────────────────────────────

// Copia de los ítems actuales por si hay que volver atrás.
const { data: copia } = await db.from('list_items').select('*').eq('list_id', LISTA_ID).order('position')
const fs = await import('node:fs')
const { tmpdir } = await import('node:os')
const archivo = `${tmpdir()}/lista-250-peliculas-respaldo-${Date.now()}.json`
fs.writeFileSync(archivo, JSON.stringify(copia, null, 2))
console.log(`\nRespaldo de los ${copia.length} ítems anteriores en ${archivo}`)

const { error: eBorrar } = await db.from('list_items').delete().eq('list_id', LISTA_ID)
if (eBorrar) { console.error('Error al borrar:', eBorrar.message); process.exit(1) }
for (let i = 0; i < items.length; i += 100) {
  const { error } = await db.from('list_items').insert(items.slice(i, i + 100))
  if (error) { console.error(`Error al insertar desde ${i + 1}:`, error.message); process.exit(1) }
}

const { data: final, error: eFinal } = await db.from('list_items')
  .select('media_id, media_type, title, position').eq('list_id', LISTA_ID).order('position')
if (eFinal) { console.error(eFinal.message); process.exit(1) }
const unicas = new Set(final.map(i => i.media_id)).size
console.log(`\nVerificación: ${final.length} ítems, ${unicas} películas distintas, todos movie: ${final.every(i => i.media_type === 'movie')}`)
console.log(final.length === CANTIDAD && unicas === CANTIDAD ? 'OK' : 'ATENCIÓN: la lista no quedó con 250 películas')
