/**
 * One-time seed: fetches 2000 popular persons from TMDB and stores their
 * birthdays in the Supabase celebrity_birthdays table.
 *
 * Prerequisites:
 *   Get the service role key from:
 *   Supabase Dashboard → Project Settings → API → service_role (secret)
 *
 * Usage (from project root, in Git Bash):
 *   SUPABASE_SERVICE_ROLE_KEY=your_key_here node scripts/seed-celebrity-birthdays.mjs
 *
 * Safe to run multiple times — uses upsert on tmdb_id.
 */

import { createClient } from '@supabase/supabase-js'

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL  = 'https://ddoqsdgiggkhbsulxncs.supabase.co'
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const TMDB_KEY      = 'acb96af19f5ef54f650ed3a6149dbb70'
const TOTAL_PAGES   = 100   // 100 pages × 20 = 2000 persons
const PAGE_BATCH    = 5     // popular-page requests in parallel
const DETAIL_BATCH  = 10    // person-detail requests in parallel
const DETAIL_DELAY  = 100   // ms between detail batches

if (!SERVICE_KEY) {
  console.error('\n❌  SUPABASE_SERVICE_ROLE_KEY is not set.')
  console.error('    Get it from: Supabase Dashboard → Project Settings → API → service_role (secret)')
  console.error('    Usage: SUPABASE_SERVICE_ROLE_KEY=your_key_here node scripts/seed-celebrity-birthdays.mjs\n')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchPopularPage(page) {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/person/popular?api_key=${TMDB_KEY}&language=es-AR&page=${page}`
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch { return [] }
}

async function fetchPersonDetail(id) {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/person/${id}?api_key=${TMDB_KEY}&language=es-AR`
    )
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// Fetch person details for a list of persons (batches of DETAIL_BATCH with delay)
async function fetchDetails(persons) {
  const results = []
  for (let i = 0; i < persons.length; i += DETAIL_BATCH) {
    if (i > 0) await sleep(DETAIL_DELAY)
    const batch = await Promise.all(
      persons.slice(i, i + DETAIL_BATCH).map(p => fetchPersonDetail(p.id))
    )
    results.push(...batch)
  }
  return results
}

function toRow(detail) {
  if (!detail?.birthday || !detail?.profile_path) return null
  const parts = detail.birthday.split('-')
  if (parts.length !== 3) return null
  const [, mm, dd] = parts
  return {
    tmdb_id:      detail.id,
    name:         detail.name,
    birthday:     detail.birthday,
    birthday_md:  `${mm}-${dd}`,
    deathday:     detail.deathday ?? null,
    profile_path: detail.profile_path,
    known_for:    detail.known_for_department ?? null,
    popularity:   detail.popularity ?? 0,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

let totalUpserted = 0

for (let start = 1; start <= TOTAL_PAGES; start += PAGE_BATCH) {
  const pageNums = Array.from(
    { length: Math.min(PAGE_BATCH, TOTAL_PAGES - start + 1) },
    (_, i) => start + i
  )

  // Fetch this batch of popular pages in parallel
  const pages = await Promise.all(pageNums.map(fetchPopularPage))

  // Deduplicate persons across the page batch
  const seen    = new Set()
  const persons = []
  for (const page of pages) {
    for (const p of page) {
      if (!seen.has(p.id)) { seen.add(p.id); persons.push(p) }
    }
  }

  // Fetch details for all persons in this batch
  const details = await fetchDetails(persons)
  const rows    = details.map(toRow).filter(Boolean)

  // Upsert to Supabase
  if (rows.length > 0) {
    const { error } = await supabase
      .from('celebrity_birthdays')
      .upsert(rows, { onConflict: 'tmdb_id' })

    if (error) {
      console.error(`  ⚠️  Upsert error (pages ${pageNums[0]}-${pageNums.at(-1)}):`, error.message)
    } else {
      totalUpserted += rows.length
    }
  }

  const lastPage = pageNums.at(-1)
  console.log(`  Páginas ${String(pageNums[0]).padStart(3)}-${String(lastPage).padStart(3)} ✓  |  con birthday: ${rows.length}  |  total acumulado: ${totalUpserted}`)
}

console.log(`\n✅  Seed completo. ${totalUpserted} personas con birthday cargadas en celebrity_birthdays.\n`)
