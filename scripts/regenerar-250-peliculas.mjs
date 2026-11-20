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
 *   - No entran estrenos del año actual ni del anterior: su puntaje todavía no
 *     se asentó y suelen ser lo más taquillero. Antes eran "los últimos 12
 *     meses", y pasaban películas que se sienten nuevas (Cómo entrenar a tu
 *     dragón de junio de 2025 o Predator: Badlands de noviembre de 2025, en
 *     noviembre de 2026).
 *   - `EXCLUSIONES`: películas que no entran nunca, elegidas a mano (taquilleras
 *     o juveniles con buen puntaje que no son "de las mejores de la historia").
 *   - Cada exclusión cede su lugar a una película de 1950 a 1999: la lista son
 *     los clásicos y las mejores por WR hasta completar 250 − EXCLUSIONES, y
 *     el resto se llena SÓLO con películas de esos años (piso de 1.000 votos,
 *     que ahí es seguro porque el rango de años ya deja afuera el nicho
 *     moderno), también por WR.
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
/** El año de estreno más nuevo que entra: no entra nada del año actual ni del anterior. */
const ANIO_MAXIMO = new Date().getFullYear() - 2

/** Películas que no entran nunca (ids de TMDB, resueltos por título y año). */
const EXCLUSIONES = [
  19404,   // Un amor contra viento y marea (1995)
  1184918, // Robot salvaje (2024)
  315162,  // El Gato con Botas: El último deseo (2022)
  24428,   // Vengadores (2012)
  361743,  // Top Gun: Maverick (2022)
  12445,   // Harry Potter y las Reliquias de la Muerte - Parte 2 (2011)
  527641,  // A dos metros de ti (2019)
  637920,  // Milagro en la celda 7 (2019)
  635302,  // Guardianes de la Noche: Tren infinito (2020)
  406997,  // Wonder (2017)
  791373,  // La Liga de la Justicia de Zack Snyder (2021)
  673,     // Harry Potter y el prisionero de Azkaban (2004)
  634649,  // Spider-Man: No Way Home (2021)
  28178,   // Siempre a tu lado (Hachiko) (2009)
  424694,  // Bohemian Rhapsody (2018)
  449176,  // Con amor, Simon (2018)
  400928,  // Un don excepcional (2017)
  337404,  // Cruella (2021)
  823219,  // Flow, un mundo que salvar (2024)
  118340,  // Guardianes de la galaxia (2014)
  671,     // Harry Potter y la piedra filosofal (2001)
  43949,   // Flipped (2010)
  296096,  // Antes de ti (2016)
  503314,  // Dragon Ball Super: Broly (2018)
  803796,  // Las guerreras k-pop (2025)
  447365,  // Guardianes de la Galaxia: Volumen 3 (2023)
  316029,  // El gran showman (2017)
  610150,  // Dragon Ball Super: Super Hero (2022)
  615457,  // Nadie (2021)
  381341,  // Perfectos desconocidos (2016)
  1242898, // Predator: Badlands (2025)
  911430,  // F1 la película (2025)
  1087192, // Cómo entrenar a tu dragón (2025), la remake: queda la animada de 2010 (10191)
]

/**
 * Películas de 1950–1999 que no entran como relleno (también son exclusiones
 * fijas). Van aparte porque no ceden lugar: no estaban en la parte principal.
 */
const EXCLUSIONES_RELLENO = [
  12104, // Pink Floyd: El muro (1982): musical sobre el disco, en el límite de "concierto"
  18491, // Neon Genesis Evangelion: The End of Evangelion (1997): cierra una serie
  9702,  // Sangre por sangre (1993): de culto, no de canon
  38286, // Tres hombres y una pierna (1997): comedia italiana muy local
  8290,  // La gran juerga (1966): comedia francesa popular
]
const EXCLUIDA = id => EXCLUSIONES.includes(id) || EXCLUSIONES_RELLENO.includes(id)

/** El relleno de los lugares que ceden las exclusiones. */
const RELLENO_DESDE = '1950-01-01'
const RELLENO_HASTA = '1999-12-31'
const RELLENO_VOTOS_MINIMOS = 1000
const RELLENO_CANDIDATOS = 400
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
  if (!m.release_date || Number(m.release_date.slice(0, 4)) > ANIO_MAXIMO) return 'estreno reciente'
  return null
}

/** Los primeros `cuantos` candidatos de /discover/movie por puntaje, sin excluidas. */
async function candidatos(cuantos, filtros) {
  const out = []
  const vistas = new Set()
  for (let pagina = 1; vistas.size < cuantos; pagina++) {
    const d = await tmdb('/discover/movie', {
      sort_by: 'vote_average.desc', include_adult: 'false', include_video: 'false', page: String(pagina), ...filtros,
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

const todos = await candidatos(CANDIDATOS, { 'vote_count.gte': String(VOTOS_MINIMOS) })
// C se calcula con todos los candidatos, también los de EXCLUSIONES: si no, al
// sacarlas baja el promedio, se mueve el corte y entra o sale alguna más.
const C = todos.reduce((s, m) => s + m.vote_average, 0) / todos.length
const cands = todos.filter(m => !EXCLUIDA(m.id))
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
// Primero los clásicos; los lugares principales que quedan, por WR.
const PRINCIPALES = CANTIDAD - EXCLUSIONES.length
const elegidas = new Set(CLASICOS)
for (const m of ordenadas) { if (elegidas.size >= PRINCIPALES) break; elegidas.add(m.id) }
const principales = ordenadas.filter(m => elegidas.has(m.id))
const corte = principales.at(-1).wr

// El relleno: películas de 1950 a 1999 que no estén ya, por WR (con el mismo
// C, para que los puntajes se puedan comparar con los de arriba).
const candsRelleno = await candidatos(RELLENO_CANDIDATOS, {
  'vote_count.gte': String(RELLENO_VOTOS_MINIMOS),
  'primary_release_date.gte': RELLENO_DESDE, 'primary_release_date.lte': RELLENO_HASTA,
})
for (const m of candsRelleno) m.wr = ponderada(m.vote_count, m.vote_average, C)
const relleno = candsRelleno
  .filter(m => !elegidas.has(m.id) && !EXCLUIDA(m.id))
  .sort((a, b) => b.wr - a.wr)
  .slice(0, CANTIDAD - principales.length)
for (const m of relleno) { m.relleno = true; porId.set(m.id, m) }
const pelis = [...principales, ...relleno].sort((a, b) => b.wr - a.wr)
if (pelis.length !== CANTIDAD) { console.error(`Quedaron ${pelis.length} películas, no ${CANTIDAD}. No cambio nada.`); process.exit(1) }

console.log(`\nRELLENO de 1950 a 1999 (${relleno.length}, de ${candsRelleno.length} candidatas con ≥ ${RELLENO_VOTOS_MINIMOS} votos):`)
for (const m of relleno) {
  console.log(`  #${String(pelis.indexOf(m) + 1).padStart(3)} ${m.title} (${anio(m)}) · WR ${fmt(m.wr)} · ${m.vote_average} · ${m.vote_count} votos · ${m.original_language}`)
}

console.log('\nPrimeras 30:')
for (const [i, m] of pelis.slice(0, 30).entries()) {
  console.log(`${String(i + 1).padStart(3)}. ${m.title} (${anio(m)}) · WR ${fmt(m.wr)} · ${m.vote_average} · ${m.vote_count} votos`)
}
console.log(`...\n250. ${pelis.at(-1).title} (${anio(pelis.at(-1))}) · WR ${fmt(pelis.at(-1).wr)} · ${pelis.at(-1).vote_average} · ${pelis.at(-1).vote_count} votos`)

// ── Entran y salen ───────────────────────────────────────────────────────────

const idsNuevos = new Set(pelis.map(m => m.id))
const idsActuales = new Set(actuales.map(i => i.media_id))
const entran = pelis.filter(m => !idsActuales.has(m.id))
const salen = actuales.filter(i => !idsNuevos.has(i.media_id))
console.log(`\nENTRAN (${entran.length}):`)
for (const m of entran) console.log(`  + #${pelis.indexOf(m) + 1} ${m.title} (${anio(m)}) · ${m.vote_average} · ${m.vote_count} votos${m.relleno ? ' · relleno 1950–1999' : ''}`)
console.log(`\nSALEN (${salen.length}):`)
for (const i of salen) {
  const m = porId.get(i.media_id)
  const donde = EXCLUIDA(i.media_id) ? 'exclusión fija'
    : m ? `quedó #${ordenadas.indexOf(m) + 1} · WR ${fmt(m.wr)} · ${m.vote_average} · ${m.vote_count} votos` : 'no está entre los candidatos'
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
// El relleno tiene su propio piso (1.000), por eso no cuenta acá.
const pocosVotos = pelis.filter(m => m.vote_count < VOTOS_MINIMOS && !CLASICOS.includes(m.id) && !m.relleno)
const recientes = pelis.filter(m => Number(anio(m)) > ANIO_MAXIMO)
const excluidasAdentro = pelis.filter(m => EXCLUIDA(m.id))
const repetidas = pelis.length - new Set(pelis.map(m => m.id)).size
console.log(`\nControles: ${prohibidas.length} de Gabriel's Inferno / Taylor Swift / Doctor Who · ${pocosVotos.length} con menos de ${VOTOS_MINIMOS} votos (sin clásicos ni relleno) · ${recientes.length} estrenadas después de ${ANIO_MAXIMO} · ${excluidasAdentro.length} de las exclusiones fijas · ${repetidas} ids de TMDB repetidos.`)
if (prohibidas.length || pocosVotos.length || recientes.length || excluidasAdentro.length || repetidas) { console.error('ATENCIÓN: algo no pasó los controles. No cambio nada.'); process.exit(1) }
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
