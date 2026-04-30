const { createClient } = require('@supabase/supabase-js')
const https = require('https')

const SUPABASE_URL = 'https://ddoqsdgiggkhbsulxncs.supabase.co'
const SUPABASE_KEY = 'sb_publishable_QZmx3kF-wZRM4l8oKYCuKw_HZ4e1Dqq'
const TMDB_KEY = 'acb96af19f5ef54f650ed3a6149dbb70'
const FERLAGEOK_ID = '6c76de2c-8600-4fb0-bc62-75a1746f40b9'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function fetchTMDB(path) {
  return new Promise((resolve) => {
    https.get('https://api.themoviedb.org/3' + path + '&api_key=' + TMDB_KEY + '&language=es-AR', (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch(e) { resolve({}) } })
    }).on('error', () => resolve({}))
  })
}

async function getPages(endpoint, pages) {
  const results = []
  for (let p = 1; p <= pages; p++) {
    const sep = endpoint.includes('?') ? '&' : '?'
    const data = await fetchTMDB(endpoint + sep + 'page=' + p)
    if (data.results) results.push(...data.results)
    await new Promise(r => setTimeout(r, 400))
  }
  return results
}

async function populateList(listTitle, items, mediaType) {
  const { data: list } = await supabase
    .from('lists')
    .select('id')
    .eq('title', listTitle)
    .eq('user_id', FERLAGEOK_ID)
    .maybeSingle()

  if (!list) { console.log('Lista no encontrada: ' + listTitle); return }

  await supabase.from('list_items').delete().eq('list_id', list.id)

  const listItems = items.slice(0, 250).map((item, i) => ({
    list_id: list.id,
    media_id: item.id,
    media_type: mediaType,
    title: item.title || item.name || 'Sin título',
    poster_path: item.poster_path || null,
    position: i + 1
  }))

  const chunkSize = 50
  for (let i = 0; i < listItems.length; i += chunkSize) {
    const chunk = listItems.slice(i, i + chunkSize)
    const { error } = await supabase.from('list_items').insert(chunk)
    if (error) console.log('Error:', error.message)
    else console.log(listTitle + ': insertados ' + (i + chunk.length) + ' de ' + listItems.length)
    await new Promise(r => setTimeout(r, 300))
  }
}

async function main() {
  console.log('Iniciando...')

  const topMovies = await getPages('/movie/top_rated', 13)
  console.log('Top movies obtenidas:', topMovies.length)
  await populateList('250 Mejores películas de todos los tiempos', topMovies, 'movie')

  const topSeries = await getPages('/tv/top_rated', 13)
  console.log('Top series obtenidas:', topSeries.length)
  await populateList('250 Mejores series de todos los tiempos', topSeries, 'tv')

  const bucket = topMovies.filter(m => m.vote_count > 5000).slice(0, 100)
  await populateList('Las 100 películas que hay que ver antes de morir', bucket, 'movie')

  const pareja = await getPages('/discover/movie?with_genres=10749%2C35&sort_by=vote_average.desc&vote_count.gte=1000', 3)
  await populateList('Películas perfectas para ver en pareja', pareja, 'movie')

  const latino = await getPages('/discover/movie?with_original_language=es&sort_by=vote_average.desc&vote_count.gte=300', 3)
  await populateList('Lo mejor del cine latinoamericano', latino, 'movie')

  console.log('Completado!')
}

main()
