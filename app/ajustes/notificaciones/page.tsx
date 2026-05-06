'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase'

interface NotifPrefs {
  likes:          boolean
  follows:        boolean
  comments:       boolean
  replies:        boolean
  mentions:       boolean
  level_up:       boolean
  actor_birthday: boolean
  new_release:    boolean
}

const DEFAULT_PREFS: NotifPrefs = {
  likes: true, follows: true, comments: true, replies: true,
  mentions: true, level_up: true, actor_birthday: true, new_release: true,
}

const TOGGLES: { key: keyof NotifPrefs; label: string; description: string }[] = [
  { key: 'likes',          label: 'Likes en mis reseñas',            description: 'Cuando alguien le da me gusta a una reseña tuya' },
  { key: 'follows',        label: 'Nuevos seguidores',               description: 'Cuando alguien empieza a seguirte' },
  { key: 'comments',       label: 'Comentarios en mis reseñas',      description: 'Cuando alguien comenta en tus reseñas' },
  { key: 'replies',        label: 'Respuestas a mis comentarios',    description: 'Cuando alguien responde uno de tus comentarios' },
  { key: 'mentions',       label: 'Menciones con @',                 description: 'Cuando alguien te menciona en una reseña o comentario' },
  { key: 'level_up',       label: 'Subida de nivel',                 description: 'Cuando acumulás suficientes puntos para subir de nivel' },
  { key: 'actor_birthday', label: 'Cumpleaños de actores que sigo',  description: 'Recordatorio cuando cumple años un actor que seguís' },
  { key: 'new_release',    label: 'Estrenos de actores que sigo',    description: 'Cuando se estrena algo nuevo de un actor que seguís' },
]

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
        on ? 'bg-[#FFFD02] border-[#FFFD02]' : 'bg-zinc-700 border-zinc-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-black shadow transform transition-transform duration-200 mt-[2px] ${
          on ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export default function NotificacionesPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading,  setLoading]  = useState(true)
  const [userId,   setUserId]   = useState<string | null>(null)
  const [prefs,    setPrefs]    = useState<NotifPrefs>(DEFAULT_PREFS)
  const [toast,    setToast]    = useState<string | null>(null)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      setUserId(data.user.id)
      supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', data.user.id)
        .maybeSingle()
        .then(({ data: p }) => {
          if (p?.notification_preferences) {
            setPrefs({ ...DEFAULT_PREFS, ...(p.notification_preferences as Partial<NotifPrefs>) })
          }
          setLoading(false)
        })
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(key: keyof NotifPrefs, value: boolean) {
    if (!userId || saving) return
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    setSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({ notification_preferences: next })
      .eq('id', userId)

    if (error) {
      setPrefs(prefs) // revert on error
      setToast('Error al guardar. Intentá de nuevo.')
    } else {
      setToast('Guardado')
    }

    setSaving(false)
    setTimeout(() => setToast(null), 2000)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#FFFD02] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <div className="max-w-lg mx-auto px-4 py-8">

        <div className="flex items-center gap-3 mb-8">
          <Link href="/ajustes" className="text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-white">Notificaciones</h1>
        </div>

        <div className="bg-[#13131A] border border-[#2A2A3A] rounded-2xl overflow-hidden divide-y divide-[#2A2A3A]/50">
          {TOGGLES.map(({ key, label, description }) => (
            <div key={key} className="flex items-center gap-4 px-4 py-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{description}</p>
              </div>
              <Toggle on={prefs[key]} onChange={v => handleToggle(key, v)} />
            </div>
          ))}
        </div>

        <p className="text-xs text-zinc-600 text-center mt-6">
          Los cambios se guardan automáticamente.
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-[#13131A] border border-[#FFFD02]/40 rounded-full shadow-2xl text-sm font-medium text-[#FFFD02] pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  )
}
