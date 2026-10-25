import { getAdminClient } from '@/lib/service-role'
import { aFormatoFicha, type OMDBRatings } from '@/lib/omdb'

/**
 * Puntajes de OMDb (IMDb, Rotten Tomatoes, Metacritic) y premios, guardados en
 * `omdb_ratings` (ver `supabase-omdb-ratings-2026-10.sql`).
 *
 * ── Por qué una tabla ──────────────────────────────────────────────────────
 *
 * La clave de OMDb es la gratuita: 1.000 pedidos por día. Antes cada ficha que
 * se generaba (web: cada vez que vence la CDN, y cada id nuevo que recorre un
 * bot; app: cada título abierto, por el proxy) le pedía a OMDb, con el Data
 * Cache de Next como único freno. El cupo se terminaba a media tarde y de ahí
 * a la medianoche ninguna ficha nueva traía puntajes. Peor: la ficha web sin
 * puntajes quedaba 24 h en la CDN, así que "a unos títulos les aparecen y a
 * otros no" según a qué hora se generó cada uno.
 *
 * Con la tabla, un título es un pedido cada 7 días por más visitas que tenga.
 *
 * ── Qué devuelve ───────────────────────────────────────────────────────────
 *
 *   'ok'            puntajes (frescos, o vencidos si OMDb no contestó ahora:
 *                   unos de hace 8 días valen más que ninguno).
 *   'sin_datos'     OMDb no tiene el título (no está, o es muy nuevo). Se
 *                   guarda igual y se vuelve a preguntar a los 7 días.
 *   'no_disponible' OMDb no contestó (cupo, clave, caída) y no hay nada
 *                   guardado. Es lo único que vale la pena reintentar pronto.
 *
 * Nunca tira.
 */

export interface PuntajesOMDb {
  /** 0–10. */
  imdbRating: number | null
  imdbVotes: number | null
  /** 0–100, el % de críticos de Rotten Tomatoes. */
  tomatoMeter: number | null
  /** 0–100. */
  metacritic: number | null
  /** Texto crudo de OMDb ("Won 4 Oscars. 32 wins & 87 nominations."). */
  awards: string | null
}

export type EstadoOMDb = 'ok' | 'sin_datos' | 'no_disponible'

export const PUNTAJES_VACIOS: PuntajesOMDb = {
  imdbRating: null,
  imdbVotes: null,
  tomatoMeter: null,
  metacritic: null,
  awards: null,
}

/** Los ids de IMDb son `tt` + 7 a 10 dígitos. */
export const IMDB_ID_PATTERN = /^tt\d{7,10}$/

const OMDB_KEY = process.env.OMDB_API_KEY

/** Cada cuánto se vuelve a preguntar por un título ya guardado. */
const VIGENCIA_MS = 7 * 24 * 60 * 60 * 1000

/** OMDb a veces se cuelga; la ficha no lo espera más que esto. */
const TIMEOUT_MS = 6000

/**
 * Con el cupo agotado o la clave rechazada, no se le vuelve a pedir por este
 * rato (por instancia). Cada pedido de más no trae nada y suma un viaje a la
 * ficha.
 */
const PAUSA_MS = 30 * 60 * 1000
let pausaHasta = 0

/** Cómo terminó cada pedido a OMDb. Se cuentan por día en `omdb_pedidos`. */
type Resultado = 'ok' | 'no_encontrado' | 'limite' | 'clave_invalida' | 'error_http' | 'timeout' | 'error'

interface Fila {
  encontrado: boolean
  imdb_rating: number | null
  imdb_votes: number | null
  tomato_meter: number | null
  metacritic: number | null
  awards: string | null
  actualizado_en: string
}

/** OMDb usa la string 'N/A' en vez de omitir el campo. */
function limpio(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && t !== 'N/A' ? t : null
}

function numero(v: string | null): number | null {
  if (v === null) return null
  const n = Number(v.replace(/[,%]/g, ''))
  return Number.isFinite(n) ? n : null
}

function deFila(f: Fila): PuntajesOMDb {
  return {
    imdbRating: f.imdb_rating === null ? null : Number(f.imdb_rating),
    imdbVotes: f.imdb_votes,
    tomatoMeter: f.tomato_meter,
    metacritic: f.metacritic,
    awards: f.awards,
  }
}

async function pedirAOmdb(imdbId: string): Promise<
  { resultado: 'ok'; puntajes: PuntajesOMDb } | { resultado: Exclude<Resultado, 'ok'> }
> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    // El Data Cache queda como red mientras la tabla no exista (el SQL sin
    // correr). Next sólo guarda los 200, así que un 401 nunca queda pegado.
    const res = await fetch(`https://www.omdbapi.com/?apikey=${OMDB_KEY}&i=${imdbId}`, {
      signal: controller.signal,
      next: { revalidate: 86_400 },
    })
    const data = await res.json().catch(() => null)
    const error = typeof data?.Error === 'string' ? data.Error : ''

    if (res.status === 401) {
      return { resultado: /limit/i.test(error) ? 'limite' : 'clave_invalida' }
    }
    if (!res.ok || !data) return { resultado: 'error_http' }

    if (data.Response === 'False') {
      // "Incorrect IMDb ID." / "Movie not found!" / "Series not found!": no lo
      // tiene. Cualquier otro texto ("Error getting data.") es una falla suya.
      return { resultado: /not found|incorrect imdb id/i.test(error) ? 'no_encontrado' : 'error_http' }
    }

    const tomate = (data.Ratings as { Source: string; Value: string }[] | undefined)
      ?.find(r => r.Source === 'Rotten Tomatoes')
    return {
      resultado: 'ok',
      puntajes: {
        imdbRating: numero(limpio(data.imdbRating)),
        imdbVotes: numero(limpio(data.imdbVotes)),
        tomatoMeter: numero(limpio(tomate?.Value)),
        metacritic: numero(limpio(data.Metascore)),
        awards: limpio(data.Awards),
      },
    }
  } catch (err) {
    return { resultado: (err as Error)?.name === 'AbortError' ? 'timeout' : 'error' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * `soloGuardado`: no va a OMDb, sólo lee la tabla. Es el modo de las fichas
 * web: más de la mitad de las que se generan las pide bingbot, cada una de un
 * título distinto (25/10: 653 de 1.180 en tres horas y media), y con OMDb al
 * generar la ficha se comía el cupo en títulos que nadie mira. La ficha sale
 * con lo guardado y, si falta o venció (`refrescar`), lo pide el navegador de
 * quien la abre por `/api/omdb-ratings`, que sí va a OMDb. Como la CDN
 * comparte el HTML, a OMDb sólo llegan los títulos que mira gente.
 */
export async function puntajesOMDb(
  imdbId: string | null | undefined,
  { soloGuardado = false }: { soloGuardado?: boolean } = {},
): Promise<{ puntajes: PuntajesOMDb; estado: EstadoOMDb; refrescar: boolean }> {
  const r = await resolver(imdbId, soloGuardado)
  return { refrescar: false, ...r }
}

/**
 * Para las fichas web. Sólo lee `omdb_ratings`, nunca va a OMDb: eso lo hace
 * el navegador si hace falta (`pendiente`). Ver `soloGuardado` arriba.
 */
export async function getOMDBRatings(imdbId: string | null | undefined): Promise<OMDBRatings> {
  const { puntajes, refrescar } = await puntajesOMDb(imdbId, { soloGuardado: true })
  return aFormatoFicha(puntajes, refrescar)
}

async function resolver(
  imdbId: string | null | undefined,
  soloGuardado: boolean,
): Promise<{ puntajes: PuntajesOMDb; estado: EstadoOMDb; refrescar?: boolean }> {
  if (!imdbId || !IMDB_ID_PATTERN.test(imdbId)) return { puntajes: PUNTAJES_VACIOS, estado: 'sin_datos' }

  let admin: ReturnType<typeof getAdminClient> | null = null
  let guardada: Fila | null = null
  try {
    admin = getAdminClient()
    const { data, error } = await admin
      .from('omdb_ratings')
      .select('encontrado, imdb_rating, imdb_votes, tomato_meter, metacritic, awards, actualizado_en')
      .eq('imdb_id', imdbId)
      .maybeSingle()
    // Sin la tabla (el SQL no se corrió) se sigue como antes: directo a OMDb.
    if (error) console.error('[omdb] leer omdb_ratings:', error.message)
    guardada = (data as Fila | null) ?? null
  } catch (err) {
    console.error('[omdb] sin cliente admin:', (err as Error).message)
  }

  const deGuardada = (): { puntajes: PuntajesOMDb; estado: EstadoOMDb } | null =>
    guardada
      ? guardada.encontrado
        ? { puntajes: deFila(guardada), estado: 'ok' }
        : { puntajes: PUNTAJES_VACIOS, estado: 'sin_datos' }
      : null

  if (guardada && Date.now() - new Date(guardada.actualizado_en).getTime() < VIGENCIA_MS) {
    return deGuardada()!
  }

  if (soloGuardado) {
    return { ...(deGuardada() ?? { puntajes: PUNTAJES_VACIOS, estado: 'no_disponible' as const }), refrescar: true }
  }

  if (!OMDB_KEY || Date.now() < pausaHasta) {
    return deGuardada() ?? { puntajes: PUNTAJES_VACIOS, estado: 'no_disponible' }
  }

  const r = await pedirAOmdb(imdbId)

  if (r.resultado === 'limite' || r.resultado === 'clave_invalida') {
    pausaHasta = Date.now() + PAUSA_MS
    console.error(`[omdb] ${r.resultado === 'limite' ? 'cupo diario agotado' : 'clave rechazada'} (${imdbId})`)
  } else if (r.resultado !== 'ok' && r.resultado !== 'no_encontrado') {
    console.error(`[omdb] ${r.resultado} (${imdbId})`)
  }

  if (admin) {
    const escrituras: PromiseLike<unknown>[] = [
      admin.rpc('omdb_contar', { p_resultado: r.resultado }).then(({ error }) => {
        if (error) console.error('[omdb] omdb_contar:', error.message)
      }),
    ]
    if (r.resultado === 'ok' || r.resultado === 'no_encontrado') {
      const p = r.resultado === 'ok' ? r.puntajes : PUNTAJES_VACIOS
      escrituras.push(
        admin.from('omdb_ratings').upsert({
          imdb_id: imdbId,
          encontrado: r.resultado === 'ok',
          imdb_rating: p.imdbRating,
          imdb_votes: p.imdbVotes,
          tomato_meter: p.tomatoMeter,
          metacritic: p.metacritic,
          awards: p.awards,
          actualizado_en: new Date().toISOString(),
        }).then(({ error }) => {
          if (error) console.error('[omdb] guardar omdb_ratings:', error.message)
        }),
      )
    }
    await Promise.all(escrituras)
  }

  if (r.resultado === 'ok') return { puntajes: r.puntajes, estado: 'ok' }
  if (r.resultado === 'no_encontrado') return { puntajes: PUNTAJES_VACIOS, estado: 'sin_datos' }
  return deGuardada() ?? { puntajes: PUNTAJES_VACIOS, estado: 'no_disponible' }
}
