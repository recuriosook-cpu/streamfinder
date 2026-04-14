import type { OMDBRatings } from '@/lib/omdb'

interface Props {
  tmdbScore: number
  tmdbVotes: number
  omdb: OMDBRatings
}

// ── Inline SVG logos ──────────────────────────────────────────────

function TMDBLogo() {
  return (
    <div className="flex items-center gap-1.5">
      {/* TMDB brand mark: two overlapping circles */}
      <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
        <rect width="32" height="20" rx="4" fill="#032541" />
        <circle cx="10" cy="10" r="6" fill="none" stroke="#01B4E4" strokeWidth="2.5" />
        <circle cx="22" cy="10" r="6" fill="none" stroke="#90CEA1" strokeWidth="2.5" />
        {/* overlap tint */}
        <path d="M16 5.1 a6 6 0 0 1 0 9.8 a6 6 0 0 1 0-9.8z" fill="#032541" />
      </svg>
      <span className="text-xs font-bold text-[#01B4E4] tracking-wider">TMDB</span>
    </div>
  )
}

function IMDbLogo() {
  return (
    <div className="flex items-center">
      <div className="bg-[#F5C518] rounded px-2 py-0.5">
        <span className="text-black font-black text-sm tracking-tight leading-none">IMDb</span>
      </div>
    </div>
  )
}

function RTLogo({ isFresh }: { isFresh: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {isFresh ? (
        /* Fresh tomato */
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          {/* stem */}
          <path d="M11 1 C11 1 9.5 4 11 5 C12.5 4 11 1 11 1Z" fill="#3a7c3a" />
          <path d="M11 3 C10 2 8 2.5 8.5 4" stroke="#3a7c3a" strokeWidth="1" strokeLinecap="round" />
          <path d="M11 3 C12 2 14 2.5 13.5 4" stroke="#3a7c3a" strokeWidth="1" strokeLinecap="round" />
          {/* body */}
          <circle cx="11" cy="13" r="8" fill="#FA320A" />
          {/* highlight */}
          <ellipse cx="8.5" cy="10.5" rx="2" ry="1.5" fill="rgba(255,255,255,0.25)" transform="rotate(-20 8.5 10.5)" />
        </svg>
      ) : (
        /* Rotten splat */
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="8" fill="#7c6a22" />
          <ellipse cx="11" cy="11" rx="5" ry="4" fill="#a38a2e" />
          <circle cx="8.5" cy="9.5" rx="1.2" ry="1" fill="rgba(0,0,0,0.3)" />
        </svg>
      )}
      <span className={`text-[10px] font-bold uppercase tracking-wider ${isFresh ? 'text-[#FA320A]' : 'text-zinc-500'}`}>
        {isFresh ? 'Fresh' : 'Rotten'}
      </span>
    </div>
  )
}

function MetacriticLogo({ score }: { score: number }) {
  const bg = score >= 61 ? '#6ac259' : score >= 40 ? '#ffbd3f' : '#ff2a2a'
  const textColor = score >= 40 ? '#000' : '#fff'
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-8 h-8 rounded flex items-center justify-center font-black text-sm leading-none"
        style={{ background: bg, color: textColor }}
      >
        {score}
      </div>
      <span className="text-xs font-semibold text-zinc-400">Metacritic</span>
    </div>
  )
}

// ── Rating card ───────────────────────────────────────────────────

interface CardProps {
  logo: React.ReactNode
  score: string
  scoreLabel?: string
  sub?: string
}

function RatingCard({ logo, score, scoreLabel, sub }: CardProps) {
  return (
    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-5 py-4 flex flex-col gap-2 min-w-[120px]">
      <div>{logo}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white leading-none">{score}</span>
        {scoreLabel && <span className="text-sm text-zinc-400">{scoreLabel}</span>}
      </div>
      {sub && <p className="text-[11px] text-zinc-500 leading-tight">{sub}</p>}
    </div>
  )
}

// ── Main section ─────────────────────────────────────────────────

export default function RatingsSection({ tmdbScore, tmdbVotes, omdb }: Props) {
  const { imdbScore, imdbVotes, rtCritics, metacritic } = omdb

  // Parse RT score for fresh/rotten determination
  const rtNum = rtCritics ? parseInt(rtCritics) : null
  const isFresh = rtNum !== null && rtNum >= 60

  // Format TMDB votes (e.g. 1234567 → "1.2M")
  const formattedTMDBVotes =
    tmdbVotes >= 1_000_000
      ? `${(tmdbVotes / 1_000_000).toFixed(1)}M votos`
      : tmdbVotes >= 1_000
      ? `${Math.round(tmdbVotes / 1_000)}K votos`
      : `${tmdbVotes} votos`

  // Format IMDb votes
  const formattedIMDbVotes = imdbVotes
    ? imdbVotes.replace(/,/g, '.') + ' votos'
    : undefined

  const hasAnyRating = tmdbScore > 0 || imdbScore || rtCritics || metacritic !== null
  if (!hasAnyRating) return null

  return (
    <div className="mt-8">
      <h2 className="text-lg font-bold mb-3 text-zinc-200">Puntajes</h2>
      <div className="flex flex-wrap gap-3">
        {/* TMDB */}
        {tmdbScore > 0 && (
          <RatingCard
            logo={<TMDBLogo />}
            score={tmdbScore.toFixed(1)}
            scoreLabel="/10"
            sub={tmdbVotes > 0 ? formattedTMDBVotes : undefined}
          />
        )}

        {/* IMDb */}
        {imdbScore && (
          <RatingCard
            logo={<IMDbLogo />}
            score={imdbScore}
            scoreLabel="/10"
            sub={formattedIMDbVotes}
          />
        )}

        {/* Rotten Tomatoes — critics only (OMDB free tier) */}
        {rtCritics && rtNum !== null && (
          <RatingCard
            logo={<RTLogo isFresh={isFresh} />}
            score={rtCritics}
            sub="Críticos"
          />
        )}

        {/* Metacritic */}
        {metacritic !== null && (
          <RatingCard
            logo={<MetacriticLogo score={metacritic} />}
            score={String(metacritic)}
            scoreLabel="/100"
          />
        )}
      </div>
    </div>
  )
}
