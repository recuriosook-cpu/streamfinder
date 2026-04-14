import type { ParsedAwards } from '@/lib/omdb'
import { Trophy, Star } from 'lucide-react'

interface Props {
  awards: ParsedAwards
}

export default function AwardsSection({ awards }: Props) {
  const { entries } = awards

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-4">Premios</h2>

      <div className="flex flex-col gap-2">
        {entries.map(entry => {
          const hasWins = entry.wins > 0
          const hasNoms = entry.nominations > 0

          return (
            <div
              key={entry.name}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors ${
                entry.isOscar
                  ? 'bg-yellow-500/10 border-yellow-500/25'
                  : hasWins
                  ? 'bg-zinc-800/60 border-zinc-700/50'
                  : 'bg-zinc-800/40 border-zinc-700/30'
              }`}
            >
              {/* Icon */}
              <div
                className={`shrink-0 ${
                  entry.isOscar
                    ? 'text-yellow-400'
                    : hasWins
                    ? 'text-emerald-400'
                    : 'text-zinc-500'
                }`}
              >
                {hasWins ? <Trophy size={18} /> : <Star size={18} />}
              </div>

              {/* Award name */}
              <p
                className={`flex-1 text-sm font-semibold leading-tight ${
                  entry.isOscar ? 'text-yellow-200' : 'text-white'
                }`}
              >
                {entry.name}
              </p>

              {/* Wins + nominations badges */}
              <div className="flex items-center gap-2 shrink-0">
                {hasWins && (
                  <span
                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                      entry.isOscar
                        ? 'bg-yellow-500/25 text-yellow-300'
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {entry.wins} ganado{entry.wins !== 1 ? 's' : ''}
                  </span>
                )}
                {hasNoms && (
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-zinc-700 text-zinc-400">
                    {entry.nominations} nom.
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
