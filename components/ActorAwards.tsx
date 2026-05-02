'use client'

import { useEffect, useState } from 'react'

interface AwardEntry {
  award_name:     string
  award_category: string | null
  year:           number | null
  won:            boolean
}

interface AwardGroup {
  key:    string
  name:   string
  emoji:  string
  wins:   number
  noms:   number
  years:  number[]
}

// Map raw Wikidata award labels to display groups
const AWARD_MAP: { match: string; key: string; name: string; emoji: string }[] = [
  { match: 'Academy Award',     key: 'oscar',  name: 'Oscar',          emoji: '🏆' },
  { match: 'Oscar',             key: 'oscar',  name: 'Oscar',          emoji: '🏆' },
  { match: 'Golden Globe',      key: 'gg',     name: 'Golden Globe',   emoji: '🌟' },
  { match: 'BAFTA',             key: 'bafta',  name: 'BAFTA',          emoji: '🎭' },
  { match: 'Screen Actors',     key: 'sag',    name: 'SAG Award',      emoji: '🎬' },
  { match: 'Emmy',              key: 'emmy',   name: 'Emmy',           emoji: '📺' },
  { match: 'Cannes',            key: 'cannes', name: 'Cannes',         emoji: '🌴' },
  { match: 'César',             key: 'cesar',  name: 'César Award',    emoji: '🥇' },
]

function groupAwards(entries: AwardEntry[]): AwardGroup[] {
  const map = new Map<string, AwardGroup>()

  for (const e of entries) {
    const def = AWARD_MAP.find(a => e.award_name.toLowerCase().includes(a.match.toLowerCase()))
    if (!def) continue

    if (!map.has(def.key)) {
      map.set(def.key, { key: def.key, name: def.name, emoji: def.emoji, wins: 0, noms: 0, years: [] })
    }
    const g = map.get(def.key)!
    if (e.won) {
      g.wins++
      if (e.year && !g.years.includes(e.year)) g.years.push(e.year)
    } else {
      g.noms++
    }
  }

  return [...map.values()]
    .filter(g => g.wins > 0 || g.noms > 0)
    .sort((a, b) => b.wins - a.wins || b.noms - a.noms)
}

function Skeleton() {
  return (
    <section className="mb-10">
      <div className="h-6 w-52 bg-[#1C1C27] rounded mb-4 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 h-32" />
        ))}
      </div>
    </section>
  )
}

export default function ActorAwards({ tmdbId }: { tmdbId: number }) {
  const [groups,  setGroups]  = useState<AwardGroup[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/actor-awards/${tmdbId}`)
      .then(r => r.json())
      .then(d => {
        const grouped = groupAwards(d.awards ?? [])
        setGroups(grouped)
      })
      .catch(() => setGroups([]))
      .finally(() => setLoading(false))
  }, [tmdbId])

  if (loading)                         return <Skeleton />
  if (!groups || groups.length === 0)  return null

  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold mb-4">Premios y reconocimientos</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {groups.map(g => (
          <div
            key={g.key}
            className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 flex flex-col items-center gap-1 text-center hover:border-[#FFFD02]/40 transition-colors"
          >
            <span style={{ fontSize: 32 }}>{g.emoji}</span>

            <p className="text-xs text-[#A0A0B0] font-medium leading-tight">{g.name}</p>

            {g.wins > 0 && (
              <p className="text-2xl font-black leading-none" style={{ color: '#FFFD02' }}>
                {g.wins}
                <span className="text-xs font-normal text-[#A0A0B0] ml-1">
                  {g.wins === 1 ? 'victoria' : 'victorias'}
                </span>
              </p>
            )}

            {g.noms > 0 && (
              <p className="text-xs text-[#A0A0B0]">
                {g.noms} {g.noms === 1 ? 'nominación' : 'nominaciones'}
              </p>
            )}

            {g.years.length > 0 && (
              <p className="text-[10px] text-zinc-600 mt-0.5">
                {g.years.sort((a, b) => a - b).join(' · ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
