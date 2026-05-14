'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { OMDBRatings } from '@/lib/omdb'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  tmdbScore: number
  tmdbVotes: number
  omdb: OMDBRatings
  mediaId: number
  mediaType: 'movie' | 'tv'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(pct: number): string {
  if (pct < 0.5) return '#EF4444'
  if (pct < 0.7) return '#FFFD02'
  return '#22C55E'
}

// ── Score circle (SVG arc + centered number) ──────────────────────────────────

function ScoreCircle({
  score, pct, color, label, sub, size = 72,
}: {
  score: string; pct: number; color: string
  label: string; sub?: string; size?: number
}) {
  const stroke = 5
  const r      = (size - stroke) / 2
  const circ   = 2 * Math.PI * r
  const dash   = Math.max(0, Math.min(1, pct)) * circ
  const c      = size / 2

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        {/* SVG circles */}
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0">
          {/* Track */}
          <circle cx={c} cy={c} r={r} fill="none" stroke="#1C1C27" strokeWidth={stroke} />
          {/* Progress arc — starts at 12 o'clock */}
          <circle
            cx={c} cy={c} r={r} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            transform={`rotate(-90 ${c} ${c})`}
          />
        </svg>
        {/* Score label centered over the SVG */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-bold text-white tabular-nums" style={{ fontSize: size > 60 ? 15 : 12 }}>
            {score}
          </span>
        </div>
      </div>
      <p className="text-[11px] font-semibold text-[#A0A0B0] text-center leading-tight max-w-[80px]">{label}</p>
      {sub && <p className="text-[10px] text-zinc-600 text-center">{sub}</p>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RatingsSection({ tmdbScore, tmdbVotes, omdb, mediaId, mediaType }: Props) {
  const { imdbScore, imdbVotes, rtCritics, metacritic } = omdb
  const [userRating, setUserRating] = useState<number | null>(null)

  // Load user's own rating client-side
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase
        .from('ratings')
        .select('rating')
        .eq('user_id', data.user.id)
        .eq('media_id', mediaId)
        .eq('media_type', mediaType)
        .maybeSingle()
        .then(({ data: r }) => { if (r?.rating) setUserRating(r.rating) })
    })
  }, [mediaId, mediaType])

  const imdbNum      = imdbScore ? parseFloat(imdbScore) : null
  const rtNum        = rtCritics ? parseInt(rtCritics)   : null
  const metacriticNum = metacritic

  const fmtVotes = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M votos`
    : n >= 1_000   ? `${Math.round(n / 1_000)}K votos`
    :                `${n} votos`

  const hasAnyRating =
    tmdbScore > 0 ||
    (imdbNum !== null && !isNaN(imdbNum) && imdbNum > 0) ||
    (rtNum !== null && !isNaN(rtNum)) ||
    metacriticNum !== null
  if (!hasAnyRating) return null

  return (
    <div className="mt-8">
      <h2 className="text-lg font-bold mb-5 text-zinc-200">Puntajes</h2>
      <div className="flex flex-wrap gap-6 items-start">

        {/* TMDB */}
        {tmdbScore > 0 && (
          <ScoreCircle
            score={tmdbScore.toFixed(1)}
            pct={tmdbScore / 10}
            color={scoreColor(tmdbScore / 10)}
            label="TMDB"
            sub={tmdbVotes > 0 ? fmtVotes(tmdbVotes) : undefined}
          />
        )}

        {/* IMDb */}
        {imdbNum !== null && !isNaN(imdbNum) && imdbNum > 0 && (
          <ScoreCircle
            score={imdbScore!}
            pct={imdbNum / 10}
            color={scoreColor(imdbNum / 10)}
            label="IMDb"
            sub={imdbVotes ? imdbVotes.replace(/,/g, '.') + ' votos' : undefined}
          />
        )}

        {/* Rotten Tomatoes */}
        {rtNum !== null && !isNaN(rtNum) && (
          <ScoreCircle
            score={rtCritics!}
            pct={rtNum / 100}
            color={rtNum >= 60 ? '#22C55E' : '#EF4444'}
            label="Rotten Tomatoes"
            sub="Críticos"
          />
        )}

        {/* Metacritic */}
        {metacriticNum !== null && (
          <ScoreCircle
            score={String(metacriticNum)}
            pct={metacriticNum / 100}
            color={metacriticNum >= 61 ? '#22C55E' : metacriticNum >= 40 ? '#FFFD02' : '#EF4444'}
            label="Metacritic"
            sub="/100"
          />
        )}

        {/* User's personal rating — shown once loaded */}
        {userRating !== null && userRating > 0 && (
          <>
            <div className="w-px h-16 bg-[#2A2A3A] self-center hidden sm:block" />
            <ScoreCircle
              score={userRating.toFixed(1)}
              pct={userRating / 5}
              color={scoreColor(userRating / 5)}
              label="Tu rating"
              sub="/5"
              size={60}
            />
          </>
        )}
      </div>
    </div>
  )
}
