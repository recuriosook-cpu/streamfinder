// SERVER-ONLY — lee y escribe con la service role.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Novedad } from './avisos-push'
import { diaArgentina, enParalelo, tmdbJson } from './cron-tmdb'

/**
 * Las novedades de los famosos que cada uno sigue (`followed_actors`):
 * cumpleaños, proyecto nuevo y estreno. Las junta y las devuelve; insertarlas
 * y mandar la push (con el tope) es de `lib/avisos-push.ts`.
 *
 * ── Cuántos pedidos ────────────────────────────────────────────────────────
 *
 * Dos por famoso y por día: `/person/{id}` con sus créditos, en castellano y
 * en inglés (para los títulos). Con 18 famosos seguidos, 36 pedidos.
 *
 * ── Qué es "nuevo" ─────────────────────────────────────────────────────────
 *
 * Se guarda lo ya visto de cada famoso (`famosos_creditos`). Un crédito que no
 * estaba ayer y todavía no se estrenó es un proyecto nuevo. La primera vez que
 * se lee a un famoso se guarda todo sin avisar (`famosos.sembrado_en`): si no,
 * todo lo que ya tenía anunciado saldría como "nuevo".
 *
 * Un estreno es algo de la lista cuya fecha (estreno de la película o primera
 * emisión de la serie) cayó en los últimos 7 días y que todavía no se avisó.
 * Las temporadas nuevas de una serie no cuentan: TMDB no las trae acá.
 *
 * ── Qué créditos importan ──────────────────────────────────────────────────
 *
 * TMDB trae de todo. Quedan afuera:
 *   · programas de entrevistas, noticias y realities (géneros 10767, 10763, 10764);
 *   · los créditos de "sí mismo" (Self, Himself, Herself…);
 *   · para quien no es actor, actuar (los cameos de un director);
 *   · en lo técnico, todo lo que no sea dirigir, escribir o crear.
 * Para un proyecto sin fecha, además, que tenga póster: lo que TMDB carga sin
 * póster ni fecha suele ser un rumor.
 *
 * ── De paso ────────────────────────────────────────────────────────────────
 *
 * Completa `birthday` y `actor_photo` en `followed_actors`, que la app no
 * guardaba al seguir: sin eso, quien seguía desde la app nunca recibía el
 * cumpleaños (el feed de la comunidad de la web los lee de ahí).
 */

const GENEROS_FUERA = new Set([10767, 10763, 10764])
const SI_MISMO = /\b(self|himself|herself|themselves|él mismo|ella misma|sí mismo|si mismo|narrator \(voice\)|host)\b/i
const TRABAJOS = new Set(['Director', 'Screenplay', 'Writer', 'Creator', 'Story'])

/** Cuántos días después del estreno todavía se avisa. */
const VENTANA_ESTRENO = 7

interface CreditoTmdb {
  id: number
  media_type: 'movie' | 'tv' | string
  title?: string
  name?: string
  character?: string
  job?: string
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
  poster_path?: string | null
  adult?: boolean
}

interface PersonaTmdb {
  id: number
  name?: string
  birthday?: string | null
  known_for_department?: string
  profile_path?: string | null
  combined_credits?: { cast?: CreditoTmdb[]; crew?: CreditoTmdb[] }
}

export interface Credito {
  media_type: 'movie' | 'tv'
  media_id: number
  rol: 'cast' | 'crew'
  titulo_es: string
  titulo_en: string | null
  poster_path: string | null
  fecha: string | null
}

interface FilaCredito extends Credito {
  person_id: number
  estreno_avisado: boolean
}

export interface ResumenFamosos {
  famosos: number
  sembrados: number
  sinRespuesta: number
  creditosNuevos: number
  cumpleanosCompletados: number
  errores: number
}

const clave = (t: string, id: number) => `${t}:${id}`

/** Los créditos que importan, sin repetir título. */
export function creditosQueImportan(es: PersonaTmdb, en: PersonaTmdb | null): Credito[] {
  const actor = (es.known_for_department ?? 'Acting') === 'Acting'
  const tituloEn = new Map<string, string>()
  for (const c of [...(en?.combined_credits?.cast ?? []), ...(en?.combined_credits?.crew ?? [])]) {
    const t = (c.title ?? c.name)?.trim()
    if (t) tituloEn.set(clave(c.media_type, c.id), t)
  }

  const salida = new Map<string, Credito>()
  const sumar = (c: CreditoTmdb, rol: 'cast' | 'crew') => {
    if (c.media_type !== 'movie' && c.media_type !== 'tv') return
    if (c.adult) return
    if ((c.genre_ids ?? []).some(g => GENEROS_FUERA.has(g))) return
    const titulo = (c.title ?? c.name)?.trim()
    if (!titulo) return
    const k = clave(c.media_type, c.id)
    // Si actúa y dirige la misma, queda como lo que es: actor o director.
    const previo = salida.get(k)
    if (previo && previo.rol === (actor ? 'cast' : 'crew')) return
    salida.set(k, {
      media_type: c.media_type,
      media_id: c.id,
      rol,
      titulo_es: titulo,
      titulo_en: tituloEn.get(k) ?? null,
      poster_path: c.poster_path ?? null,
      fecha: (c.media_type === 'movie' ? c.release_date : c.first_air_date) || null,
    })
  }

  if (actor) {
    for (const c of es.combined_credits?.cast ?? []) {
      if (c.character && SI_MISMO.test(c.character)) continue
      sumar(c, 'cast')
    }
  }
  for (const c of es.combined_credits?.crew ?? []) {
    if (c.job && TRABAJOS.has(c.job)) sumar(c, 'crew')
  }
  return [...salida.values()]
}

type Seguimiento = { user_id: string; actor_id: number; actor_name: string; birthday: string | null; actor_photo: string | null }

async function todos<T>(consulta: (desde: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde)
    if (error) throw new Error(error.message)
    const tanda = (data ?? []) as T[]
    filas.push(...tanda)
    if (tanda.length < 1000) break
  }
  return filas
}

/** Las frases en castellano para la campanita de la web (`entity_title`). */
function frase(tipo: 'proyecto' | 'estreno', persona: string, titulo: string): string {
  return tipo === 'proyecto' ? `Proyecto nuevo de ${persona}: ${titulo}` : `Estreno de ${persona}: ${titulo}`
}

export async function novedadesDeFamosos(
  admin: SupabaseClient,
  resumen: ResumenFamosos
): Promise<Novedad[]> {
  const seguimientos = await todos<Seguimiento>(desde =>
    admin.from('followed_actors').select('user_id, actor_id, actor_name, birthday, actor_photo').range(desde, desde + 999)
  )
  const seguidores = new Map<number, string[]>()
  const nombres = new Map<number, string>()
  for (const s of seguimientos) {
    seguidores.set(s.actor_id, [...(seguidores.get(s.actor_id) ?? []), s.user_id])
    nombres.set(s.actor_id, s.actor_name)
  }
  const ids = [...seguidores.keys()]
  resumen.famosos = ids.length
  if (ids.length === 0) return []

  // Los famosos nuevos entran sin sembrar.
  const { error: altaError } = await admin.from('famosos').upsert(
    ids.map(id => ({ person_id: id, nombre: nombres.get(id) ?? '' })),
    { onConflict: 'person_id', ignoreDuplicates: true }
  )
  if (altaError) throw new Error(`famosos: ${altaError.message}`)

  const [famosos, vistos] = await Promise.all([
    todos<{ person_id: number; sembrado_en: string | null }>(desde =>
      admin.from('famosos').select('person_id, sembrado_en').in('person_id', ids).range(desde, desde + 999)
    ),
    todos<FilaCredito>(desde =>
      admin.from('famosos_creditos')
        .select('person_id, media_type, media_id, rol, titulo_es, titulo_en, poster_path, fecha, estreno_avisado')
        .in('person_id', ids)
        .range(desde, desde + 999)
    ),
  ])
  const sembrado = new Map(famosos.map(f => [f.person_id, f.sembrado_en !== null]))
  const vistosPor = new Map<number, Map<string, FilaCredito>>()
  for (const v of vistos) {
    const m = vistosPor.get(v.person_id) ?? new Map<string, FilaCredito>()
    m.set(clave(v.media_type, v.media_id), v)
    vistosPor.set(v.person_id, m)
  }

  const hoy = diaArgentina()
  const hoyMMDD = hoy.slice(5)
  const desdeEstreno = diaArgentina(VENTANA_ESTRENO)
  const novedades: Novedad[] = []

  const para = (personId: number, n: Omit<Novedad, 'userId'>) => {
    for (const userId of new Set(seguidores.get(personId) ?? [])) novedades.push({ ...n, userId })
  }

  await enParalelo(ids, 6, async personId => {
    try {
      await revisarFamoso(personId)
    } catch (err) {
      // Uno que falla no corta a los demás. Mañana se vuelve a intentar.
      console.error(`[famosos] ${personId}:`, (err as Error).message)
      resumen.errores++
    }
  })

  return novedades

  async function revisarFamoso(personId: number) {
    const [es, en] = await Promise.all([
      tmdbJson<PersonaTmdb>(`/person/${personId}`, { append_to_response: 'combined_credits', language: 'es-AR' }),
      tmdbJson<PersonaTmdb>(`/person/${personId}`, { append_to_response: 'combined_credits', language: 'en-US' }),
    ])
    if (!es) { resumen.sinRespuesta++; return }
    const persona = es.name?.trim() || nombres.get(personId) || ''

    // ── Cumpleaños: de TMDB, no de lo guardado al seguir.
    if (es.birthday && es.birthday.slice(5) === hoyMMDD) {
      para(personId, {
        type: 'actor_birthday', entityId: String(personId), entityType: 'person',
        entityTitle: persona, datos: { persona },
      })
    }

    // De paso, lo que la app no guardaba al seguir.
    if (es.birthday || es.profile_path) {
      const faltan = seguimientos.filter(s => s.actor_id === personId && (!s.birthday || !s.actor_photo))
      if (faltan.length > 0) {
        const { error } = await admin.from('followed_actors')
          .update({
            ...(es.birthday ? { birthday: es.birthday } : {}),
            ...(es.profile_path ? { actor_photo: es.profile_path } : {}),
          })
          .eq('actor_id', personId)
          .or('birthday.is.null,actor_photo.is.null')
        if (!error) resumen.cumpleanosCompletados += faltan.length
      }
    }

    // ── Proyectos y estrenos.
    const creditos = creditosQueImportan(es, en)
    const antes = vistosPor.get(personId) ?? new Map<string, FilaCredito>()
    const yaSembrado = sembrado.get(personId) === true

    const nuevos: FilaCredito[] = []
    const cambiados: Omit<FilaCredito, 'estreno_avisado'>[] = []
    for (const c of creditos) {
      const previo = antes.get(clave(c.media_type, c.media_id))
      if (!previo) {
        // Sembrando, todo lo ya estrenado queda como avisado. Si no, lo que se
        // estrenó hace más de la ventana también: llegó tarde a TMDB.
        const avisado = c.fecha !== null && c.fecha < (yaSembrado ? desdeEstreno : diaArgentina(-1))
        nuevos.push({ ...c, person_id: personId, estreno_avisado: avisado })
        if (yaSembrado && (c.fecha === null ? c.poster_path !== null : c.fecha > hoy)) {
          para(personId, {
            type: 'famoso_proyecto', entityId: String(c.media_id), entityType: c.media_type,
            entityTitle: frase('proyecto', persona, c.titulo_es),
            datos: { persona, rol: c.rol, titulo_es: c.titulo_es, titulo_en: c.titulo_en },
          })
        }
      } else if (previo.fecha !== c.fecha || previo.titulo_es !== c.titulo_es || previo.titulo_en !== c.titulo_en || previo.poster_path !== c.poster_path) {
        cambiados.push({ ...c, person_id: personId })
      }
    }
    resumen.creditosNuevos += yaSembrado ? nuevos.length : 0

    if (nuevos.length > 0) {
      const { error } = await admin.from('famosos_creditos').insert(nuevos)
      if (error) throw new Error(`famosos_creditos: ${error.message}`)
    }
    if (cambiados.length > 0) {
      const { error } = await admin.from('famosos_creditos').upsert(cambiados, { onConflict: 'person_id,media_type,media_id' })
      if (error) throw new Error(`famosos_creditos: ${error.message}`)
    }

    // Estrenos: lo que ya estaba en la lista y le llegó la fecha.
    if (yaSembrado) {
      const estrenos = creditos.filter(c => {
        const previo = antes.get(clave(c.media_type, c.media_id))
        const avisado = previo ? previo.estreno_avisado : nuevos.find(n => n.media_id === c.media_id && n.media_type === c.media_type)?.estreno_avisado
        return !avisado && c.fecha !== null && c.fecha >= desdeEstreno && c.fecha <= hoy
      })
      for (const c of estrenos) {
        para(personId, {
          type: 'new_release', entityId: String(c.media_id), entityType: c.media_type,
          entityTitle: frase('estreno', persona, c.titulo_es),
          datos: { persona, rol: c.rol, titulo_es: c.titulo_es, titulo_en: c.titulo_en },
        })
        const { error } = await admin.from('famosos_creditos')
          .update({ estreno_avisado: true })
          .match({ person_id: personId, media_type: c.media_type, media_id: c.media_id })
        if (error) throw new Error(`famosos_creditos: ${error.message}`)
      }
    }

    const { error } = await admin.from('famosos')
      .update({
        nombre: persona,
        departamento: es.known_for_department ?? null,
        revisado_en: new Date().toISOString(),
        ...(yaSembrado ? {} : { sembrado_en: new Date().toISOString() }),
      })
      .eq('person_id', personId)
    if (error) throw new Error(`famosos: ${error.message}`)
    if (!yaSembrado) resumen.sembrados++
  }
}
