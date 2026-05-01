'use client'

import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 text-center"
      style={{ backgroundColor: '#0A0A0F' }}
    >
      {/* Decorative film-grain background */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 max-w-md">
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Glynbox" style={{ height: 36, objectFit: 'contain' }} />

        {/* 404 */}
        <div
          className="text-[clamp(96px,20vw,160px)] font-extrabold leading-none"
          style={{ color: '#FFFD02', fontVariantNumeric: 'tabular-nums' }}
        >
          404
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
          Esta página no existe
        </h1>

        {/* Subtitle */}
        <p className="text-[#A0A0B0] text-sm sm:text-base leading-relaxed">
          La película que buscás no está en nuestra base de datos...
          <br />o quizás nunca existió.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-2">
          <Link
            href="/"
            className="px-6 py-3 rounded-xl text-sm font-semibold text-black transition-colors text-center"
            style={{ backgroundColor: '#FFFD02' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#E5EB00' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#FFFD02' }}
          >
            Volver al inicio
          </Link>
          <Link
            href="/que-ver"
            className="px-6 py-3 rounded-xl text-sm font-semibold text-white border border-[#2A2A3A] hover:border-[#FFFD02] hover:text-[#FFFD02] transition-colors text-center"
          >
            Buscar algo
          </Link>
        </div>

        {/* Decorative film strip */}
        <div className="flex gap-2 mt-6 opacity-20">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="w-8 h-10 rounded-sm border border-white/30 flex flex-col justify-between py-1 px-0.5"
            >
              <div className="h-1 bg-white/40 rounded-full" />
              <div className="h-1 bg-white/40 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
