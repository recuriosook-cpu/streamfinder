import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/service-role'
import { paisDelPedido } from '@/lib/geo'

/**
 * Guardar en `profiles.country` el país que detecta Vercel por la IP.
 *
 * La regla, única para la web y la app: si `country_source = 'manual'` la
 * persona eligió el país en Ajustes y no se toca. Si no, se pisa con el
 * detectado y queda en 'auto'. Ver `supabase-pais-real-2026-10.sql`.
 *
 * La llaman:
 *   · `/api/perfil/pais`, que la web pide en cada carga con sesión.
 *   · Las rutas que la app pide con su sesión (`detectarPaisEnSegundoPlano`):
 *     sin esto el país sólo se detectaba en la web y casi nadie la usa.
 *
 * Sólo con un `userId` verificado contra la sesión, nunca con el que manda el
 * cliente en `/api/track`: ahí cualquiera podría cambiarle el país a otro.
 */

type Origen = 'auto' | 'manual' | null

export interface PaisPerfil {
  /** El país que hay que usar: el manual si lo hay, si no el detectado. */
  pais: string | null
  origen?: Origen
}

export async function guardarPaisDetectado(
  admin: SupabaseClient,
  userId: string,
  headers: Headers,
): Promise<PaisPerfil> {
  const detectado = paisDelPedido(headers)

  const { data: perfil, error } = await admin
    .from('profiles')
    .select('country, country_source')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    // Sin la columna no hay forma de saber si el país es manual: no se escribe.
    console.warn('[pais-perfil] no se pudo leer el perfil:', error.message)
    return { pais: detectado }
  }
  if (!perfil) return { pais: detectado }

  const actual = perfil as { country: string | null; country_source: Origen }

  if (actual.country_source === 'manual') return { pais: actual.country, origen: 'manual' }

  // Sin encabezado (local, o un pedido raro) no se pisa nada con un default.
  if (!detectado) return { pais: actual.country, origen: actual.country_source }

  if (actual.country !== detectado || actual.country_source !== 'auto') {
    // El filtro repite la condición: si entre la lectura y esta escritura la
    // persona eligió un país en Ajustes, esto no lo pisa.
    const { error: errUpdate } = await admin
      .from('profiles')
      .update({ country: detectado, country_source: 'auto' })
      .eq('id', userId)
      .or('country_source.is.null,country_source.eq.auto')

    if (errUpdate) console.error('[pais-perfil] update falló:', errUpdate.message)
  }

  return { pais: detectado, origen: 'auto' }
}

/**
 * Quién ya se revisó en esta instancia, y con qué país. La app pide el inicio
 * y el feed muchas veces por sesión: sin esto serían una lectura de
 * `profiles` por pedido para un dato que cambia cuando alguien viaja.
 */
const revisados = new Map<string, { pais: string | null; en: number }>()
const REVISAR_CADA_MS = 6 * 60 * 60 * 1000

/**
 * Para las rutas que usa la app: detecta y guarda el país después de
 * contestar, con `after`, sin demorar la respuesta. Hay que llamarla con el id
 * ya verificado contra el token. Nunca tira: un fallo acá no puede romper el
 * feed.
 */
export async function detectarPaisEnSegundoPlano(userId: string, headers: Headers): Promise<void> {
  const pais = paisDelPedido(headers)
  const previo = revisados.get(userId)
  if (previo && previo.pais === pais && Date.now() - previo.en < REVISAR_CADA_MS) return
  revisados.set(userId, { pais, en: Date.now() })

  try {
    await guardarPaisDetectado(getAdminClient(), userId, headers)
  } catch (err) {
    console.error('[pais-perfil] la detección falló:', (err as Error).message)
  }
}
