// One-off script: downloads TMDB backdrops, resizes to 1200x630,
// composites a dark gradient, saves to public/guias/
import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'guias')
const TMDB_KEY = 'acb96af19f5ef54f650ed3a6149dbb70'

const TARGETS = [
  { movieId: 324857, filename: 'historia-animacion-hero.jpg' },
  { movieId: 14160,  filename: 'peliculas-pixar-hero.jpg' },
  { movieId: 62,     filename: 'directores-iconicos-hero.jpg' },
  { movieId: 493922, filename: 'evolucion-terror-hero.jpg' },
  { movieId: 76341,  filename: 'evolucion-accion-hero.jpg' },
]

const GRADIENT_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0%"   stop-color="#000" stop-opacity="0.25"/>' +
  '<stop offset="55%"  stop-color="#000" stop-opacity="0.55"/>' +
  '<stop offset="100%" stop-color="#000" stop-opacity="0.80"/>' +
  '</linearGradient></defs>' +
  '<rect width="1200" height="630" fill="url(#g)"/>' +
  '</svg>'
)

async function process({ movieId, filename }) {
  const meta = await fetch(
    `https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_KEY}`
  ).then(r => r.json())

  const backdropPath = meta.backdrop_path
  if (!backdropPath) throw new Error(`No backdrop for movie ${movieId}`)

  const imgUrl = `https://image.tmdb.org/t/p/w1280${backdropPath}`
  const imgBuf = Buffer.from(await fetch(imgUrl).then(r => r.arrayBuffer()))

  const outPath = path.join(OUT_DIR, filename)
  await sharp(imgBuf)
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .composite([{ input: GRADIENT_SVG, blend: 'over' }])
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(outPath)

  console.log(`✅ ${filename}`)
}

for (const target of TARGETS) {
  await process(target)
}
console.log('Done.')
