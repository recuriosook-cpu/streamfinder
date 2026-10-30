import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  // Las imágenes de compartir (lib/share-image.tsx) leen las fuentes y el logo
  // del disco en runtime. El rastreo de archivos suele encontrarlos solo; esto
  // lo asegura, porque si faltan cada imagen da 500.
  outputFileTracingIncludes: {
    '/api/share/**': ['./assets/share-fonts/**/*', './public/logo.png', './public/guias/**/*', './content/guides/**/*'],
    '/api/guias/**': ['./public/guias/**/*', './content/guides/**/*'],
    // El texto de las respuestas en guías lleva el título de la guía (`lib/notification-content.ts`).
    '/api/push/**': ['./content/guides/**/*'],
    '/api/notifications/**': ['./content/guides/**/*'],
  },
  async redirects() {
    return [
      { source: '/siguiendo', destination: '/comunidad', permanent: true },
    ]
  },
  async rewrites() {
    return [
      // public/ no sirve index.html al pedir la carpeta: la página de soporte de
      // Potion Bottle (la que figura en las tiendas) se pide sin el archivo.
      { source: '/potion-bottle', destination: '/potion-bottle/index.html' },
    ]
  },
  async headers() {
    return [
      {
        // Android exige `application/json` para verificar los App Links. Next
        // sirve el archivo desde public/ pero, al no tener extensión conocida
        // en algunos entornos, puede mandarlo como texto plano y la
        // verificación falla sin decir por qué.
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      {
        // Lo mismo para iOS: el archivo no tiene extensión y Apple lo quiere
        // como JSON. Ver public/.well-known/README.md.
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      // Las fichas del catálogo se cachean 24 h en la CDN de Vercel y no con
      // ISR: las escrituras de ISR se cobran y los bots generan fichas nuevas
      // sin parar (ver el comentario de app/movie/[id]/page.tsx). Este header
      // sólo lo lee Vercel: no llega al navegador ni a otros CDN.
      ...['/movie/:id(\\d+)', '/tv/:id(\\d+)', '/tv/:id(\\d+)/temporada/:n(\\d+)', '/actor/:id(\\d+)', '/director/:id(\\d+)'].map(source => ({
        source,
        headers: [{ key: 'Vercel-CDN-Cache-Control', value: 'max-age=86400' }],
      })),
      // La etiqueta de la ficha de cada película y serie, para poder borrar su
      // copia de la CDN (`tagFicha` en lib/creator-recommendations.ts): el
      // panel de recomendaciones la purga al cargar o borrar una.
      ...(['movie', 'tv'] as const).map(tipo => ({
        source: `/${tipo}/:id(\\d+)`,
        headers: [{ key: 'Vercel-Cache-Tag', value: `ficha-${tipo}-:id` }],
      })),
    ]
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
      {
        // Supabase Storage for user avatars
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        // Flag images
        protocol: 'https',
        hostname: 'flagcdn.com',
      },
    ],
  },
};

const withMDX = createMDX({ extension: /\.mdx?$/ })

export default withMDX(withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workboxOptions: {
    importScripts: ['/custom-sw.js'] as any,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/image\.tmdb\.org\/t\/p\/.*/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'tmdb-images',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          },
        },
      },
      {
        urlPattern: /^https:\/\/.+/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages-cache',
          networkTimeoutSeconds: 10,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 * 24,
          },
        },
      },
    ],
  },
})(nextConfig))
