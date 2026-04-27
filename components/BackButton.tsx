'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function BackButton() {
  const router = useRouter()
  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-2 text-[#A0A0B0] hover:text-white mb-6 transition-colors"
    >
      <ArrowLeft size={16} /> Volver
    </button>
  )
}
