import { NextRequest, NextResponse } from 'next/server'
import { CORS_HEADERS, corsPreflight, jsonError } from '@/lib/community-api'
import { getRequestUserId } from '@/lib/request-user'
import { getAdminClient } from '@/lib/service-role'
import { enforceRateLimit } from '@/lib/rate-limit'
import { normalizarIdioma } from '@/lib/idioma'
import {
  COMPANIAS,
  DURACIONES,
  GANAS,
  GANAS_VIEJAS,
  queVeoHoy,
  type Compania,
  type Duracion,
  type Ganas,
} from '@/lib/que-veo-hoy'

/**
 * /api/que-veo-hoy — "¿Qué veo hoy?". La lógica está en `lib/que-veo-hoy.ts`.
 *
 *   GET ?compania=solo|pareja|amigos|familia
 *       &ganas=reirme|emocionarme|asustarme|accion|intriga
 *       &duracion=corta|hasta2|larga|capitulo|sinApuro  (sin ella, sin apuro)
 *       &pais=AR  &idioma=es|en  &excluir=movie:1,tv:2  (lo mostrado hace poco)
 *
 * Con sesión (Bearer desde la app, cookie desde la web) usa sus plataformas y
 * lo que calificó; sin sesión, conocidas del país. Responde `{ resultados }`,
 * hasta 4: la primera y las 3 de "Otra".
 */

export const OPTIONS = corsPreflight
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, CORS_HEADERS)
  if (limited) return limited

  const q = req.nextUrl.searchParams
  const compania = q.get('compania') as Compania
  const ganasPedidas = q.get('ganas') ?? ''
  const ganas = (GANAS_VIEJAS[ganasPedidas] ?? ganasPedidas) as Ganas
  const duracion = (q.get('duracion') ?? 'sinApuro') as Duracion
  if (!COMPANIAS.includes(compania) || !GANAS.includes(ganas) || !DURACIONES.includes(duracion)) {
    return jsonError('Respuestas inválidas', 400)
  }
  const paisPedido = (q.get('pais') ?? 'AR').toUpperCase()
  const pais = /^[A-Z]{2}$/.test(paisPedido) ? paisPedido : 'AR'
  const excluir = new Set(
    (q.get('excluir') ?? '').split(',').filter(k => /^(movie|tv):\d+$/.test(k)).slice(0, 60)
  )

  try {
    const userId = await getRequestUserId(req)
    const resultados = await queVeoHoy(userId ? getAdminClient() : null, {
      userId,
      compania,
      ganas,
      duracion,
      pais,
      idioma: normalizarIdioma(q.get('idioma')),
      excluir,
    })
    return NextResponse.json(
      { resultados },
      { headers: { ...CORS_HEADERS, 'Cache-Control': 'private, no-store' } }
    )
  } catch (err) {
    console.error('[que-veo-hoy]', (err as Error).message)
    return jsonError('No se pudo recomendar', 500)
  }
}
