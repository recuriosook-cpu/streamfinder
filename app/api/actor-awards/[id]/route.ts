import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

// Award keywords to keep (filter out irrelevant Wikidata awards)
const RELEVANT_AWARDS = [
  'Academy Award', 'Oscar',
  'Golden Globe',
  'BAFTA',
  'Screen Actors Guild', 'SAG Award',
  'Primetime Emmy', 'Emmy',
  'Cannes',
  'César',
]

function isRelevant(label: string): boolean {
  return RELEVANT_AWARDS.some(k => label.toLowerCase().includes(k.toLowerCase()))
}

async function fetchWikidataAwards(actorName: string) {
  const query = `
SELECT ?awardLabel ?categoryLabel ?year WHERE {
  ?person rdfs:label "${actorName.replace(/"/g, '\\"')}"@en .
  ?person p:P166 ?statement .
  ?statement ps:P166 ?award .
  OPTIONAL { ?statement pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
  OPTIONAL { ?statement pq:P1686 ?category }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT 50`.trim()

  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'Glynbox/1.0',
      },
    })
    clearTimeout(timeout)
    if (!res.ok) return []
    const json = await res.json()
    return json.results?.bindings ?? []
  } catch {
    clearTimeout(timeout)
    return []
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const tmdbId = parseInt(id)
  if (isNaN(tmdbId)) return NextResponse.json({ awards: [] })

  const supabase = createServerClient()

  // 1 — Return cached data if available
  const { data: cached } = await supabase
    .from('person_awards')
    .select('award_name, award_category, year, won')
    .eq('tmdb_id', tmdbId)
    .order('year', { ascending: false })

  if (cached && cached.length > 0) {
    return NextResponse.json({ awards: cached, cached: true })
  }

  // 2 — Fetch actor name from TMDB
  const tmdbRes = await fetch(
    `https://api.themoviedb.org/3/person/${tmdbId}?api_key=${TMDB_KEY}`,
    { next: { revalidate: 3600 } },
  )
  if (!tmdbRes.ok) return NextResponse.json({ awards: [] })
  const person = await tmdbRes.json()
  const actorName: string = person.name
  if (!actorName) return NextResponse.json({ awards: [] })

  // 3 — Fetch from Wikidata
  const bindings = await fetchWikidataAwards(actorName)
  if (bindings.length === 0) return NextResponse.json({ awards: [] })

  // 4 — Filter relevant awards and build rows
  type AwardRow = {
    tmdb_id: number
    person_name: string
    award_name: string
    award_category: string | null
    year: number | null
    wikidata_id: string
    won: boolean
  }

  const rows: AwardRow[] = []
  for (const b of bindings) {
    const label = b.awardLabel?.value ?? ''
    if (!label || !isRelevant(label)) continue
    rows.push({
      tmdb_id:       tmdbId,
      person_name:   actorName,
      award_name:    label,
      award_category: b.categoryLabel?.value ?? null,
      year:          b.year?.value ? parseInt(b.year.value) : null,
      wikidata_id:   `Q${tmdbId}_${label}`.replace(/\s+/g, '_'),
      won:           true, // P166 = "award received" = won
    })
  }

  if (rows.length === 0) return NextResponse.json({ awards: [] })

  // 5 — Cache in Supabase (fire-and-forget, don't block response)
  supabase.from('person_awards').insert(rows).then(({ error }) => {
    if (error) console.error('[actor-awards] insert error:', error.message)
  })

  // 6 — Return
  const awards = rows.map(r => ({
    award_name:     r.award_name,
    award_category: r.award_category,
    year:           r.year,
    won:            r.won,
  }))

  return NextResponse.json({ awards }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
  })
}
