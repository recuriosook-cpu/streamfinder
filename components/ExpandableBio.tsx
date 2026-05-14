'use client'

import { useState } from 'react'

const LIMIT = 400

export default function ExpandableBio({ bio }: { bio: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = bio.length > LIMIT
  const text = !expanded && isLong ? bio.slice(0, LIMIT).trimEnd() + '…' : bio

  return (
    <div>
      <p className="text-zinc-300 leading-relaxed text-sm">{text}</p>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-2 text-xs text-[#A0A0B0] hover:text-white transition-colors flex items-center gap-1"
        >
          {expanded ? 'Leer menos ↑' : 'Leer más ↓'}
        </button>
      )}
    </div>
  )
}
