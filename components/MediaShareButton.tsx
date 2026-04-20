'use client'

import { Share2 } from 'lucide-react'
import ShareDropdown from '@/components/ShareDropdown'

const BASE = 'https://streamfinder-lilac.vercel.app'

interface Props {
  mediaId: number
  mediaType: 'movie' | 'tv'
  title: string
  year?: string | null
  score?: number | null
}

export default function MediaShareButton({ mediaId, mediaType, title, year, score }: Props) {
  const url   = `${BASE}/${mediaType}/${mediaId}`
  const label = year ? `"${title}" (${year})` : `"${title}"`
  const stars = score ? `⭐ ${score.toFixed(1)}/10` : ''

  const waText    = encodeURIComponent(`Te recomiendo ${label} en StreamFinder 🎬\n${stars}\n👉 ${url}`)
  const tweetText = encodeURIComponent(`Acabo de ver ${label} 🎬 ${stars} #StreamFinder`)

  const whatsappUrl = `https://wa.me/?text=${waText}`
  const twitterUrl  = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(url)}`

  return (
    <ShareDropdown
      whatsappUrl={whatsappUrl}
      twitterUrl={twitterUrl}
      copyUrl={url}
      align="left"
      trigger={
        <span className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-zinc-700 hover:bg-zinc-600 text-white transition-colors">
          <Share2 size={18} />
          Compartir
        </span>
      }
    />
  )
}
