'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle, Calendar, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Props {
  mediaId: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string | null
  genreIds?: number[]
  runtime?: number
  seasonsCount?: number
}

export default function WatchedButton({
  mediaId, mediaType, title, posterPath,
  genreIds, runtime, seasonsCount,
}: Props) {
  const [isWatched, setIsWatched] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [showPopup, setShowPopup] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [customDate, setCustomDate] = useState('')
  const popupRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      const { data } = await supabase
        .from('watched')
        .select('id')
        .eq('user_id', user.id)
        .eq('media_id', mediaId)
        .eq('media_type', mediaType)
        .maybeSingle()
      setIsWatched(!!data)
      setLoading(false)
    }
    init()
  }, [mediaId, mediaType])

  // Close popup when clicking outside
  useEffect(() => {
    if (!showPopup) return
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowPopup(false)
        setShowDatePicker(false)
        setCustomDate('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPopup])

  const insertWatched = async (watchedAt: string) => {
    if (!userId) return
    setLoading(true)
    const { error } = await supabase.from('watched').insert({
      user_id: userId,
      media_id: mediaId,
      media_type: mediaType,
      title,
      poster_path: posterPath,
      genre_ids: genreIds ?? [],
      runtime: runtime ?? null,
      seasons_count: seasonsCount ?? null,
      watched_at: watchedAt,
    })
    if (error) {
      console.error('[WatchedButton] insert error:', error)
      setLoading(false)
      return
    }
    setIsWatched(true)
    setShowPopup(false)
    setShowDatePicker(false)
    setCustomDate('')
    setLoading(false)
  }

  const handleButtonClick = () => {
    if (!userId) { router.push('/auth'); return }
    if (isWatched) {
      // Toggle off: remove directly
      setLoading(true)
      supabase.from('watched').delete()
        .eq('user_id', userId).eq('media_id', mediaId).eq('media_type', mediaType)
        .then(() => { setIsWatched(false); setLoading(false) })
      return
    }
    setShowPopup(true)
    setShowDatePicker(false)
    setCustomDate('')
  }

  const handleToday = () => {
    insertWatched(new Date().toISOString())
  }

  const handleConfirmDate = () => {
    if (!customDate) return
    // Build a date at noon local time to avoid off-by-one UTC issues
    const iso = new Date(`${customDate}T12:00:00`).toISOString()
    insertWatched(iso)
  }

  return (
    <div className="relative" ref={popupRef}>
      <button
        onClick={handleButtonClick}
        disabled={loading}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
          isWatched
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
            : 'bg-zinc-700 hover:bg-zinc-600 text-white'
        }`}
      >
        <CheckCircle size={18} fill={isWatched ? 'currentColor' : 'none'} />
        {isWatched ? 'Ya la vi' : 'Ya la vi'}
      </button>

      {showPopup && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl p-4 w-64">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white">¿Cuándo lo viste?</p>
            <button
              onClick={() => { setShowPopup(false); setShowDatePicker(false); setCustomDate('') }}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {!showDatePicker ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleToday}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                Hoy
              </button>
              <button
                onClick={() => setShowDatePicker(true)}
                className="w-full flex items-center justify-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                <Calendar size={14} />
                Otra fecha
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="date"
                value={customDate}
                max={todayStr}
                onChange={e => setCustomDate(e.target.value)}
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-emerald-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm py-2 rounded-lg transition-colors"
                >
                  Atrás
                </button>
                <button
                  onClick={handleConfirmDate}
                  disabled={!customDate}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
