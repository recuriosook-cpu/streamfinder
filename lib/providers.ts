// Streaming providers — TMDB IDs verified against watch_region=AR
export const STREAMING_PROVIDERS: Record<number, { name: string; logo: string }> = {
  8:   { name: 'Netflix',       logo: 'https://image.tmdb.org/t/p/w154/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg' },
  337: { name: 'Disney+',       logo: 'https://image.tmdb.org/t/p/w154/7rwgEs15tFwyR9NPQ5vpzxTj19d.jpg'  },
  119: { name: 'Amazon Prime',  logo: 'https://image.tmdb.org/t/p/w154/68MNrwlkpF7WnmNPXLah69CR5xh.jpg'  },
  1899: { name: 'Max',          logo: 'https://image.tmdb.org/t/p/w154/jbe4gVSfRlbPTdESXhEKpornsfu.jpg'  },
  283: { name: 'Crunchyroll',   logo: 'https://image.tmdb.org/t/p/w154/8Gt1iClBlzTeQs8WQm8UrCoIxnQ.jpg'  },
  167: { name: 'Claro Video',   logo: 'https://image.tmdb.org/t/p/w154/21M5CpiOYGOhHj2sVPXqwt6yeTO.jpg'  },
  531: { name: 'Paramount+',    logo: 'https://image.tmdb.org/t/p/w154/h5DcR0J2EESLitnhR8xLG1QymTE.jpg'  },
  619: { name: 'Star+',         logo: 'https://image.tmdb.org/t/p/w154/6enFbwsOWBaHAe1aHOblEBLBOqg.jpg'  },
}

export const PROVIDER_FILTER_OPTIONS = [
  { id: 8,   name: 'Netflix'       },
  { id: 337, name: 'Disney+'       },
  { id: 119, name: 'Amazon Prime'  },
  { id: 1899, name: 'Max'          },
  { id: 531, name: 'Paramount+'    },
  { id: 619, name: 'Star+'         },
]

// All platforms shown in the logo strip and platform pages.
// fallbackLogoPath: TMDB relative logo path (used when getRegionProviders() doesn't
// return a logo for this provider in the selected region).
export interface PlatformConfig {
  id: number
  slug: string
  name: string
  color: string
  fallbackLogoPath: string | null
}

export const ALL_PLATFORMS: PlatformConfig[] = [
  // Global / major
  { id: 8,    slug: 'netflix',        name: 'Netflix',            color: '#E50914', fallbackLogoPath: '/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg' },
  { id: 337,  slug: 'disney-plus',    name: 'Disney+',            color: '#113CCF', fallbackLogoPath: '/7rwgEs15tFwyR9NPQ5vpzxTj19d.jpg'  },
  { id: 119,  slug: 'amazon-prime',   name: 'Amazon Prime Video', color: '#00A8E0', fallbackLogoPath: '/68MNrwlkpF7WnmNPXLah69CR5xh.jpg'  },
  { id: 1899, slug: 'max',            name: 'Max',                color: '#5822B4', fallbackLogoPath: '/jbe4gVSfRlbPTdESXhEKpornsfu.jpg'  },
  { id: 531,  slug: 'paramount-plus', name: 'Paramount+',         color: '#0064FF', fallbackLogoPath: '/h5DcR0J2EESLitnhR8xLG1QymTE.jpg'  },
  { id: 350,  slug: 'apple-tv-plus',  name: 'Apple TV+',          color: '#3A3A3C', fallbackLogoPath: null                                },
  { id: 283,  slug: 'crunchyroll',    name: 'Crunchyroll',        color: '#F47521', fallbackLogoPath: '/fzN5Jok5Ig1eJ7gyNGoMhnLSCfh.jpg'  },
  { id: 300,  slug: 'pluto-tv',       name: 'Pluto TV',           color: '#00C8FA', fallbackLogoPath: '/xm8xr6LDdY5j2gjYf1S3yqaeRbE.jpg'  },
  // Latin America / AR-specific
  { id: 467,  slug: 'directv-go',     name: 'DIRECTV Go',         color: '#00A0D1', fallbackLogoPath: '/nr5UBW4IGKgBwmhpTMOfcvnX2vX.jpg'  },
  { id: 2302, slug: 'mercado-play',   name: 'Mercado Play',       color: '#FFE600', fallbackLogoPath: '/60iyHW9xKBKVBf0kxiQixuLqG1f.jpg'  },
  { id: 491,  slug: 'cine-ar-play',   name: 'Cine AR',            color: '#1A5276', fallbackLogoPath: '/21uSo4VQUdEmeA6RJ6gPSRwusbt.jpg'  },
  { id: 167,  slug: 'claro-video',    name: 'Claro Video',        color: '#DA0000', fallbackLogoPath: '/21M5CpiOYGOhHj2sVPXqwt6yeTO.jpg'  },
  { id: 339,  slug: 'movistar-tv',    name: 'Movistar TV',        color: '#019DF4', fallbackLogoPath: '/tRNA2CRgA4XHvd7Mx9dH3sFtDVb.jpg'  },
  { id: 11,   slug: 'mubi',           name: 'Mubi',               color: '#1C1C1C', fallbackLogoPath: null                                },
  { id: 457,  slug: 'vix',            name: 'Vix',                color: '#E8500A', fallbackLogoPath: null                                },
]

export type Platform = PlatformConfig & { logoPath?: string | null }

// ── Per-provider search URLs ─────────────────────────────────────────────────

const PROVIDER_URL_TEMPLATES: Record<number, (q: string) => string> = {
  8:    q => `https://www.netflix.com/search?q=${q}`,
  337:  q => `https://www.disneyplus.com/es-419/search?q=${q}`,
  119:  q => `https://www.primevideo.com/search?phrase=${q}`,
  1899: q => `https://www.max.com/es-ar/search?q=${q}`,
  350:  q => `https://tv.apple.com/search?term=${q}`,
  531:  q => `https://www.paramountplus.com/ar/search/${q}/`,
  11:   q => `https://mubi.com/es/search?q=${q}`,
  283:  q => `https://www.crunchyroll.com/es/search?q=${q}`,
  300:  q => `https://pluto.tv/es/search?q=${q}`,
  457:  q => `https://www.vix.com/es/search?q=${q}`,
  619:  q => `https://www.disneyplus.com/es-419/search?q=${q}`, // Star+ → Disney+ in LATAM
  167:  q => `https://www.clarovideo.com/argentina/search?q=${q}`,
  467:  q => `https://www.directvgo.com/buscar?q=${q}`,
  339:  q => `https://www.movistartv.com.ar/search?q=${q}`,
  2302: q => `https://www.mercadoplay.com/search?q=${q}`,
  491:  q => `https://cine.ar/search?q=${q}`,
}

/**
 * Returns a direct search URL for the given provider and title.
 * Falls back to null if the provider has no known URL template.
 */
export function buildProviderUrl(providerId: number, title: string): string | null {
  const fn = PROVIDER_URL_TEMPLATES[providerId]
  return fn ? fn(encodeURIComponent(title)) : null
}

// ── Las "plataformas grandes" ────────────────────────────────────────────────

/**
 * Las cinco plataformas que justifican pagar una VPN para verlas.
 *
 * Es la lista que decide si aparece el bloque de Surfshark: si el título está
 * en alguna de estas en tu país, no hay nada que sugerir. Para cambiar la
 * regla alcanza con agregar o sacar una familia de acá.
 *
 * ── Por qué cada una es una familia de IDs y no un número ──────────────────
 *
 * TMDB no tiene un ID por plataforma sino uno por *oferta*: cada plan, cada
 * relanzamiento de marca y cada reventa a través de otra tienda entra al
 * catálogo como un proveedor nuevo, con su propio ID y su propio logo. Netflix
 * con publicidad es 1796 y no 8; Paramount+ tiene siete IDs entre planes y
 * reventas. Mirar un solo número es el bug que ya tuvimos con Max, que arrastra
 * el 384 viejo además del 1899 de hoy.
 *
 * Los IDs de abajo salieron de cruzar `/watch/providers/movie` y
 * `/watch/providers/tv` (896 proveedores) con los que realmente aparecen en las
 * respuestas de `watch/providers` de 120 títulos populares. Todos menos el 384
 * están vivos hoy; ese queda por lo que decíamos, porque cuesta cero.
 *
 * ── Ojo con los "Amazon Channel" ──────────────────────────────────────────
 *
 * Hay casi 400 proveedores que terminan en "Amazon Channel" y NO son Prime
 * Video: son suscripciones de terceros que Amazon revende adentro de su app.
 * "AMC+ Amazon Channel" es AMC+, no Prime Video; "Shudder Amazon Channel" es
 * Shudder. Meterlos todos en la familia de Prime Video haría que cualquier
 * canal de nicho contara como plataforma grande, que es justo lo contrario de
 * lo que la lista quiere decir.
 *
 * Los únicos que entran son los de una plataforma grande revendida: "HBO Max
 * Amazon Channel" es HBO Max, y va con HBO Max. Igual con las reventas por
 * Apple TV y por Roku de Paramount+.
 */
export const PLATAFORMAS_GRANDES: { slug: string; name: string; ids: number[] }[] = [
  {
    slug: 'hbo-max',
    name: 'HBO Max',
    //   1899 HBO Max · 384 el ID viejo · 1825 reventa por Amazon · 2284 por U-NEXT (JP)
    ids: [1899, 384, 1825, 2284],
  },
  {
    slug: 'netflix',
    name: 'Netflix',
    //   8 Netflix · 1796 Standard with Ads · 175 Netflix Kids
    ids: [8, 1796, 175],
  },
  {
    slug: 'disney-plus',
    name: 'Disney+',
    //   337 "Disney Plus" · 122 "Disney+", el ID que usan varias regiones
    ids: [337, 122],
  },
  {
    slug: 'prime-video',
    name: 'Prime Video',
    //   119 y 9 Prime Video · 2100 with Ads · 613 Free with Ads
    //   (el 10, "Amazon Video", es la tienda de alquiler y compra: no entra)
    ids: [119, 9, 2100, 613],
  },
  {
    slug: 'paramount-plus',
    name: 'Paramount+',
    //   531 Paramount+ · 2303 Premium · 2304 Basic with Ads · 2616 Essential
    //   582 reventa por Amazon · 1853 por Apple TV · 633 por Roku
    ids: [531, 2303, 2304, 2616, 582, 1853, 633],
  },
]

/** ID de proveedor → slug de la familia grande. Se arma una sola vez. */
const FAMILIA_POR_ID = new Map<number, string>(
  PLATAFORMAS_GRANDES.flatMap(f => f.ids.map(id => [id, f.slug] as [number, string])),
)

/**
 * El slug de la plataforma grande a la que pertenece el proveedor, o `null`.
 *
 * Sirve para las dos preguntas que hace `VpnSuggestion`: si un proveedor es
 * grande, y si dos proveedores distintos son en realidad la misma plataforma
 * —Netflix y "Netflix Standard with Ads" no son dos razones para viajar—.
 */
export function familiaGrande(providerId: number): string | null {
  return FAMILIA_POR_ID.get(providerId) ?? null
}

export function esPlataformaGrande(providerId: number): boolean {
  return FAMILIA_POR_ID.has(providerId)
}
