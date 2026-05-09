import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/ajustes/',
        '/favorites',
        '/importar',
        '/listas/nueva',
        '/onboarding',
        '/profile',
        '/siguiendo',
      ],
    },
    sitemap: 'https://glynbox.com/sitemap.xml',
  }
}
