'use client'

import { Share2 } from 'lucide-react'
import ShareDropdown from '@/components/ShareDropdown'
import { mediaImagePath } from '@/lib/share-urls'
import { useIdioma } from '@/components/useIdioma'
import { rutaFicha } from '@/lib/idioma'

// Con www: es el dominio que abre la app en iPhone (ver public/.well-known).
const BASE = 'https://www.glynbox.com'

interface Props {
  mediaId: number
  mediaType: 'movie' | 'tv'
  title: string
  year?: string | null
  score?: number | null
}

export default function MediaShareButton({ mediaId, mediaType, title, year, score }: Props) {
  const idioma = useIdioma()
  const en    = idioma === 'en'
  const url   = `${BASE}${rutaFicha(idioma, mediaType, mediaId)}`
  const label = year ? `"${title}" (${year})` : `"${title}"`
  const stars = score ? `⭐ ${score.toFixed(1)}/10` : ''

  const waText    = encodeURIComponent(en
    ? `I recommend ${label} on Glynbox 🎬\n${stars}\n👉 ${url}`
    : `Te recomiendo ${label} en Glynbox 🎬\n${stars}\n👉 ${url}`)
  const tweetText = encodeURIComponent(en
    ? `Just watched ${label} 🎬 ${stars} #Glynbox`
    : `Acabo de ver ${label} 🎬 ${stars} #Glynbox`)

  const whatsappUrl = `https://wa.me/?text=${waText}`
  const twitterUrl  = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(url)}`

  return (
    <ShareDropdown
      whatsappUrl={whatsappUrl}
      twitterUrl={twitterUrl}
      copyUrl={url}
      shareText={en ? `I recommend ${label} on Glynbox` : `Te recomiendo ${label} en Glynbox`}
      image={{ historia: mediaImagePath(mediaType, mediaId, 'historia'), nombre: 'glynbox' }}
      align="left"
      trigger={
        <span className="flex items-center justify-center sm:justify-start gap-2 px-4 py-2 rounded-lg font-medium bg-zinc-700 hover:bg-zinc-600 text-white transition-colors w-full sm:w-auto">
          <Share2 size={18} />
          {en ? 'Share' : 'Compartir'}
        </span>
      }
    />
  )
}
