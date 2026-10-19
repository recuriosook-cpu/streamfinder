// SERVER-ONLY — lee y escribe con la service role.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Novedad } from './avisos-push'
import { diaArgentina, enParalelo, tmdbJson } from './cron-tmdb'
import { plataformasDe } from './resumen-semanal'

/**
 * "Ya está en Netflix": cuando algo del "Ver después" de alguien, o de un
 * famoso que sigue, aparece en una de sus plataformas (`favorite_platforms`)
 * en su país (`country`, y Argentina si no tiene). Arma las novedades;
 * insertarlas y mandar la push con el tope es de `lib/avisos-push.ts`.
 *
 * ── Cómo se sabe que "llegó" ───────────────────────────────────────────────
 *
 * TMDB sólo dice dónde está un título hoy, no desde cuándo. Así que se guarda
 * una foto por título y país (`disponibilidad`) y se compara con la de ayer:
 * una plataforma que hoy está y ayer no, llegó. La primera vez que se mira un
 * título en un país no hay con qué comparar: se guarda sin avisar.
 *
 * Cuenta suscripción, gratis y con anuncios; alquiler y compra no, igual que
 * el resumen semanal.
 *
 * ── Cuántos pedidos ────────────────────────────────────────────────────────
 *
 * Uno por título y por día (`/watch/providers` trae todos los países juntos).
 * Se miran los títulos de "Ver después" y los de los famosos estrenados en
 * los últimos 18 meses, salvo los que ya no le importan a nadie: ya se le
 * avisó, ya lo vio, o no eligió plataformas. En octubre de 2026 eran unos 400
 * pedidos por día. Si crece, `MAX_TITULOS` mira primero los que hace más que
 * no se revisan.
 *
 * ── Una vez por persona y título ───────────────────────────────────────────
 *
 * `avisos_disponibilidad` guarda a quién se le avisó de qué, aunque después
 * aparezca en otra plataforma. El resumen semanal tampoco repite esos títulos.
 */

const MAX_TITULOS = 1500
/** Los títulos de famosos estrenados hace más que esto ya no se miran. */
const FAMOSOS_DIAS = 540

type MediaType = 'movie' | 'tv'

interface Interesado {
  userId: string
  motivo: 'watchlist' | 'famoso'
  persona?: string
  rol?: 'cast' | 'crew'
}

interface Titulo {
  mediaType: MediaType
  id: number
  tituloEs: string | null
  tituloEn: string | null
  interesados: Interesado[]
}

interface Perfil {
  id: string
  country: string | null
  favorite_platforms: string[] | null
  notification_preferences: unknown
}

export interface ResumenDisponibilidad {
  titulos: number
  pedidos: number
  sinRespuesta: number
  sembrados: number
  llegadas: number
}

const clave = (t: string, id: number) => `${t}:${id}`

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

/** De a tandas de `n` ids, para no pasarse con un `.in()` enorme. */
async function porTandas<T>(ids: (string | number)[], n: number, fn: (tanda: (string | number)[]) => Promise<T[]>): Promise<T[]> {
  const salida: T[] = []
  for (let i = 0; i < ids.length; i += n) salida.push(...(await fn(ids.slice(i, i + n))))
  return salida
}

type Proveedor = { provider_id: number }
type PorPais = Record<string, { flatrate?: Proveedor[]; free?: Proveedor[]; ads?: Proveedor[] }>

function proveedoresDe(pais: PorPais[string] | undefined): number[] {
  const ids = new Set<number>()
  for (const p of [...(pais?.flatrate ?? []), ...(pais?.free ?? []), ...(pais?.ads ?? [])]) ids.add(p.provider_id)
  return [...ids].sort((a, b) => a - b)
}

export async function novedadesDeDisponibilidad(
  admin: SupabaseClient,
  resumen: ResumenDisponibilidad
): Promise<Novedad[]> {
  // ── Qué títulos le importan a quién.
  const [watchlist, seguimientos] = await Promise.all([
    todos<{ user_id: string; media_type: string; media_id: number; title: string | null }>(desde =>
      admin.from('watchlist').select('user_id, media_type, media_id, title').range(desde, desde + 999)
    ),
    todos<{ user_id: string; actor_id: number }>(desde =>
      admin.from('followed_actors').select('user_id, actor_id').range(desde, desde + 999)
    ),
  ])

  const titulos = new Map<string, Titulo>()
  const titulo = (t: MediaType, id: number) => {
    const k = clave(t, id)
    let x = titulos.get(k)
    if (!x) { x = { mediaType: t, id, tituloEs: null, tituloEn: null, interesados: [] }; titulos.set(k, x) }
    return x
  }

  for (const w of watchlist) {
    if (w.media_type !== 'movie' && w.media_type !== 'tv') continue
    const x = titulo(w.media_type, w.media_id)
    x.tituloEs ??= w.title?.trim() || null
    x.interesados.push({ userId: w.user_id, motivo: 'watchlist' })
  }

  const seguidores = new Map<number, string[]>()
  for (const s of seguimientos) seguidores.set(s.actor_id, [...(seguidores.get(s.actor_id) ?? []), s.user_id])
  if (seguidores.size > 0) {
    const [creditos, famosos] = await Promise.all([
      porTandas([...seguidores.keys()], 200, tanda => todos<{
        person_id: number; media_type: MediaType; media_id: number; rol: 'cast' | 'crew'
        titulo_es: string; titulo_en: string | null; fecha: string | null
      }>(desde => admin.from('famosos_creditos')
        .select('person_id, media_type, media_id, rol, titulo_es, titulo_en, fecha')
        .in('person_id', tanda)
        .gte('fecha', diaArgentina(FAMOSOS_DIAS))
        .lte('fecha', diaArgentina())
        .range(desde, desde + 999))),
      porTandas([...seguidores.keys()], 200, async tanda => {
        const { data, error } = await admin.from('famosos').select('person_id, nombre').in('person_id', tanda)
        if (error) throw new Error(`famosos: ${error.message}`)
        return (data ?? []) as { person_id: number; nombre: string }[]
      }),
    ])
    const nombre = new Map(famosos.map(f => [f.person_id, f.nombre]))
    for (const c of creditos) {
      const x = titulo(c.media_type, c.media_id)
      x.tituloEs = c.titulo_es
      x.tituloEn ??= c.titulo_en
      for (const userId of seguidores.get(c.person_id) ?? []) {
        x.interesados.push({ userId, motivo: 'famoso', persona: nombre.get(c.person_id), rol: c.rol })
      }
    }
  }

  // ── Quiénes pueden recibir: con plataformas y sin el aviso apagado.
  const usuarios = [...new Set([...titulos.values()].flatMap(t => t.interesados.map(i => i.userId)))]
  const perfiles = await porTandas(usuarios, 200, async tanda => {
    const { data, error } = await admin.from('profiles')
      .select('id, country, favorite_platforms, notification_preferences')
      .in('id', tanda as string[])
    if (error) throw new Error(`profiles: ${error.message}`)
    return (data ?? []) as Perfil[]
  })
  const plataformas = new Map<string, Map<number, string>>()
  const pais = new Map<string, string>()
  for (const p of perfiles) {
    const prefs = (p.notification_preferences ?? {}) as Record<string, unknown>
    if (prefs.disponibilidad === false) continue
    const mapa = plataformasDe(p.favorite_platforms)
    if (mapa.size === 0) continue
    plataformas.set(p.id, mapa)
    pais.set(p.id, /^[A-Z]{2}$/.test(p.country ?? '') ? p.country! : 'AR')
  }
  const conPlataformas = [...plataformas.keys()]

  // Lo que ya vio y lo que ya se le avisó no se vuelve a avisar.
  const [vistos, avisados] = await Promise.all([
    porTandas(conPlataformas, 100, tanda => todos<{ user_id: string; media_type: string; media_id: number }>(desde =>
      admin.from('watched').select('user_id, media_type, media_id').in('user_id', tanda as string[]).range(desde, desde + 999))),
    porTandas(conPlataformas, 100, tanda => todos<{ user_id: string; media_type: string; media_id: number }>(desde =>
      admin.from('avisos_disponibilidad').select('user_id, media_type, media_id').in('user_id', tanda as string[]).range(desde, desde + 999))),
  ])
  const descartado = new Set([...vistos, ...avisados].map(r => `${r.user_id}|${clave(r.media_type, r.media_id)}`))

  for (const t of titulos.values()) {
    // Una persona por título: si lo tiene guardado y además es de un famoso
    // que sigue, cuenta como "Ver después", que es más suyo.
    const porUsuario = new Map<string, Interesado>()
    for (const i of t.interesados) {
      if (!plataformas.has(i.userId) || descartado.has(`${i.userId}|${clave(t.mediaType, t.id)}`)) continue
      const previo = porUsuario.get(i.userId)
      if (!previo || (previo.motivo === 'famoso' && i.motivo === 'watchlist')) porUsuario.set(i.userId, i)
    }
    t.interesados = [...porUsuario.values()]
  }
  let aMirar = [...titulos.values()].filter(t => t.interesados.length > 0)

  // ── La foto anterior.
  const anteriores = await porTandas([...new Set(aMirar.map(t => t.id))], 200, tanda =>
    todos<{ media_type: string; media_id: number; pais: string; proveedores: number[]; revisado_en: string }>(desde =>
      admin.from('disponibilidad').select('media_type, media_id, pais, proveedores, revisado_en')
        .in('media_id', tanda as number[]).range(desde, desde + 999)))
  const foto = new Map<string, { proveedores: number[]; revisado_en: string }>()
  for (const a of anteriores) foto.set(`${clave(a.media_type, a.media_id)}|${a.pais}`, a)

  if (aMirar.length > MAX_TITULOS) {
    // Primero los que hace más que no se miran (los nunca mirados, antes que nadie).
    const ultima = (t: Titulo) => {
      let min = ''
      for (const [k, v] of foto) if (k.startsWith(`${clave(t.mediaType, t.id)}|`) && (!min || v.revisado_en < min)) min = v.revisado_en
      return min
    }
    aMirar = aMirar.map(t => ({ t, u: ultima(t) })).sort((a, b) => a.u.localeCompare(b.u)).slice(0, MAX_TITULOS).map(x => x.t)
  }
  resumen.titulos = aMirar.length

  // ── Hoy.
  const novedades: Novedad[] = []
  const nuevasFotos: { media_type: MediaType; media_id: number; pais: string; proveedores: number[]; revisado_en: string }[] = []
  const ahora = new Date().toISOString()
  const llegadas: { t: Titulo; i: Interesado; proveedor: number; nombre: string }[] = []

  await enParalelo(aMirar, 8, async t => {
    resumen.pedidos++
    const json = await tmdbJson<{ results?: PorPais }>(`/${t.mediaType}/${t.id}/watch/providers`)
    if (!json) { resumen.sinRespuesta++; return }
    const paises = new Set(t.interesados.map(i => pais.get(i.userId)!))
    for (const p of paises) {
      const hoy = proveedoresDe(json.results?.[p])
      const antes = foto.get(`${clave(t.mediaType, t.id)}|${p}`)
      nuevasFotos.push({ media_type: t.mediaType, media_id: t.id, pais: p, proveedores: hoy, revisado_en: ahora })
      if (!antes) { resumen.sembrados++; continue }
      const llegaron = hoy.filter(id => !antes.proveedores.includes(id))
      if (llegaron.length === 0) continue
      for (const i of t.interesados) {
        if (pais.get(i.userId) !== p) continue
        const suyas = plataformas.get(i.userId)!
        const proveedor = llegaron.find(id => suyas.has(id))
        if (proveedor !== undefined) llegadas.push({ t, i, proveedor, nombre: suyas.get(proveedor)! })
      }
    }
  })

  // La foto se guarda aunque no haya llegadas: es la de comparación de mañana.
  for (let i = 0; i < nuevasFotos.length; i += 500) {
    const { error } = await admin.from('disponibilidad').upsert(nuevasFotos.slice(i, i + 500), { onConflict: 'media_type,media_id,pais' })
    if (error) throw new Error(`disponibilidad: ${error.message}`)
  }
  if (llegadas.length === 0) return novedades

  // Los nombres que faltan: el de castellano si el título vino de "Ver
  // después" sin nombre, y el de inglés. Pocos: sólo los que llegaron.
  const sinNombre = [...new Set(llegadas.map(l => l.t))].filter(t => !t.tituloEs || !t.tituloEn)
  await enParalelo(sinNombre, 8, async t => {
    const [es, en] = await Promise.all([
      t.tituloEs ? null : tmdbJson<{ title?: string; name?: string }>(`/${t.mediaType}/${t.id}`, { language: 'es-AR' }),
      tmdbJson<{ title?: string; name?: string }>(`/${t.mediaType}/${t.id}`, { language: 'en-US' }),
    ])
    t.tituloEs ??= (es?.title ?? es?.name)?.trim() || null
    t.tituloEn ??= (en?.title ?? en?.name)?.trim() || null
  })

  for (const { t, i, proveedor, nombre } of llegadas) {
    const tituloEs = t.tituloEs ?? t.tituloEn ?? ''
    if (!tituloEs) continue
    novedades.push({
      userId: i.userId,
      type: i.motivo === 'watchlist' ? 'watchlist_disponible' : 'famoso_disponible',
      entityId: String(t.id),
      entityType: t.mediaType,
      entityTitle: `Ya está en ${nombre}: ${tituloEs}`,
      datos: { persona: i.persona, rol: i.rol, titulo_es: tituloEs, titulo_en: t.tituloEn, plataforma: nombre },
    })
    // Se anota acá y no después de la push: aunque el tope la deje sin push,
    // la novedad ya está en la bandeja y no se repite.
    const { error } = await admin.from('avisos_disponibilidad').upsert({
      user_id: i.userId, media_type: t.mediaType, media_id: t.id, proveedor, motivo: i.motivo,
    }, { onConflict: 'user_id,media_type,media_id', ignoreDuplicates: true })
    if (error) throw new Error(`avisos_disponibilidad: ${error.message}`)
  }
  resumen.llegadas = novedades.length
  return novedades
}
