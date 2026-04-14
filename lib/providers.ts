// Popular streaming providers in Argentina with their TMDB IDs
export const STREAMING_PROVIDERS: Record<number, { name: string; logo: string }> = {
  8: { name: 'Netflix', logo: 'https://image.tmdb.org/t/p/original/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg' },
  337: { name: 'Disney+', logo: 'https://image.tmdb.org/t/p/original/7rwgEs15tFwyR9NPQ5vpzxTj19d.jpg' },
  119: { name: 'Amazon Prime', logo: 'https://image.tmdb.org/t/p/original/68MNrwlkpF7WnmNPXLah69CR5xh.jpg' },
  384: { name: 'HBO Max', logo: 'https://image.tmdb.org/t/p/original/Ajqyt5aNxNGjmF9uOfxArGrdf3X.jpg' },
  2: { name: 'Apple TV+', logo: 'https://image.tmdb.org/t/p/original/6uhKBfmtzFqOcLousHwZuzcrScK.jpg' },
  283: { name: 'Crunchyroll', logo: 'https://image.tmdb.org/t/p/original/8Gt1iClBlzTeQs8WQm8UrCoIxnQ.jpg' },
  39: { name: 'Claro Video', logo: 'https://image.tmdb.org/t/p/original/cDzkhgBxFKJMvdN94oGNvPBRmXo.jpg' },
  167: { name: 'Paramount+', logo: 'https://image.tmdb.org/t/p/original/h5DcR0J2EESLitnhR8xLG1QymTE.jpg' },
  531: { name: 'Paramount+', logo: 'https://image.tmdb.org/t/p/original/h5DcR0J2EESLitnhR8xLG1QymTE.jpg' },
  619: { name: 'Star+', logo: 'https://image.tmdb.org/t/p/original/6enFbwsOWBaHAe1aHOblEBLBOqg.jpg' },
}

export const PROVIDER_FILTER_OPTIONS = [
  { id: 8, name: 'Netflix' },
  { id: 337, name: 'Disney+' },
  { id: 119, name: 'Amazon Prime' },
  { id: 384, name: 'HBO Max' },
  { id: 2, name: 'Apple TV+' },
  { id: 167, name: 'Paramount+' },
  { id: 619, name: 'Star+' },
]

// All platforms shown in the logo strip and platform pages.
// fallbackLogoPath: TMDB relative logo path used when getARProviders() doesn't return a logo
// for this provider (some IDs aren't present in TMDB's AR region list).
export interface PlatformConfig {
  id: number
  slug: string
  name: string
  color: string
  fallbackLogoPath: string | null
}

export const ALL_PLATFORMS: PlatformConfig[] = [
  { id: 8,   slug: 'netflix',        name: 'Netflix',            color: '#E50914', fallbackLogoPath: '/t2yyOv40HZeVlLjYsCsPHnWLk4W.jpg' },
  { id: 337, slug: 'disney-plus',    name: 'Disney+',            color: '#113CCF', fallbackLogoPath: '/7rwgEs15tFwyR9NPQ5vpzxTj19d.jpg'  },
  { id: 119, slug: 'amazon-prime',   name: 'Amazon Prime Video', color: '#00A8E0', fallbackLogoPath: '/68MNrwlkpF7WnmNPXLah69CR5xh.jpg'  },
  { id: 384, slug: 'max',            name: 'Max',                color: '#5822B4', fallbackLogoPath: '/Ajqyt5aNxNGjmF9uOfxArGrdf3X.jpg'  },
  { id: 531, slug: 'paramount-plus', name: 'Paramount+',         color: '#0064FF', fallbackLogoPath: '/h5DcR0J2EESLitnhR8xLG1QymTE.jpg'  },
  { id: 350, slug: 'apple-tv-plus',  name: 'Apple TV+',          color: '#3A3A3C', fallbackLogoPath: null                                },
  { id: 283, slug: 'crunchyroll',    name: 'Crunchyroll',        color: '#F47521', fallbackLogoPath: '/8Gt1iClBlzTeQs8WQm8UrCoIxnQ.jpg'  },
  { id: 300, slug: 'pluto-tv',       name: 'Pluto TV',           color: '#00C8FA', fallbackLogoPath: null                                },
  { id: 339, slug: 'directv-go',     name: 'DIRECTV Go',         color: '#00A0D1', fallbackLogoPath: null                                },
  { id: 621, slug: 'mercado-play',   name: 'Mercado Play',       color: '#FFE600', fallbackLogoPath: null                                },
  { id: 692, slug: 'cine-ar-play',   name: 'Cine AR Play',       color: '#1A5276', fallbackLogoPath: null                                },
  { id: 11,  slug: 'mubi',           name: 'Mubi',               color: '#1C1C1C', fallbackLogoPath: null                                },
  { id: 457, slug: 'vix',            name: 'Vix',                color: '#E8500A', fallbackLogoPath: null                                },
  { id: 39,  slug: 'claro-video',    name: 'Claro Video',        color: '#DA0000', fallbackLogoPath: '/cDzkhgBxFKJMvdN94oGNvPBRmXo.jpg'  },
  { id: 149, slug: 'movistar-tv',    name: 'Movistar TV',        color: '#019DF4', fallbackLogoPath: '/3aXj9cDFNTRjXUoIKHiKBcFvPcKx.jpg' },
]

export type Platform = PlatformConfig & { logoPath?: string | null }
