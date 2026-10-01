import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // `/api/share/` son las imágenes de vista previa (og:image) de fichas
        // y reseñas. Sin este permiso, el `disallow` de `/api/` de abajo les
        // prohíbe bajarlas a los bots que respetan robots.txt (el de X, el de
        // Facebook) y el link sale sin imagen. La regla más específica gana.
        allow: ['/', '/api/share/'],
        disallow: [
          '/api/',
          '/admin/',
          '/ajustes/',
          '/auth/',
          '/favorites',
          '/importar',
          '/listas/nueva',
          '/onboarding',
          '/profile',
          '/siguiendo',
        ],
      },
      { userAgent: 'GPTBot',          disallow: '/' },
      { userAgent: 'ChatGPT-User',    disallow: '/' },
      { userAgent: 'CCBot',           disallow: '/' },
      { userAgent: 'ClaudeBot',       disallow: '/' },
      { userAgent: 'anthropic-ai',    disallow: '/' },
      { userAgent: 'Claude-Web',      disallow: '/' },
      { userAgent: 'PerplexityBot',   disallow: '/' },
      { userAgent: 'Google-Extended', disallow: '/' },
      { userAgent: 'cohere-ai',       disallow: '/' },
      { userAgent: 'Amazonbot',       disallow: '/' },
      { userAgent: 'FacebookBot',     disallow: '/' },
      { userAgent: 'YandexBot',       disallow: '/' },
      { userAgent: 'Bytespider',      disallow: '/' },
      // Rastreadores de herramientas de SEO: recorren el catálogo entero por
      // los links entre fichas y no le traen visitas a nadie. Cada ficha que
      // piden ejecuta una función (los bots eran el 99,7 % de las fichas
      // pedidas el 2026-10-01). A los bots verificados el Firewall los deja
      // pasar, así que para ésos el único freno es pedírselo acá.
      { userAgent: 'AhrefsBot',       disallow: '/' },
      { userAgent: 'SemrushBot',      disallow: '/' },
      { userAgent: 'MJ12bot',         disallow: '/' },
      { userAgent: 'DotBot',          disallow: '/' },
      { userAgent: 'PetalBot',        disallow: '/' },
      { userAgent: 'DataForSeoBot',   disallow: '/' },
      { userAgent: 'BLEXBot',         disallow: '/' },
      { userAgent: 'SeekportBot',     disallow: '/' },
      { userAgent: 'serpstatbot',     disallow: '/' },
      { userAgent: 'Barkrowler',      disallow: '/' },
    ],
    sitemap: 'https://glynbox.com/sitemap.xml',
  }
}
