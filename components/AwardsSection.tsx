import type { ParsedAwards } from '@/lib/omdb'
import { Trophy, Star } from 'lucide-react'

interface Props {
  awards: ParsedAwards
}

export default function AwardsSection({ awards }: Props) {
  const { oscarWins, oscarNominations, totalWins, totalNominations } = awards
  const hasOscars = oscarWins > 0 || oscarNominations > 0

  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-4">Premios</h2>

      <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-5">
        <div className="flex flex-wrap gap-4">

          {/* Oscar highlight — shown first when present */}
          {hasOscars && (
            <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3 min-w-[160px]">
              {/* Oscar statuette silhouette */}
              <div className="shrink-0 text-yellow-400">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 7c-1.1 0-2 .4-2.7 1L7 13h10l-2.3-3c-.7-.6-1.6-1-2.7-1zm-4 5v2h8v-2H8zm-1 3v5h2v-3h6v3h2v-5H7z"/>
                </svg>
              </div>
              <div>
                {oscarWins > 0 && (
                  <p className="text-base font-bold text-yellow-300 leading-tight">
                    {oscarWins === 1 ? '1 Oscar' : `${oscarWins} Oscars`}
                    <span className="text-yellow-500 font-normal text-xs ml-1">ganado{oscarWins !== 1 ? 's' : ''}</span>
                  </p>
                )}
                {oscarNominations > 0 && !oscarWins && (
                  <p className="text-base font-bold text-yellow-300 leading-tight">
                    Nominado{oscarNominations !== 1 ? 's' : ''} al Oscar
                    <span className="text-yellow-500 font-normal text-xs ml-1">×{oscarNominations}</span>
                  </p>
                )}
                {oscarWins > 0 && oscarNominations > 0 && (
                  <p className="text-xs text-yellow-600 mt-0.5">+{oscarNominations} nominación{oscarNominations !== 1 ? 'es' : ''}</p>
                )}
              </div>
            </div>
          )}

          {/* Total wins */}
          {totalWins > 0 && (
            <div className="flex items-center gap-3 bg-zinc-700/50 rounded-xl px-4 py-3 min-w-[130px]">
              <Trophy size={22} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-xl font-bold text-white leading-none">{totalWins}</p>
                <p className="text-xs text-zinc-400 mt-0.5">premio{totalWins !== 1 ? 's' : ''} ganado{totalWins !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )}

          {/* Total nominations */}
          {totalNominations > 0 && (
            <div className="flex items-center gap-3 bg-zinc-700/50 rounded-xl px-4 py-3 min-w-[130px]">
              <Star size={22} className="text-zinc-400 shrink-0" />
              <div>
                <p className="text-xl font-bold text-white leading-none">{totalNominations}</p>
                <p className="text-xs text-zinc-400 mt-0.5">nominación{totalNominations !== 1 ? 'es' : ''}</p>
              </div>
            </div>
          )}
        </div>

        {/* Raw text as subtitle */}
        <p className="text-xs text-zinc-600 mt-4 italic">{awards.rawText}</p>
      </div>
    </div>
  )
}
