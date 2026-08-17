import { createClient } from '@/lib/supabase'

/** PostgREST devuelve este código cuando la función no está en el schema cache. */
const PGRST_FUNCTION_NOT_FOUND = 'PGRST202'

/** Si falta la función va a faltar siempre: se avisa una vez, no en cada acción. */
let missingRpcReported = false

/**
 * Suma puntos por el RPC atómico `add_points`.
 *
 * Fire-and-forget a propósito: los 11 lugares que la llaman son handlers de UI
 * —marcar como vista, seguir a alguien, publicar una reseña— y la acción real
 * ya se guardó. Bloquear el botón esperando un contador decorativo no vale la
 * pena, y un fallo acá no puede revertir lo que el usuario hizo.
 *
 * Lo que sí cambió: ahora la request se manda. Las queries de supabase-js son
 * lazy —no son promesas, son thenables que recién ejecutan cuando alguien las
 * encadena—, así que el `supabase.rpc(...)` suelto que había antes construía la
 * consulta y la tiraba a la basura sin llegar nunca a la red. Los puntos no se
 * sumaban desde ningún lado.
 *
 * OJO: la función `add_points` todavía NO existe en la base. Están las columnas
 * `profiles.points` y `profiles.level`, pero los `CREATE FUNCTION` de
 * `supabase-levels.sql` (`get_level` + `add_points`) nunca se corrieron. Hasta
 * que se apliquen, esto avisa por consola y no suma nada.
 */
export function addPoints(userId: string, amount: number): void {
  const supabase = createClient()

  void supabase
    .rpc('add_points', { p_user_id: userId, p_amount: amount })
    .then(({ error }) => {
      if (!error) return

      if (error.code === PGRST_FUNCTION_NOT_FOUND) {
        if (missingRpcReported) return
        missingRpcReported = true
        console.warn(
          '[add_points] La función no existe en Supabase, los puntos no se ' +
            'suman. Falta correr los CREATE FUNCTION de supabase-levels.sql ' +
            '(get_level + add_points).'
        )
        return
      }

      console.warn('[add_points]', error.message)
    })
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
