import { ALL_PLATFORMS, FAMILIAS_DE_PLATAFORMA, PLATAFORMAS_GRANDES, esReventa, idCanonico, nombreBase, type Platform } from './providers'

/**
 * Las plataformas de un país, de TMDB (`/watch/providers/{movie,tv}` por
 * región), ordenadas por popularidad y con su logo. Es la lista que ven el
 * inicio, el onboarding, "Mis plataformas", los filtros y "¿Qué veo hoy?", en
 * la web y en la app (por `/api/plataformas`).
 *
 * TMDB no da esto listo para mostrar. Lo que se corrige acá, viendo las listas
 * reales de Argentina, México, España y Estados Unidos:
 *
 *   · Una plataforma son varios proveedores: planes ("Netflix Standard with
 *     Ads"), reventas ("HBO Max Amazon Channel") y hasta ids distintos según el
 *     país (Prime Video es 119 en casi todos lados y 9 en Estados Unidos). Se
 *     junta todo en una, con un `id` que no cambia de un país a otro: es el que
 *     se guarda en el perfil, así quien eligió Prime Video en Argentina sigue
 *     teniéndola en Estados Unidos.
 *   · Las tiendas de alquiler y compra (Apple TV Store, Amazon Video, Google
 *     Play) no son plataformas que uno "tiene". Tampoco JustWatch TV, que TMDB
 *     pone arriba en España y Estados Unidos.
 *   · El orden de TMDB (`display_priorities`) es bueno salvo por las grandes:
 *     HBO Max está 33ª en Argentina y 18ª en España. Las grandes van primero y
 *     el resto como lo ordena TMDB.
 *   · Argentina tiene 63 proveedores y Estados Unidos 339, casi todos de nicho.
 *     Se devuelven todos (una plataforma rara que eligió alguien tiene que
 *     seguir contando como disponible) pero sólo se ofrecen las `destacada`.
 */

export interface PlataformaPais extends Platform {
  /** Todos los ids de TMDB de esta plataforma en este país, más `id`. Para consultar `with_watch_providers`. */
  ids: number[]
  /** Si se ofrece en las grillas y los filtros. Las demás sólo se muestran si ya las había elegido. */
  destacada: boolean
}

/** Cuántas se ofrecen como mínimo, además de las conocidas de `ALL_PLATFORMS`. */
const DESTACADAS = 24

/** Sin logo en una plataforma que no es de las conocidas: un gris neutro de fondo. */
const COLOR_GENERICO = '#2A2A3A'

const TIENDAS = new Set([2, 3, 7, 10, 68, 192, 332])
const NO_ES_PLATAFORMA = /^justwatch\b|\bstore$/i

const GRANDES = new Set(PLATAFORMAS_GRANDES.flatMap(f => f.ids))
GRANDES.add(350) // Apple TV: no está en la lista de la VPN, pero es de las grandes.

const CONOCIDAS = new Map(ALL_PLATFORMS.map(p => [p.id, p]))

/** Nombres de TMDB que se ven mal: "Disney Plus", "VIX ", "CINE". */
const NOMBRES: Record<number, string> = {
  8: 'Netflix', 119: 'Prime Video', 337: 'Disney+', 1899: 'HBO Max', 531: 'Paramount+',
  350: 'Apple TV', 457: 'ViX', 491: 'Cine AR', 467: 'DIRECTV GO', 167: 'Claro Video',
  339: 'Movistar TV', 11: 'Mubi', 386: 'Peacock',
}

interface Fila {
  provider_id: number
  provider_name: string
  logo_path: string | null
  display_priority?: number
  display_priorities?: Record<string, number>
}

/** Sin sufijo de reventa. "The Roku Channel" es una marca: "Roku Channel" no es su reventa. */
function nombreLimpio(nombre: string): string {
  const base = nombreBase(nombre).replace(/\s+\+$/, '+')
  return base.toLowerCase() === 'the' ? nombre.trim() : base
}

/** Para juntar "MGM+", "MGM Plus" y "MGM+ Amazon Channel". */
function claveDeNombre(nombre: string): string {
  return nombreLimpio(nombre).toLowerCase().replace(/\+/g, ' plus').replace(/\s+/g, ' ').trim()
}

function aSlug(nombre: string, id: number): string {
  const base = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${base || 'plataforma'}-${id}`
}

/** El id de TMDB de un slug de plataforma no conocida ("hulu-15" → 15). */
export function idDeSlug(slug: string): number | null {
  const m = /-(\d+)$/.exec(slug)
  return m ? Number(m[1]) : null
}

/** Arma la lista a partir de lo que devuelve TMDB. Separada para poder probarla sin red. */
export function armarPlataformas(filas: Fila[], pais: string): PlataformaPais[] {
  const prioridad = (f: Fila) => f.display_priorities?.[pais] ?? f.display_priority ?? 999

  // Primero las familias (por id) y después por nombre: "Paramount Plus Apple TV
  // channel" va con Paramount+ aunque su nombre base sea otro.
  const grupos = new Map<string, Fila[]>()
  const vistas = new Set<number>()
  for (const f of filas) {
    if (vistas.has(f.provider_id)) continue
    vistas.add(f.provider_id)
    if (TIENDAS.has(f.provider_id) || NO_ES_PLATAFORMA.test(f.provider_name.trim())) continue
    const canonico = idCanonico(f.provider_id)
    const clave = FAMILIAS_DE_PLATAFORMA.some(fam => fam.ids[0] === canonico) ? `id:${canonico}` : `n:${claveDeNombre(f.provider_name)}`
    grupos.set(clave, [...(grupos.get(clave) ?? []), f])
  }

  // Una misma fila puede venir de cine y de TV con distinta prioridad.
  const mejorPrioridad = new Map<number, number>()
  for (const f of filas) {
    mejorPrioridad.set(f.provider_id, Math.min(mejorPrioridad.get(f.provider_id) ?? 999, prioridad(f)))
  }
  const prio = (f: Fila) => mejorPrioridad.get(f.provider_id) ?? 999

  const lista = [...grupos.values()].map(miembros => {
    const ordenados = [...miembros].sort((a, b) => prio(a) - prio(b))
    const directo = ordenados.find(f => !esReventa(f.provider_name)) ?? ordenados[0]
    const id = idCanonico(directo.provider_id)
    const conocida = CONOCIDAS.get(id)
    const familia = FAMILIAS_DE_PLATAFORMA.find(fam => fam.ids[0] === id)
    const delId = ordenados.find(f => f.provider_id === id) ?? directo
    const nombre = NOMBRES[id] ?? familia?.name ?? conocida?.name ?? nombreLimpio(directo.provider_name)
    const plataforma: PlataformaPais = {
      id,
      slug: conocida?.slug ?? aSlug(nombre, id),
      name: nombre,
      color: conocida?.color ?? COLOR_GENERICO,
      fallbackLogoPath: conocida?.fallbackLogoPath ?? null,
      logoPath: delId.logo_path ?? directo.logo_path ?? null,
      ids: [...new Set([id, ...ordenados.map(f => f.provider_id)])],
      destacada: false,
    }
    return { plataforma, orden: prio(ordenados[0]), grande: GRANDES.has(id) }
  })

  lista.sort((a, b) => (a.grande === b.grande ? a.orden - b.orden : a.grande ? -1 : 1))
  return lista.map(({ plataforma }, i) => ({
    ...plataforma,
    destacada: i < DESTACADAS || CONOCIDAS.has(plataforma.id),
  }))
}

const TMDB = 'https://api.themoviedb.org/3'

async function pedir(ruta: string, pais: string): Promise<Fila[]> {
  const qs = new URLSearchParams({ api_key: process.env.NEXT_PUBLIC_TMDB_API_KEY ?? '', watch_region: pais })
  const res = await fetch(`${TMDB}${ruta}?${qs}`, { next: { revalidate: 86400 } })
  if (!res.ok) throw new Error(`TMDB ${res.status}`)
  return ((await res.json()) as { results?: Fila[] }).results ?? []
}

/**
 * La lista del país. Tira si TMDB falló, en cine o en TV: una lista a medias
 * haría creer que falta una plataforma que sí está.
 */
export async function plataformasDelPais(pais: string): Promise<PlataformaPais[]> {
  const [cine, tv] = await Promise.all([pedir('/watch/providers/movie', pais), pedir('/watch/providers/tv', pais)])
  return armarPlataformas([...cine, ...tv], pais)
}

/** La de la lista que corresponde a un id guardado, sea el `id` o uno de sus `ids`. */
export function plataformaDeId(lista: PlataformaPais[], id: number): PlataformaPais | undefined {
  const canonico = idCanonico(id)
  return lista.find(p => p.id === canonico || p.ids.includes(id))
}

/**
 * Las elegidas contra la lista del país: `vigentes` con el id de la lista y sin
 * repetidos, `faltantes` las que en ese país no existen.
 */
export function separarElegidas(elegidas: number[], lista: PlataformaPais[]): { vigentes: number[]; faltantes: number[] } {
  const vigentes = new Set<number>()
  const faltantes: number[] = []
  for (const id of elegidas) {
    const p = plataformaDeId(lista, id)
    if (p) vigentes.add(p.id)
    else faltantes.push(id)
  }
  return { vigentes: [...vigentes], faltantes }
}

/** Lo que se ofrece: las destacadas y, aunque sean raras, las que ya eligió. */
export function plataformasAMostrar(lista: PlataformaPais[], elegidas: number[] = []): PlataformaPais[] {
  return lista.filter(p => p.destacada || p.ids.some(id => elegidas.includes(id)))
}

/** La lista conocida, para cuando TMDB no responde. No se usa para avisar de nada. */
export const PLATAFORMAS_DE_RESPALDO: PlataformaPais[] = ALL_PLATFORMS.map(p => ({
  ...p,
  logoPath: p.fallbackLogoPath,
  ids: [p.id],
  destacada: true,
}))

/** "Cine.Ar, Mubi y Vix". */
export function juntarNombres(nombres: string[]): string {
  if (nombres.length < 2) return nombres[0] ?? ''
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}
