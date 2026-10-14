import { NextResponse, type NextRequest } from 'next/server'
import { enforceRateLimit } from '@/lib/rate-limit'
import { requireAdminClient } from '@/lib/service-role'
import { getRequestUserId } from '@/lib/request-user'
import { paisDelPedido } from '@/lib/geo'

/**
 * El país de quien pide, detectado por Vercel desde la IP.
 *
 *   GET  -> sólo lo dice. Es lo que usa `CountryContext` sin sesión, en lugar
 *           del ipapi.co de antes, que era un tercero viendo la IP de cada
 *           visitante y que muchos bloqueadores de anuncios cortaban.
 *   POST -> con sesión, además lo guarda en el perfil. `CountryContext` lo
 *           llama en cada carga con sesión, y eso cubre el registro y todos los
 *           ingresos: con Google, Apple o Facebook, y con contraseña, que no
 *           pasa por ningún handler del servidor.
 *
 * La regla del POST: si `country_source = 'manual'` la persona eligió el país
 * en Ajustes y no se toca. Si no, se pisa con el detectado y queda en 'auto'.
 *
 * Contesta siempre `{ pais }`: el país que la página tiene que usar, que con
 * un país manual es el manual y no el detectado. `null` si no se sabe.
 */

export const runtime = 'nodejs'

const RATE_LIMIT = 30

type Origen = 'auto' | 'manual' | null

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, {}, RATE_LIMIT)
  if (limited) return limited
  return NextResponse.json({ pais: paisDelPedido(req.headers) })
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, {}, RATE_LIMIT)
  if (limited) return limited

  const detectado = paisDelPedido(req.headers)

  const userId = await getRequestUserId(req)
  if (!userId) return NextResponse.json({ pais: detectado })

  const { admin, failure } = requireAdminClient('perfil/pais')
  if (failure) return NextResponse.json({ pais: detectado })

  const { data: perfil, error } = await admin
    .from('profiles')
    .select('country, country_source')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    // Lo más probable: falta correr supabase-pais-real-2026-10.sql. Sin la
    // columna no hay forma de saber si el país del perfil es manual, así que
    // no se escribe nada.
    console.warn('[perfil/pais] no se pudo leer el perfil:', error.message)
    return NextResponse.json({ pais: detectado })
  }
  if (!perfil) return NextResponse.json({ pais: detectado })

  const actual = perfil as { country: string | null; country_source: Origen }

  if (actual.country_source === 'manual') {
    return NextResponse.json({ pais: actual.country, origen: 'manual' })
  }

  // Sin encabezado (local, o un pedido raro) no se pisa nada con un default.
  if (!detectado) {
    return NextResponse.json({ pais: actual.country, origen: actual.country_source })
  }

  if (actual.country !== detectado || actual.country_source !== 'auto') {
    // El filtro repite la condición: si entre la lectura y esta escritura la
    // persona eligió un país en Ajustes, esto no lo pisa.
    const { error: errUpdate } = await admin
      .from('profiles')
      .update({ country: detectado, country_source: 'auto' })
      .eq('id', userId)
      .or('country_source.is.null,country_source.eq.auto')

    if (errUpdate) console.error('[perfil/pais] update falló:', errUpdate.message)
  }

  return NextResponse.json({ pais: detectado, origen: 'auto' })
}
