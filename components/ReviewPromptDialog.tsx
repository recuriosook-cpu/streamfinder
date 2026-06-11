'use client'

import { useState } from 'react'

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.glynbox.app'

type Status = 'later' | 'reviewed' | 'declined'

interface ReviewPromptDialogProps {
  isOpen: boolean
  onClose: () => void
}

export default function ReviewPromptDialog({ isOpen, onClose }: ReviewPromptDialogProps) {
  const [busy, setBusy] = useState(false)

  async function updateStatus(status: Status) {
    if (busy) return
    setBusy(true)
    try {
      await fetch('/api/update-review-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    } catch { /* non-blocking */ }
    setBusy(false)
    onClose()
  }

  async function handleReview() {
    await updateStatus('reviewed')
    window.open(PLAY_STORE_URL, '_blank', 'noopener,noreferrer')
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ animation: 'reviewPromptFadeIn 200ms ease-out' }}
      onClick={e => { if (e.target === e.currentTarget) updateStatus('later') }}
    >
      <style>{`
        @keyframes reviewPromptFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes reviewPromptSlideUp {
          from { opacity: 0; transform: scale(0.95) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        .review-prompt-card {
          animation: reviewPromptSlideUp 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }
      `}</style>

      <div className="review-prompt-card bg-[#13131A] border border-[#2A2A3A] rounded-2xl w-full max-w-sm shadow-2xl">
        {/* Stars header */}
        <div className="pt-7 pb-1 px-6 text-center">
          <div className="text-4xl leading-none mb-4 select-none">⭐⭐⭐⭐⭐</div>
          <h2 className="text-lg font-bold text-white mb-2">
            ¿Te está sirviendo Glynbox?
          </h2>
          <p className="text-sm text-[#A0A0B0] leading-relaxed">
            Si la usás y te gusta, dejame una reseña en Play Store.
            Las reseñas son lo que más ayuda a que más gente descubra Glynbox 🎬
          </p>
        </div>

        {/* Buttons */}
        <div className="px-6 pt-5 pb-6 flex flex-col gap-3">
          <button
            onClick={handleReview}
            disabled={busy}
            className="w-full py-3 rounded-xl font-semibold text-sm text-black transition-all active:scale-95 hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: '#FFFD02' }}
          >
            Sí, dejar reseña ⭐
          </button>

          <button
            onClick={() => updateStatus('later')}
            disabled={busy}
            className="w-full py-3 rounded-xl text-sm font-medium text-white border border-[#2A2A3A] hover:bg-[#1C1C27] transition-colors disabled:opacity-50"
          >
            Más tarde
          </button>

          <button
            onClick={() => updateStatus('declined')}
            disabled={busy}
            className="w-full py-2 rounded-xl text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
          >
            No, gracias
          </button>
        </div>
      </div>
    </div>
  )
}
