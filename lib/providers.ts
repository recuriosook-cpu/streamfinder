// Streaming providers — TMDB IDs verified against watch_region=AR
export const STREAMING_PROVIDERS: Record<number, { name: string; logo: string }> = {
  8:   { name: 'Netflix',       logo: 'https://image.tmdb.org/t/p/original/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg' },
  337: { name: 'Disney+',       logo: 'https://image.tmdb.org/t/p/original/7rwgEs15tFwyR9NPQ5vpzxTj19d.jpg'  },
  119: { name: 'Amazon Prime',  logo: 'https://image.tmdb.org/t/p/original/68MNrwlkpF7WnmNPXLah69CR5xh.jpg'  },
  384: { name: 'Max',           logo: 'https://image.tmdb.org/t/p/original/Ajqyt5aNxNGjmF9uOfxArGrdf3X.jpg'  },
  283: { name: 'Crunchyroll',   logo: 'https://image.tmdb.org/t/p/original/8Gt1iClBlzTeQs8WQm8UrCoIxnQ.jpg'  },
  167: { name: 'Claro Video',   logo: 'https://image.tmdb.org/t/p/original/21M5CpiOYGOhHj2sVPXqwt6yeTO.jpg'  },
  531: { name: 'Paramount+',    logo: 'https://image.tmdb.org/t/p/original/h5DcR0J2EESLitnhR8xLG1QymTE.jpg'  },
  619: { name: 'Star+',         logo: 'https://image.tmdb.org/t/p/original/6enFbwsOWBaHAe1aHOblEBLBOqg.jpg'  },
}

export const PROVIDER_FILTER_OPTIONS = [
  { id: 8,   name: 'Netflix'       },
  { id: 337, name: 'Disney+'       },
  { id: 119, name: 'Amazon Prime'  },
  { id: 384, name: 'Max'           },
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
  { id: 384,  slug: 'max',            name: 'Max',                color: '#5822B4', fallbackLogoPath: '/Ajqyt5aNxNGjmF9uOfxArGrdf3X.jpg'  },
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
  384:  q => `https://www.max.com/es-ar/search?q=${q}`,
  1899: q => `https://www.max.com/es-ar/search?q=${q}`,   // HBO Max legacy ID
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
