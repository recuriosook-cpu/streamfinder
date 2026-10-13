import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente del Supabase DEL JUEGO Potion Bottle, que es otro proyecto y no el
 * de Glynbox.
 *
 * Usa la clave secreta (rol `service_role`) de ese proyecto. Por eso:
 *
 *   · El `import 'server-only'` de arriba hace fallar el build si algún
 *     componente de cliente llega a importar este archivo.
 *   · Las variables NO llevan `NEXT_PUBLIC_`: Next sólo mete en el bundle del
 *     navegador las que lo llevan.
 *   · No se mezcla con `lib/service-role.ts`. Aquel apunta a Glynbox; si una
 *     ruta usara el equivocado, consultaría tablas que no existen en ese
 *     proyecto y fallaría con un error que no dice por qué.
 *
 * `null` cuando falta alguna de las dos variables, en vez de un cliente que
 * falla en cada pedido: quien llama tiene que poder decir "no está
 * configurado".
 */
export function getPotionClient(): SupabaseClient | null {
  const url = process.env.POTION_SUPABASE_URL
  const key = process.env.POTION_SUPABASE_SECRET
  if (!url || !key || key.length < 30) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
