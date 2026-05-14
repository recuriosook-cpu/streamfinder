'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface AwardEntry {
  award_name:    string
  award_category: string | null
  work_title:    string | null
  year:          number | null
  won:           boolean
  nominated:     boolean
}

interface AwardGroup {
  key:     string
  name:    string
  emoji:   string
  wins:    number
  noms:    number
  years:   number[]
  entries: AwardEntry[]
}

const AWARD_MAP: { match: string; key: string; name: string; emoji: string }[] = [
  { match: 'Academy Award', key: 'oscar',  name: 'Oscar',        emoji: '🏆' },
  { match: 'Oscar',         key: 'oscar',  name: 'Oscar',        emoji: '🏆' },
  { match: 'Golden Globe',  key: 'gg',     name: 'Golden Globe', emoji: '🌟' },
  { match: 'BAFTA',         key: 'bafta',  name: 'BAFTA',        emoji: '🎭' },
  { match: 'Screen Actors', key: 'sag',    name: 'SAG Award',    emoji: '🎬' },
  { match: 'Emmy',          key: 'emmy',   name: 'Emmy',         emoji: '📺' },
  { match: 'Cannes',        key: 'cannes', name: 'Cannes',       emoji: '🌴' },
  { match: 'César',         key: 'cesar',  name: 'César Award',  emoji: '🥇' },
]

const AWARD_IMAGES: Record<string, string> = {
  'oscar':  '/awards/oscar.png',
  'gg':     '/awards/golden-globe.png',
  'bafta':  '/awards/bafta.png',
  'sag':    '/awards/sag.png',
  'emmy':   '/awards/emmy.png',
}

function groupAwards(entries: AwardEntry[]): AwardGroup[] {
  const map = new Map<string, AwardGroup>()

  for (const e of entries) {
    const def = AWARD_MAP.find(a => e.award_name.toLowerCase().includes(a.match.toLowerCase()))
    if (!def) continue

    if (!map.has(def.key)) {
      map.set(def.key, { key: def.key, name: def.name, emoji: def.emoji, wins: 0, noms: 0, years: [], entries: [] })
    }
    const g = map.get(def.key)!
    g.entries.push(e)
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

// ── Modal ──────────────────────────────────────────────────────────────────

function AwardModal({ group, onClose }: { group: AwardGroup; onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const sorted = [...group.entries].sort((a, b) => (b.year ?? 0) - (a.year ?? 0))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-overlay"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl modal-content">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A3A]">
          <div className="flex items-center gap-3">
            {AWARD_IMAGES[group.key] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={AWARD_IMAGES[group.key]} alt={group.name} style={{ width: 32, height: 32, objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: 28 }}>{group.emoji}</span>
            )}
            <div>
              <h3 className="text-lg font-bold text-white">{group.name}</h3>
              <p className="text-xs text-[#A0A0B0]">
                {group.wins > 0 && `${group.wins} ${group.wins === 1 ? 'victoria' : 'victorias'}`}
                {group.wins > 0 && group.noms > 0 && ' · '}
                {group.noms > 0 && `${group.noms} ${group.noms === 1 ? 'nominación' : 'nominaciones'}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1C1C27] hover:bg-zinc-700 text-[#A0A0B0] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 divide-y divide-[#2A2A3A]">
          {sorted.map((e, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-3.5">
              {/* Year */}
              <span className="text-sm font-bold text-[#A0A0B0] w-10 shrink-0 tabular-nums pt-0.5">
                {e.year ?? '—'}
              </span>

              {/* Info — work_title first (more recognisable), award category second */}
              <div className="flex-1 min-w-0">
                {e.work_title && (
                  <p className="text-sm font-semibold text-[#FFFD02] leading-tight truncate mb-0.5">
                    {e.work_title}
                  </p>
                )}
                <p className={`leading-snug ${e.work_title ? 'text-xs text-[#A0A0B0]' : 'text-sm text-white'}`}>
                  {e.award_name
                    .replace(/Academy Award/gi, '')
                    .replace(/Golden Globe Award/gi, '')
                    .replace(/BAFTA/gi, '')
                    .replace(/^[\s\-–—for]+/i, '')
                    .trim() || e.award_name}
                </p>
              </div>

              {/* Badge */}
              <span
                className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full self-start mt-0.5"
                style={e.won
                  ? { backgroundColor: '#FFFD02', color: '#000' }
                  : { backgroundColor: '#2A2A3A', color: '#A0A0B0' }}
              >
                {e.won ? 'Ganó' : 'Nom.'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <section className="mb-10">
      <div className="h-6 w-52 bg-[#1C1C27] rounded mb-4 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 h-36" />
        ))}
      </div>
    </section>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ActorAwards({ tmdbId }: { tmdbId: number }) {
  const [groups,    setGroups]    = useState<AwardGroup[] | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [openGroup, setOpenGroup] = useState<AwardGroup | null>(null)

  useEffect(() => {
    fetch(`/api/actor-awards/${tmdbId}`)
      .then(r => r.json())
      .then(d => setGroups(groupAwards(d.awards ?? [])))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false))
  }, [tmdbId])

  if (loading)                        return <Skeleton />
  if (!groups || groups.length === 0) return null

  return (
    <>
      <section className="mb-10">
        <h2 className="text-xl font-bold mb-4">Premios y reconocimientos</h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {groups.map(g => (
            <button
              key={g.key}
              onClick={() => setOpenGroup(g)}
              className="bg-[#13131A] border border-[#2A2A3A] rounded-xl p-4 flex flex-col items-center gap-1 text-center hover:border-[#FFFD02]/60 hover:bg-[#1C1C27] transition-all cursor-pointer active:scale-95"
            >
              {AWARD_IMAGES[g.key] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={AWARD_IMAGES[g.key]} alt={g.name} style={{ width: 64, height: 64, objectFit: 'contain', margin: '0 auto' }} />
              ) : (
                <span style={{ fontSize: 32 }}>{g.emoji}</span>
              )}

              <p className="text-xs text-[#A0A0B0] font-medium leading-tight">{g.name}</p>

              {/* Wins + noms on same line */}
              <p className="text-xs font-semibold mt-0.5">
                {g.wins > 0 && (
                  <span style={{ color: '#FFFD02' }}>
                    {g.wins} {g.wins === 1 ? 'victoria' : 'victorias'}
                  </span>
                )}
                {g.wins > 0 && g.noms > 0 && (
                  <span className="text-[#2A2A3A] mx-1">·</span>
                )}
                {g.noms > 0 && (
                  <span className="text-[#A0A0B0]">
                    {g.noms} nom.
                  </span>
                )}
              </p>

              {g.years.length > 0 && (
                <p className="text-[10px] text-zinc-600">
                  {g.years.sort((a, b) => a - b).join(' · ')}
                </p>
              )}

              <p className="text-[10px] text-zinc-700 mt-0.5">Ver detalles →</p>
            </button>
          ))}
        </div>
      </section>

      {openGroup && (
        <AwardModal group={openGroup} onClose={() => setOpenGroup(null)} />
      )}
    </>
  )
}
