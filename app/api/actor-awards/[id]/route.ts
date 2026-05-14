import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY

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

function isNomination(label: string): boolean {
  const l = label.toLowerCase()
  return l.includes('nominat') || l.includes('nominee')
}

async function fetchWikidataAwards(actorName: string) {
  const escaped = actorName.replace(/"/g, '\\"')
  // Fetch wins (P166) and also the work for which they received it (P1686)
  const query = `
SELECT ?awardLabel ?workLabel ?year WHERE {
  ?person rdfs:label "${escaped}"@en .
  ?person p:P166 ?statement .
  ?statement ps:P166 ?award .
  OPTIONAL { ?statement pq:P585 ?date . BIND(YEAR(?date) AS ?year) }
  OPTIONAL { ?statement pq:P1686 ?work }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
} LIMIT 100`.trim()

  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'Glynbox/1.0' },
    })
    clearTimeout(timer)
    if (!res.ok) return []
    const json = await res.json()
    return json.results?.bindings ?? []
  } catch {
    clearTimeout(timer)
    return []
  }
}

export interface AwardEntry {
  award_name:    string
  award_category: string | null
  work_title:    string | null
  year:          number | null
  won:           boolean
  nominated:     boolean
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
    // Shape into AwardEntry (work_title/nominated not in cache yet)
    const awards: AwardEntry[] = cached.map(r => ({
      award_name:     r.award_name,
      award_category: r.award_category,
      work_title:     null,
      year:           r.year,
      won:            r.won ?? true,
      nominated:      !(r.won ?? true),
    }))
    return NextResponse.json({ awards, cached: true })
  }

  // 2 — Get actor name from TMDB
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

  // 4 — Build entries
  const awards: AwardEntry[] = []
  for (const b of bindings) {
    const label = b.awardLabel?.value ?? ''
    if (!label || !isRelevant(label)) continue
    const nom = isNomination(label)
    awards.push({
      award_name:     label,
      award_category: null,     // label already encodes category
      work_title:     b.workLabel?.value ?? null,
      year:           b.year?.value ? parseInt(b.year.value) : null,
      won:            !nom,
      nominated:      nom,
    })
  }

  if (awards.length === 0) return NextResponse.json({ awards: [] })

  // 5 — Cache in Supabase with existing columns only (fire-and-forget)
  const rows = awards.map((a, i) => ({
    tmdb_id:       tmdbId,
    person_name:   actorName,
    award_name:    a.award_name,
    award_category: a.award_category,
    year:          a.year,
    wikidata_id:   `Q${tmdbId}_${i}`,
    won:           a.won,
  }))
  ;(async () => {
    try {
      const { error } = await supabase.from('person_awards').insert(rows)
      if (error) console.error('[actor-awards] cache error:', error.message)
    } catch (err) {
      console.error('[actor-awards] cache error:', err)
    }
  })()

  return NextResponse.json({ awards }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
  })
}
