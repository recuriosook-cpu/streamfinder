import { createClient } from '@/lib/supabase'

// Fire-and-forget — non-critical, never awaited by callers
export function addPoints(userId: string, amount: number): void {
  const supabase = createClient()
  supabase.rpc('add_points', { p_user_id: userId, p_amount: amount })
}

export const LEVELS = [
  { level: 1, name: 'Espectador', emoji: '👁️',  min: 0,    max: 100  },
  { level: 2, name: 'Cinéfilo',   emoji: '🎬',  min: 100,  max: 300  },
  { level: 3, name: 'Crítico',    emoji: '⭐',  min: 300,  max: 700  },
  { level: 4, name: 'Experto',    emoji: '🎭',  min: 700,  max: 1500 },
  { level: 5, name: 'Maestro',    emoji: '🏆',  min: 1500, max: null },
] as const

export function getLevelInfo(level: number, points: number) {
  const info = LEVELS[(level ?? 1) - 1] ?? LEVELS[0]
  const next = LEVELS[level] ?? null // null if max level
  const pct  = next
    ? Math.min(100, Math.round(((points - info.min) / (next.min - info.min)) * 100))
    : 100
  return { ...info, next, pct, points }
}
