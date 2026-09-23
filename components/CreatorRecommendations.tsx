'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Play, X } from 'lucide-react'
import { creatorNames, type CreatorRecommendation } from '@/lib/creator-recommendations'
import { isRunningInApp } from '@/lib/app-mode'
import { track } from '@/lib/analytics'

/**
 * "Recomendado por Fer Lage": la portada del video de Instagram donde el
 * creador habla del título.
 *
 * A diferencia de `VpnSuggestion`, este bloque SÍ va en el HTML que cachea el
 * CDN: lo arma el servidor con datos que son iguales para todos, así que no hay
 * nada que esperar a hidratar. El título sale de los nombres de los creadores,
 * así que con dos creadores dice "Recomendado por Fer Lage y Ana".
 *
 * Cada miniatura es un link real al post. En la web, el click se intercepta y
 * abre un modal con el reproductor de Instagram (`/p/<código>/embed/`, el único
 * endpoint de Instagram que se deja meter en un iframe). Sin JavaScript, o
 * adentro de la TWA vieja, el link se sigue normal y abre Instagram: en una app
 * el reproductor embebido no tiene sentido, y la app nativa hace lo mismo.
 *
 * Hay reels con la inserción deshabilitada (probablemente por la música): el
 * iframe les muestra el cartel de error de Instagram. Esos vienen marcados con
 * `embeddable = false` desde el script de carga y van directo a Instagram,
 * sin modal; un salto a Instagram es mejor que un cartel de error. El botón
 * "Ver en Instagram" del modal queda igual como salida, por si Instagram le
 * deshabilita la inserción a un post después de cargado.
 */

interface Props {
  items: CreatorRecommendation[]
  mediaType: 'movie' | 'tv'
  mediaId: number
}

const postUrl = (code: string) => `https://www.instagram.com/p/${code}/`

export default function CreatorRecommendations({ items, mediaType, mediaId }: Props) {
  const [open, setOpen] = useState<CreatorRecommendation | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (items.length === 0) return null

  const onClick = (e: React.MouseEvent, item: CreatorRecommendation) => {
    track('recomendacion_click', {
      creador:    item.creator.username,
      media_type: mediaType,
      media_id:   mediaId,
    })
    // Cmd/Ctrl+click o click del medio: que abra la pestaña como cualquier link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    if (isRunningInApp() || !item.embeddable) return
    e.preventDefault()
    setOpen(item)
  }

  return (
    <div className="mt-10">
      <h2 className="text-xl font-bold mb-4">Recomendado por {creatorNames(items)}</h2>

      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
        {items.map(item => (
          <a
            key={item.instagramCode}
            href={postUrl(item.instagramCode)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => onClick(e, item)}
            aria-label={`Ver el video de ${item.creator.name} en Instagram`}
            className="group shrink-0 w-40 sm:w-44 bg-[#13131A] rounded-xl overflow-hidden ring-1 ring-white/10"
          >
            <div className="relative aspect-[9/16] bg-[#1C1C27]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.coverUrl}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/25 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Play size={24} fill="white" className="text-white ml-1" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2.5">
              <Avatar item={item} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{item.creator.name}</p>
                <p className="text-xs text-[#A0A0B0] truncate">@{item.creator.username}</p>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/*
        Portal a <body>: el contenedor de la ficha es `relative z-10`, y un
        modal adentro de ese contexto queda debajo de la barra de navegación
        (`sticky z-50`) por más z-index que tenga. `open` sólo existe después
        de un click, así que `document` siempre está definido acá.
      */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Video de ${open.creator.name}`}
        >
          <div className="relative w-full max-w-[400px]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setOpen(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
            >
              <X size={20} /> Cerrar
            </button>
            <div className="w-full rounded-xl overflow-hidden bg-white" style={{ height: 'min(740px, calc(100dvh - 140px))' }}>
              <iframe
                src={`${postUrl(open.instagramCode)}embed/`}
                className="w-full h-full"
                allow="autoplay; encrypted-media; fullscreen"
                title={`Video de ${open.creator.name}`}
              />
            </div>
            <a
              href={postUrl(open.instagramCode)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center rounded-full border border-[#FFFD02]/40 px-5 py-2.5 text-sm font-semibold text-[#FFFD02] hover:bg-[#FFFD02] hover:text-black transition-colors"
            >
              Ver en Instagram
            </a>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function Avatar({ item }: { item: CreatorRecommendation }) {
  if (!item.creator.avatarUrl) {
    return (
      <div className="w-7 h-7 shrink-0 rounded-full bg-[#1C1C27] flex items-center justify-center text-xs font-bold text-[#FFFD02]">
        {item.creator.name.charAt(0).toUpperCase()}
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={item.creator.avatarUrl} alt="" className="w-7 h-7 shrink-0 rounded-full object-cover" />
  )
}
