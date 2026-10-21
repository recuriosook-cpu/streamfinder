import { createClient } from '@/lib/supabase'

/**
 * Quiénes tienen el tilde de verificado. La única fuente es
 * `profiles.verified`, que se cambia desde `/admin/usuarios`.
 *
 * Mismo diseño que `src/lib/verified.ts` de la app: un set de ids traído una
 * vez por sesión, en vez de sumar la columna a cada `select` de perfiles. El
 * tilde aparece en una veintena de lugares que traen el autor de formas
 * distintas —consultas directas, joins, y endpoints como
 * `/api/community/feed`— y todos tienen el id a mano. Si algún día se
 * verifica a miles de usuarios, conviene volver a llevarlo en cada fila.
 *
 * La columna la pueden leer anon y authenticated (`GRANT SELECT (verified)`),
 * y un trigger impide que un usuario se la cambie a sí mismo. Ver
 * `supabase-profiles-verified-2026-10.sql`.
 */

let cache: Set<string> | null = null
let enCurso: Promise<Set<string>> | null = null

async function traer(): Promise<Set<string>> {
  const { data, error } = await createClient()
    .from('profiles')
    .select('id')
    .eq('verified', true)

  if (error) {
    // Sin tildes es mejor que romper la pantalla.
    console.warn('[verified]', error.message)
    return new Set()
  }
  return new Set(((data ?? []) as { id: string }[]).map(r => r.id))
}

/** El set, cargándolo si hace falta. Un solo pedido aunque lo pidan cien badges a la vez. */
export function cargarVerificados(): Promise<Set<string>> {
  if (cache) return Promise.resolve(cache)
  if (!enCurso) {
    enCurso = traer().then(set => {
      cache = set
      enCurso = null
      return set
    })
  }
  return enCurso
}

/** El set si ya está cargado, sin pedir nada. */
export function verificadosCargados(): Set<string> | null {
  return cache
}

/** Para que el próximo badge vuelva a pedir el set: después de verificar a alguien. */
export function olvidarVerificados(): void {
  cache = null
}
