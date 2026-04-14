import type { ParsedAwards } from '@/lib/omdb'
import { Trophy, Star } from 'lucide-react'

interface Props {
  awards: ParsedAwards
}

function plural(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`
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

          // Build the wins · nominations string
          const parts: string[] = []
          if (hasWins) parts.push(plural(entry.wins, 'ganado', 'ganados'))
          if (hasNoms) parts.push(plural(entry.nominations, 'nominación', 'nominaciones'))
          const summary = parts.join('  ·  ')

          return (
            <div
              key={entry.name}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl border ${
                entry.isOscar
                  ? 'bg-yellow-500/10 border-yellow-500/25'
                  : hasWins
                  ? 'bg-zinc-800/60 border-zinc-700/50'
                  : 'bg-zinc-800/40 border-zinc-700/30'
              }`}
            >
              {/* Icon — gold trophy if won any, green star if nominated only */}
              <div className={`shrink-0 ${
                hasWins
                  ? entry.isOscar ? 'text-yellow-400' : 'text-yellow-500'
                  : 'text-emerald-500'
              }`}>
                {hasWins ? <Trophy size={18} /> : <Star size={18} />}
              </div>

              {/* Award name */}
              <p className={`flex-1 text-sm font-semibold leading-tight ${
                entry.isOscar ? 'text-yellow-200' : 'text-white'
              }`}>
                {entry.name}
              </p>

              {/* Wins · nominations — same line, right-aligned */}
              <p className={`text-sm shrink-0 ${
                entry.isOscar ? 'text-yellow-300' : hasWins ? 'text-zinc-200' : 'text-zinc-400'
              }`}>
                {summary}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
