import { ALL_PLATFORMS, FAMILIAS_DE_PLATAFORMA } from './providers'

/**
 * Todos los proveedores de TMDB, sin región: id → nombre y logo. Sirve para
 * nombrar lo que una lista de un país no tiene, como la plataforma elegida en
 * otro país, que es la que hay que avisar que falta.
 */
export async function nombresDeProveedores(): Promise<Map<number, { nombre: string; logoPath: string | null }>> {
  type Fila = { provider_id: number; provider_name: string; logo_path: string | null }
  const pedir = async (ruta: string) => {
    const qs = new URLSearchParams({ api_key: process.env.NEXT_PUBLIC_TMDB_API_KEY ?? '' })
    const res = await fetch(`https://api.themoviedb.org/3${ruta}?${qs}`, { next: { revalidate: 86400 } })
    if (!res.ok) throw new Error(`TMDB ${res.status}`)
    return ((await res.json()) as { results?: Fila[] }).results ?? []
  }
  const [cine, tv] = await Promise.all([pedir('/watch/providers/movie'), pedir('/watch/providers/tv')])
  const mapa = new Map<number, { nombre: string; logoPath: string | null }>()
  for (const f of [...cine, ...tv]) mapa.set(f.provider_id, { nombre: f.provider_name.trim(), logoPath: f.logo_path })
  return mapa
}

/** Los nombres de esos ids, para un aviso. Los que no se sepan se omiten; nunca tira. */
export async function nombresDePlataformas(ids: number[]): Promise<string[]> {
  const conocido = (id: number) =>
    FAMILIAS_DE_PLATAFORMA.find(f => f.ids.includes(id))?.name ?? ALL_PLATFORMS.find(p => p.id === id)?.name
  const delCatalogo = ids.every(id => conocido(id))
    ? null
    : await nombresDeProveedores().catch(() => null)
  return [...new Set(ids.map(id => conocido(id) ?? delCatalogo?.get(id)?.nombre).filter((n): n is string => !!n))]
}
