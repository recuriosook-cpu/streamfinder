import { NextResponse } from 'next/server'
import { requireAdminClient } from '@/lib/service-role'
import {
  sincronizarTramo,
  tramosPorAnio,
  SinTiempo,
  type ResultadoTramo,
  type Tramo,
} from '@/lib/search-index-sync'

/**
 * GET /api/cron/search-index — mantiene al día el índice del buscador.
 *
 * Corre una vez por semana por el cron de Vercel (ver `vercel.json`). La carga
 * completa (~13.000 pedidos a TMDB) no entra en los 300 segundos que tiene una
 * función en el plan Hobby, así que cada semana se hace una parte:
 *
 *   - los dos últimos años, siempre: es donde aparecen títulos nuevos y donde
 *     los votos cambian rápido;
 *   - un octavo de los años anteriores, rotando: el catálogo entero se repasa
 *     cada ocho semanas. Los votos de una película de 1995 no se mueven como
 *     para cambiar el orden de un buscador en menos que eso.
 *
 * Medido desde una computadora el 2026-09-24: 2025 entero (películas y series)
 * son 339 pedidos en 13 s, ~26 por segundo. La semana típica son ~2.100
 * pedidos, unos 80 s. Si igual se acaba el tiempo, lo que falta queda para la
 * vuelta siguiente y no se borra nada de lo que no se llegó a recorrer.
 *
 * La carga completa inicial la hace `scripts/sync-search-index.mjs`. También
 * se puede disparar a mano con el `CRON_SECRET`, como los otros crons.
 */

export const runtime = 'nodejs'

/** El máximo del plan Hobby. */
export const maxDuration = 300

/** Margen para contestar antes de que Vercel corte: no se empieza nada después de esto. */
const PRESUPUESTO_MS = 250_000

const ANIO_INICIAL = 1900
const GRUPOS_ROTACION = 8

/** Mismo guard que `/api/cron/daily-notifications`. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}`
}

/** Los tramos de esta semana: los dos últimos años más el grupo que toca. */
function tramosDeLaSemana(hoy: Date): { tramos: Tramo[]; grupo: number } {
  const anio = hoy.getUTCFullYear()
  const semana = Math.floor(hoy.getTime() / (7 * 864e5))
  const grupo = semana % GRUPOS_ROTACION

  const recientes = tramosPorAnio(anio - 1, anio)
  const viejos = tramosPorAnio(ANIO_INICIAL, anio - 2)
    .filter(t => Number(t.desde.slice(0, 4)) % GRUPOS_ROTACION === grupo)

  return { tramos: [...recientes, ...viejos], grupo }
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { admin, failure } = requireAdminClient('cron/search-index')
  if (failure) return failure

  const inicio = Date.now()
  const limite = inicio + PRESUPUESTO_MS
  const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'falta NEXT_PUBLIC_TMDB_API_KEY' }, { status: 500 })

  const { tramos, grupo } = tramosDeLaSemana(new Date())
  const hechos: ResultadoTramo[] = []
  const errores: { tramo: Tramo; error: string }[] = []
  let pendientes = 0

  for (const [i, tramo] of tramos.entries()) {
    if (Date.now() > limite) {
      pendientes = tramos.length - i
      break
    }
    try {
      hechos.push(...await sincronizarTramo(admin, tramo, { apiKey, limite }))
    } catch (e) {
      if (e instanceof SinTiempo) {
        pendientes = tramos.length - i
        break
      }
      errores.push({ tramo, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const resumen = {
    grupo,
    tramos: tramos.length,
    hechos: hechos.length,
    pendientes,
    titulos: hechos.reduce((n, h) => n + h.titulos, 0),
    borrados: hechos.reduce((n, h) => n + h.borrados, 0),
    pedidos: hechos.reduce((n, h) => n + h.pedidos, 0),
    segundos: Math.round((Date.now() - inicio) / 1000),
    errores,
  }
  console.log('[cron/search-index]', JSON.stringify(resumen))

  return NextResponse.json(resumen, { status: errores.length ? 500 : 200 })
}
