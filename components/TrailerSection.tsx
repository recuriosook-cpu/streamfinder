'use client'

import { useState } from 'react'
import { Play, X } from 'lucide-react'

export default function TrailerSection({ videoKey }: { videoKey: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-10">
      <h2 className="text-xl font-bold mb-4">Trailer oficial</h2>

      {/* Thumbnail */}
      <div
        className="relative cursor-pointer rounded-xl overflow-hidden max-w-2xl group"
        style={{ aspectRatio: '16/9' }}
        onClick={() => setOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://img.youtube.com/vi/${videoKey}/hqdefault.jpg`}
          alt="Trailer"
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.src = `https://img.youtube.com/vi/${videoKey}/sddefault.jpg`
          }}
        />
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Play size={28} fill="white" className="text-white ml-1" />
          </div>
        </div>
      </div>

      {/* Lightbox modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="relative w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setOpen(false)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
            >
              <X size={20} /> Cerrar
            </button>
            <div className="w-full rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <iframe
                src={`https://www.youtube.com/embed/${videoKey}?autoplay=1`}
                className="w-full h-full"
                allowFullScreen
                allow="autoplay; encrypted-media"
                title="Trailer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
