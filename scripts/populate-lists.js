// scripts/populate-lists.js
// Populates official Glynbox lists with TMDB data.
// Run: node scripts/populate-lists.js

const SUPABASE_URL    = 'https://ddoqsdgiggkhbsulxncs.supabase.co'
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_QZmx3kF-wZRM4l8oKYCuKw_HZ4e1Dqq'
const TMDB_KEY        = 'acb96af19f5ef54f650ed3a6149dbb70'
const FERLAGEOK_ID    = '6c76de2c-8600-4fb0-bc62-75a1746f40b9'

const SB_HEADERS = {
  apikey:          SUPABASE_KEY,
  Authorization:   `Bearer ${SUPABASE_KEY}`,
  'Content-Type':  'application/json',
}

// ── Supabase REST helpers ─────────────────────────────────────────────────────

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SB_HEADERS })
  const text = await res.text()
  if (!res.ok) throw new Error(`Supabase GET ${path} → ${res.status}: ${text}`)
  return JSON.parse(text)
}

async function sbPost(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  })
  const text = await res.text()
  if (!res.ok) {
    if (res.status === 401 || (text && text.includes('row-level security'))) {
      console.error('\n❌  RLS is blocking anonymous inserts on list_items.')
      console.error('\n   Option A — Run this SQL in Supabase Dashboard → SQL Editor:')
      console.error('   CREATE POLICY "temp_seed_anon_insert" ON list_items')
      console.error('     FOR INSERT TO anon WITH CHECK (true);')
      console.error('   Then re-run this script. Afterwards drop the policy:')
      console.error('   DROP POLICY "temp_seed_anon_insert" ON list_items;\n')
      console.error('   Option B — Provide your service role key:')
      console.error('   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/populate-lists.js\n')
      process.exit(1)
    }
    throw new Error(`Supabase POST ${table} → ${res.status}: ${text}`)
  }
}

// ── TMDB helpers ──────────────────────────────────────────────────────────────

async function tmdbGet(path) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://api.themoviedb.org/3${path}${sep}api_key=${TMDB_KEY}`)
  if (!res.ok) throw new Error(`TMDB ${res.status}: ${path}`)
  return res.json()
}

async function fetchPages(endpoint, pages) {
  const results = []
  for (let p = 1; p <= pages; p++) {
    const sep = endpoint.includes('?') ? '&' : '?'
    const d = await tmdbGet(`${endpoint}${sep}language=es-AR&page=${p}`)
    results.push(...(d.results || []))
    if (!d.total_pages || d.total_pages < p + 1) break
  }
  return results
}

// ── List definitions ──────────────────────────────────────────────────────────

const LIST_DEFS = [
  {
    titleMatch: '250 Mejores películas',
    async fetchItems() {
      console.log('  → TMDB /movie/top_rated (13 pages)…')
      const raw = await fetchPages('/movie/top_rated', 13)
      return raw.slice(0, 250).map((m, i) => ({
        media_id: m.id, media_type: 'movie',
        title: m.title || '', poster_path: m.poster_path || null, position: i,
      }))
    },
  },
  {
    titleMatch: '250 Mejores series',
    async fetchItems() {
      console.log('  → TMDB /tv/top_rated (13 pages)…')
      const raw = await fetchPages('/tv/top_rated', 13)
      return raw.slice(0, 250).map((s, i) => ({
        media_id: s.id, media_type: 'tv',
        title: s.name || '', poster_path: s.poster_path || null, position: i,
      }))
    },
  },
  {
    titleMatch: '100 películas',
    async fetchItems() {
      console.log('  → TMDB /movie/top_rated filtered vote_count≥10000 (10 pages)…')
      const raw = await fetchPages('/movie/top_rated', 10)
      const filtered = raw.filter(m => (m.vote_count || 0) >= 10000)
      return filtered.slice(0, 100).map((m, i) => ({
        media_id: m.id, media_type: 'movie',
        title: m.title || '', poster_path: m.poster_path || null, position: i,
      }))
    },
  },
  {
    titleMatch: 'pareja',
    async fetchItems() {
      console.log('  → TMDB /discover/movie romance+comedy (4 pages)…')
      const raw = await fetchPages(
        '/discover/movie?with_genres=10749%2C35&sort_by=vote_average.desc&vote_count.gte=500',
        4,
      )
      return raw.slice(0, 50).map((m, i) => ({
        media_id: m.id, media_type: 'movie',
        title: m.title || '', poster_path: m.poster_path || null, position: i,
      }))
    },
  },
  {
    titleMatch: 'latinoamericano',
    async fetchItems() {
      console.log('  → TMDB /discover/movie Spanish language (5 pages)…')
      const raw = await fetchPages(
        '/discover/movie?with_original_language=es&sort_by=vote_average.desc&vote_count.gte=500',
        5,
      )
      return raw.slice(0, 50).map((m, i) => ({
        media_id: m.id, media_type: 'movie',
        title: m.title || '', poster_path: m.poster_path || null, position: i,
      }))
    },
  },
]

// ── Insert helpers ─────────────────────────────────────────────────────────────

async function insertBatched(listId, items) {
  const BATCH = 100
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH).map(it => ({ list_id: listId, ...it }))
    await sbPost('list_items', batch)
    process.stdout.write(`  ✓ inserted ${i + 1}–${Math.min(i + BATCH, items.length)}\r`)
  }
  console.log()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Fetch Ferlageok's lists
  const lists = await sbGet(
    `lists?select=id,title&user_id=eq.${FERLAGEOK_ID}&is_public=eq.true`
  )
  console.log(`\nFound ${lists.length} list(s) for Ferlageok:`)
  lists.forEach(l => console.log(`  [${l.id}] ${l.title}`))

  // 2. Process each definition
  for (const def of LIST_DEFS) {
    const list = lists.find(l =>
      l.title.toLowerCase().includes(def.titleMatch.toLowerCase())
    )
    if (!list) {
      console.log(`\n⚠  No list matching "${def.titleMatch}" — skipping`)
      continue
    }

    console.log(`\n📋  "${list.title}"`)

    // Check existing items
    const existing = await sbGet(
      `list_items?select=id&list_id=eq.${list.id}&limit=1`
    )
    if (existing.length > 0) {
      console.log('  ⏭  Already has items — skipping')
      continue
    }

    const items = await def.fetchItems()
    console.log(`  📊  ${items.length} items fetched`)
    await insertBatched(list.id, items)
    console.log(`  ✅  Done`)
  }

  console.log('\n🎉  All lists populated!')
}

main().catch(err => {
  console.error('\n❌  Fatal error:', err.message || err)
  process.exit(1)
})
