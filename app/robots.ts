import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/profile', '/favoritos', '/siguiendo'],
    },
    sitemap: 'https://glynbox.com/sitemap.xml',
  }
}
