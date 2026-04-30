const { createClient } = require('@supabase/supabase-js')
const https = require('https')

const SUPABASE_URL = 'https://ddoqsdgiggkhbsulxncs.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_QZmx3kF-wZRM4l8oKYCuKw_HZ4e1Dqq'
const TMDB_KEY = 'acb96af19f5ef54f650ed3a6149dbb70'
const FERLAGEOK_ID = '6c76de2c-8600-4fb0-bc62-75a1746f40b9'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function fetchTMDB(path) {
  return new Promise((resolve) => {
    https.get(`https://api.themoviedb.org/3${path}&api_key=${TMDB_KEY}&language=es-AR`, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(JSON.parse(data)))
    })
  })
}

async function getPages(endpoint, pages) {
  const results = []
  for (let p = 1; p <= pages; p++) {
    const sep = endpoint.includes('?') ? '&' : '?'
    const data = await fetchTMDB(`${endpoint}${sep}page=${p}`)
    if (data.results) results.push(...data.results)
    await new Promise(r => setTimeout(r, 300))
  }
  return results
}

async function populateList(listTitle, items, mediaType) {
  const { data: list } = await supabase
    .from('lists')
    .select('id')
    .eq('title', listTitle)
    .eq('user_id', FERLAGEOK_ID)
    .single()

  if (!list) { console.log(`Lista no encontrada: ${listTitle}`); return }

  // Skip if already populated
  const { count } = await supabase
    .from('list_items')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', list.id)
  if (count > 0) { console.log(`${listTitle}: ya tiene ${count} items — saltando`); return }

  const listItems = items.map((item, i) => ({
    list_id: list.id,
    media_id: item.id,
    media_type: mediaType,
    title: item.title || item.name,
    poster_path: item.poster_path,
    position: i + 1
  }))

  // Insert in batches of 100
  for (let i = 0; i < listItems.length; i += 100) {
    const batch = listItems.slice(i, i + 100)
    const { error } = await supabase.from('list_items').insert(batch)
    if (error) {
      console.log(`${listTitle}: ERROR — ${error.message}`)
      if (error.message.includes('row-level security')) {
        console.log('\n❌  RLS está bloqueando inserts anónimos en list_items.')
        console.log('   Ejecutá en Supabase Dashboard → SQL Editor:')
        console.log('   CREATE POLICY "temp_seed" ON list_items FOR INSERT TO anon WITH CHECK (true);')
        console.log('   Luego volvé a ejecutar este script.\n')
        process.exit(1)
      }
      return
    }
    process.stdout.write(`   ${Math.min(i + 100, listItems.length)}/${listItems.length} insertados\r`)
  }
  console.log(`✅  ${listTitle}: ${listItems.length} items insertados`)
}

async function main() {
  console.log('Fetching TMDB data...\n')

  const topMovies = await getPages('/movie/top_rated', 13)
  console.log(`Top movies fetched: ${topMovies.length}`)
  await populateList('250 Mejores películas de todos los tiempos', topMovies.slice(0, 250), 'movie')

  const topSeries = await getPages('/tv/top_rated', 13)
  console.log(`Top series fetched: ${topSeries.length}`)
  await populateList('250 Mejores series de todos los tiempos', topSeries.slice(0, 250), 'tv')

  const bucket = topMovies.filter(m => m.vote_count > 10000).slice(0, 100)
  console.log(`Bucket list filtered: ${bucket.length}`)
  await populateList('Las 100 películas que hay que ver antes de morir', bucket, 'movie')

  const pareja = await getPages('/discover/movie?with_genres=10749,35&sort_by=vote_average.desc&vote_count.gte=1000', 3)
  console.log(`Pareja fetched: ${pareja.length}`)
  await populateList('Películas perfectas para ver en pareja', pareja.slice(0, 50), 'movie')

  const latino = await getPages('/discover/movie?with_original_language=es&sort_by=vote_average.desc&vote_count.gte=500', 3)
  console.log(`Latino fetched: ${latino.length}`)
  await populateList('Lo mejor del cine latinoamericano', latino.slice(0, 50), 'movie')

  console.log('\n🎉  Listo!')
}

main()
