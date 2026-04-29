/**
 * Seed the 5 official Glynbox lists with TMDB data.
 *
 * Prerequisites:
 *   1. Get your Supabase service role key from:
 *      Supabase Dashboard → Project Settings → API → Service role (secret)
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=your_key_here node scripts/seed-official-lists.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ddoqsdgiggkhbsulxncs.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const TMDB_KEY     = 'acb96af19f5ef54f650ed3a6149dbb70'

if (!SERVICE_KEY) {
  console.error('\n❌  SUPABASE_SERVICE_ROLE_KEY is not set.')
  console.error('    Get it from: Supabase Dashboard → Project Settings → API → Service role (secret)\n')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── TMDB helpers ─────────────────────────────────────────────────────────────

async function tmdb(path) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://api.themoviedb.org/3${path}${sep}api_key=${TMDB_KEY}`)
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`)
  return res.json()
}

async function topRatedMovies(pages = 13) {
  const out = []
  for (let p = 1; p <= pages; p++) {
    const d = await tmdb(`/movie/top_rated?language=es-AR&page=${p}`)
    out.push(...(d.results ?? []))
    if ((d.total_pages ?? 0) < p + 1) break
  }
  return out
}

async function topRatedTV(pages = 13) {
  const out = []
  for (let p = 1; p <= pages; p++) {
    const d = await tmdb(`/tv/top_rated?language=es-AR&page=${p}`)
    out.push(...(d.results ?? []))
    if ((d.total_pages ?? 0) < p + 1) break
  }
  return out
}

async function discover(params, pages = 4) {
  const out = []
  for (let p = 1; p <= pages; p++) {
    const d = await tmdb(`/discover/movie?language=es-AR&page=${p}&${params}`)
    out.push(...(d.results ?? []))
    if ((d.total_pages ?? 0) < p + 1) break
  }
  return out
}

function toMovieItems(arr, limit) {
  return arr.slice(0, limit).map((m, i) => ({
    media_id: m.id, media_type: 'movie',
    title: m.title ?? m.name ?? '', poster_path: m.poster_path ?? null, position: i,
  }))
}

function toTVItems(arr, limit) {
  return arr.slice(0, limit).map((s, i) => ({
    media_id: s.id, media_type: 'tv',
    title: s.name ?? s.title ?? '', poster_path: s.poster_path ?? null, position: i,
  }))
}

// ── List definitions ─────────────────────────────────────────────────────────

const LISTS = [
  {
    title: '250 Mejores películas de todos los tiempos',
    description: 'Una selección de las 250 películas más aclamadas por la crítica y el público a lo largo de la historia del cine.',
    tags: ['cine clásico', 'imprescindibles', 'top 250'],
    async items() {
      console.log('    → fetching top-rated movies (13 pages)…')
      const movies = await topRatedMovies(13)
      return toMovieItems(movies, 250)
    },
  },
  {
    title: '250 Mejores series de todos los tiempos',
    description: 'Las 250 series más influyentes y mejor valoradas de la historia de la televisión.',
    tags: ['series', 'imprescindibles', 'top 250'],
    async items() {
      console.log('    → fetching top-rated TV (13 pages)…')
      const series = await topRatedTV(13)
      return toTVItems(series, 250)
    },
  },
  {
    title: 'Las 100 películas que hay que ver antes de morir',
    description: 'Una lista curada de experiencias cinematográficas únicas que todo amante del cine debe ver al menos una vez en la vida.',
    tags: ['bucket list', 'cine', 'imprescindibles'],
    async items() {
      console.log('    → fetching top-rated movies (8 pages) and filtering by vote_count > 10000…')
      const movies = await topRatedMovies(8)
      const filtered = movies.filter(m => (m.vote_count ?? 0) > 10000)
      return toMovieItems(filtered, 100)
    },
  },
  {
    title: 'Películas perfectas para ver en pareja',
    description: 'Selección de películas románticas, comedias y dramas ideales para disfrutar en compañía de tu pareja.',
    tags: ['pareja', 'romance', 'date night'],
    async items() {
      console.log('    → fetching romantic/comedy/drama movies…')
      const movies = await discover('with_genres=10749%2C35%2C18&sort_by=vote_average.desc&vote_count.gte=500', 4)
      return toMovieItems(movies, 80)
    },
  },
  {
    title: 'Lo mejor del cine latinoamericano',
    description: 'Las películas y series más importantes producidas en América Latina, desde los clásicos hasta las producciones más recientes.',
    tags: ['latinoamérica', 'cine latino', 'cultura'],
    async items() {
      console.log('    → fetching Latin American cinema (es + pt)…')
      const [es, pt] = await Promise.all([
        discover('with_original_language=es&sort_by=vote_average.desc&vote_count.gte=100', 4),
        discover('with_original_language=pt&sort_by=vote_average.desc&vote_count.gte=100', 2),
      ])
      const seen = new Set()
      const unique = [...es, ...pt].filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true })
      return toMovieItems(unique, 80)
    },
  },
]

// ── Insert helpers ────────────────────────────────────────────────────────────

async function insertBatched(listId, items) {
  const BATCH = 100
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH).map(it => ({ ...it, list_id: listId }))
    const { error } = await db.from('list_items').insert(batch)
    if (error) {
      console.error(`    ❌  batch ${Math.floor(i / BATCH) + 1} error:`, error.message)
    } else {
      process.stdout.write(`    ✅  inserted ${i + 1}–${Math.min(i + BATCH, items.length)}\r`)
    }
  }
  console.log()
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Resolve Ferlageok's user_id
  const { data: profile, error: pErr } = await db
    .from('profiles').select('id').eq('username', 'Ferlageok').maybeSingle()
  if (pErr || !profile) {
    console.error('❌  Could not find profile username=Ferlageok:', pErr?.message)
    process.exit(1)
  }
  const userId = profile.id
  console.log(`✅  Ferlageok user_id = ${userId}\n`)

  for (const def of LISTS) {
    console.log(`📋  "${def.title}"`)

    // Check for existing list
    const { data: existing } = await db
      .from('lists').select('id')
      .eq('user_id', userId).eq('title', def.title).maybeSingle()

    let listId
    if (existing) {
      console.log(`    ⚠️  list already exists (id=${existing.id})`)
      listId = existing.id
    } else {
      const { data: created, error: cErr } = await db
        .from('lists')
        .insert({ user_id: userId, title: def.title, description: def.description, tags: def.tags, is_public: true })
        .select('id').single()
      if (cErr || !created) { console.error('    ❌  create error:', cErr?.message); continue }
      listId = created.id
      console.log(`    ✅  created (id=${listId})`)
    }

    // Skip if items already seeded
    const { count } = await db
      .from('list_items').select('id', { count: 'exact', head: true }).eq('list_id', listId)
    if (count && count > 0) {
      console.log(`    ⏭️   already has ${count} items — skipping\n`)
      continue
    }

    const items = await def.items()
    console.log(`    📊  ${items.length} items fetched`)
    await insertBatched(listId, items)
    console.log()
  }

  console.log('🎉  Seeding complete!')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
