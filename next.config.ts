import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
      {
        // Company logos for providers not in TMDB
        protocol: 'https',
        hostname: 'logo.clearbit.com',
      },
    ],
  },
};

export default nextConfig;
