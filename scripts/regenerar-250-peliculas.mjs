/**
 * Regenera la lista oficial "250 Mejores películas de todos los tiempos".
 *
 * La lista se armó con /movie/top_rated de TMDB (scripts/populate-lists.js),
 * que no pide un mínimo de votos y se llenó de títulos de nicho (conciertos,
 * especiales de TV). Ésta usa /discover/movie ordenado por calificación con al
 * menos 10.000 votos, saca documentales y películas de concierto, y reemplaza
 * los ítems de la lista sin tocar su id ni su título.
 *
 * Uso (desde la raíz del repo):
 *   node --env-file=.env.local scripts/regenerar-250-peliculas.mjs           → sólo muestra qué cargaría
 *   node --env-file=.env.local scripts/regenerar-250-peliculas.mjs --aplicar → reemplaza los ítems
 *
 * Variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE, NEXT_PUBLIC_TMDB_API_KEY.
 */

import { createClient } from '@supabase/supabase-js'

const LISTA_ID = 'be143bb8-18e8-4982-8ceb-982ecb7cc39a'
const CANTIDAD = 250
const DOCUMENTAL = 99
const MUSICA = 10402
// Películas de concierto: género Música y un título de gira o recital.
const CONCIERTO = /\b(tour|concert|concierto|live (at|in|from)|en vivo|en directo|recital|the eras|unplugged)\b/i

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const CLAVE = process.env.SUPABASE_SERVICE_ROLE ?? process.env.SUPABASE_SERVICE_ROLE_KEY
const TMDB = process.env.NEXT_PUBLIC_TMDB_API_KEY
if (!URL || !CLAVE || !TMDB) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE o NEXT_PUBLIC_TMDB_API_KEY (usar --env-file=.env.local).')
  process.exit(1)
}
const aplicar = process.argv.includes('--aplicar')
const db = createClient(URL, CLAVE, { auth: { persistSession: false } })

function excluida(m) {
  const generos = m.genre_ids ?? []
  if (generos.includes(DOCUMENTAL)) return 'documental'
  if (generos.includes(MUSICA) && (CONCIERTO.test(m.title ?? '') || CONCIERTO.test(m.original_title ?? ''))) return 'concierto'
  return null
}

async function peliculas() {
  const out = []
  const vistas = new Set()
  for (let pagina = 1; out.length < CANTIDAD; pagina++) {
    const q = new URLSearchParams({
      api_key: TMDB, language: 'es-ES', sort_by: 'vote_average.desc',
      'vote_count.gte': '10000', include_adult: 'false', include_video: 'false', page: String(pagina),
    })
    const r = await fetch(`https://api.themoviedb.org/3/discover/movie?${q}`)
    if (!r.ok) throw new Error(`TMDB ${r.status} en la página ${pagina}`)
    const d = await r.json()
    for (const m of d.results ?? []) {
      if (vistas.has(m.id)) continue
      vistas.add(m.id)
      const motivo = excluida(m)
      if (motivo) { console.log(`  excluida (${motivo}): ${m.title} [${m.id}]`); continue }
      out.push(m)
    }
    if (pagina >= (d.total_pages ?? 0)) break
  }
  // El índice de orden de TMDB va un poco atrasado respecto del puntaje que
  // devuelve (puede salir un 8,5 detrás de un 8,46): se reordena por puntaje.
  return out.slice(0, CANTIDAD).sort((a, b) => b.vote_average - a.vote_average)
}

const { data: lista, error: eLista } = await db.from('lists').select('id, title').eq('id', LISTA_ID).single()
if (eLista || !lista) { console.error('No encontré la lista:', eLista?.message); process.exit(1) }
console.log(`Lista: "${lista.title}" (${lista.id})`)

// La numeración de las posiciones sigue la que ya tiene la lista (0 o 1).
const { data: actuales, error: eAct } = await db.from('list_items').select('position').eq('list_id', LISTA_ID)
if (eAct) { console.error(eAct.message); process.exit(1) }
const base = actuales.length ? Math.min(...actuales.map(i => i.position)) : 1
console.log(`Ítems actuales: ${actuales.length} (posiciones desde ${base})`)

const pelis = await peliculas()
if (pelis.length !== CANTIDAD) { console.error(`TMDB devolvió ${pelis.length} películas, no ${CANTIDAD}. No cambio nada.`); process.exit(1) }

const items = pelis.map((m, i) => ({
  list_id: LISTA_ID, media_id: m.id, media_type: 'movie',
  title: m.title || m.original_title || 'Sin título', poster_path: m.poster_path ?? null, position: base + i,
}))

console.log('\nPrimeras 20:')
for (const [i, m] of pelis.slice(0, 20).entries()) {
  console.log(`${String(i + 1).padStart(3)}. ${m.title} (${(m.release_date ?? '').slice(0, 4)}) · ${m.vote_average} · ${m.vote_count} votos`)
}
const ultima = pelis.at(-1)
console.log(`...\n250. ${ultima.title} · ${ultima.vote_average} · ${ultima.vote_count} votos`)

if (!aplicar) { console.log('\nPrueba: no se cambió nada. Para reemplazar los ítems: --aplicar'); process.exit(0) }

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
