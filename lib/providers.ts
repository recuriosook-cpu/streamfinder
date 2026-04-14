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
  /** TMDB-relative logo path (e.g. /abc123.jpg) — prepend image.tmdb.org/t/p/original */
  fallbackLogoPath: string | null
  /** Full external logo URL for providers not indexed by TMDB */
  staticLogoUrl?: string | null
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
  // Providers not in TMDB — shown in logo strip only, no content carousel
  { id: 9001, slug: 'flow',           name: 'Flow',               color: '#6B2D8B', fallbackLogoPath: null, staticLogoUrl: 'https://logo.clearbit.com/flow.com.ar'       },
  { id: 9002, slug: 'telecentro-play',name: 'Telecentro Play',    color: '#FF6600', fallbackLogoPath: null, staticLogoUrl: 'https://logo.clearbit.com/telecentro.com.ar' },
]

export type Platform = PlatformConfig & { logoPath?: string | null }
