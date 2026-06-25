import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
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
    ],
    sitemap: 'https://glynbox.com/sitemap.xml',
  }
}
