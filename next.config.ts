import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/siguiendo', destination: '/comunidad', permanent: true },
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

export default withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  workboxOptions: {
    // importScripts loads custom-sw.js (push + notificationclick handlers).
    // The file is served statically from /public/custom-sw.js → /custom-sw.js.
    // worker/index.js is also compiled by next-pwa as a secondary mechanism.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
})(nextConfig);
