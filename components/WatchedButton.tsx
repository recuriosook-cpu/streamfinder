'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle, Calendar, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { addPoints } from '@/lib/points'
import { toast } from 'sonner'

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
}: Props) {
  // Stable client instance — never recreated on re-render
  const supabase = useRef(createClient()).current

  const [isWatched,     setIsWatched]     = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [userId,        setUserId]        = useState<string | null>(null)
  const [showPopup,     setShowPopup]     = useState(false)
  const [showDatePicker,setShowDatePicker]= useState(false)
  const [customDate,    setCustomDate]    = useState('')
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const router   = useRouter()

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
  }, [mediaId, mediaType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close popup on outside click
  useEffect(() => {
    if (!showPopup) return
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        closePopup()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPopup])

  function closePopup() {
    setShowPopup(false)
    setShowDatePicker(false)
    setCustomDate('')
    setSaveError(null)
  }

  const insertWatched = async (watchedAt: string) => {
    if (!userId) return
    setLoading(true)
    setSaveError(null)

    // Only use columns that exist in the base schema (supabase-profile-setup.sql)
    // genre_ids / runtime / seasons_count require supabase-watched-update.sql
    const { error } = await supabase.from('watched').upsert(
      {
        user_id:    userId,
        media_id:   mediaId,
        media_type: mediaType,
        title,
        poster_path: posterPath,
        watched_at:  watchedAt,
      },
      { onConflict: 'user_id,media_id,media_type' }
    )

    if (error) {
      console.error('[WatchedButton] upsert error:', error)
      setSaveError('No se pudo guardar. Intentá de nuevo.')
      toast.error('No se pudo guardar. Intentá de nuevo.')
      setLoading(false)
      return
    }

    addPoints(userId, mediaType === 'movie' ? 3 : 5)
    setIsWatched(true)
    toast.success('¡Marcado como visto!')
    closePopup()
    setLoading(false)
  }

  const handleButtonClick = () => {
    if (!userId) { router.push('/auth'); return }
    if (isWatched) {
      setLoading(true)
      supabase.from('watched')
        .delete()
        .eq('user_id', userId)
        .eq('media_id', mediaId)
        .eq('media_type', mediaType)
        .then(({ error }) => {
          if (error) {
            console.error('[WatchedButton] delete error:', error)
            toast.error('No se pudo actualizar. Intentá de nuevo.')
          } else {
            setIsWatched(false)
          }
          setLoading(false)
        })
      return
    }
    setSaveError(null)
    setShowPopup(true)
    setShowDatePicker(false)
    setCustomDate('')
  }

  const handleToday = () => insertWatched(new Date().toISOString())

  const handleConfirmDate = () => {
    if (!customDate) return
    insertWatched(new Date(`${customDate}T12:00:00`).toISOString())
  }

  return (
    <div className="relative w-full sm:w-auto" ref={popupRef}>
      <button
        onClick={handleButtonClick}
        disabled={loading}
        className={`flex items-center justify-center sm:justify-start gap-2 px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed w-full sm:w-auto ${
          isWatched
            ? 'bg-[#E5EB00] hover:bg-[#FFFD02] text-black'
            : 'bg-zinc-700 hover:bg-zinc-600 text-white'
        }`}
      >
        <CheckCircle size={18} fill={isWatched ? 'currentColor' : 'none'} />
        {isWatched ? 'Ya la vi ✓' : 'Ya la vi'}
      </button>

      {showPopup && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-[#1C1C27] border border-[#2A2A3A] rounded-xl shadow-2xl p-4 w-64">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white">¿Cuándo lo viste?</p>
            <button onClick={closePopup} className="text-[#A0A0B0] hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>

          {saveError && (
            <p className="text-xs text-red-400 mb-3 bg-red-900/30 rounded-lg px-3 py-2">
              {saveError}
            </p>
          )}

          {!showDatePicker ? (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleToday}
                disabled={loading}
                className="w-full bg-[#E5EB00] hover:bg-[#FFFD02] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-medium py-2 rounded-lg transition-colors"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    Guardando...
                  </span>
                ) : 'Hoy'}
              </button>
              <button
                onClick={() => setShowDatePicker(true)}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg transition-colors"
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
                className="w-full bg-zinc-700 border border-zinc-600 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-[#FFFD02]"
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
                  disabled={!customDate || loading}
                  className="flex-1 bg-[#E5EB00] hover:bg-[#FFFD02] disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-medium py-2 rounded-lg transition-colors"
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
